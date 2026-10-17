import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../../website/functions/api/site-content.js";
import { onRequestGet as onRequestMedia } from "../../website/functions/api/site-media.js";

const makeContext = (
  url = "https://laladentist.id/api/site-content",
  env: Record<string, string> = {}
) => ({
  request: new Request(url),
  env
});

describe("public website content endpoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns an explicit configuration error when Supabase variables are missing", async () => {
    const response = await onRequestGet(makeContext());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Konfigurasi konten website belum tersedia." });
  });

  it("rejects malformed article slugs before requesting public data", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const context = makeContext("https://laladentist.id/api/site-content?slug=one%2Cstatus.eq.draft", {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key"
    });

    const response = await onRequestGet(context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ settings: null, promotions: [], articles: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("only requests public, published content and returns the requested records", async () => {
    const payloads = [
      [{ hero_title: "Hero terbit" }],
      [{ title: "Promo aktif" }],
      [{ slug: "tips-gigi", title: "Tips gigi" }]
    ];
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(payloads.shift()), { status: 200, headers: { "content-type": "application/json" } })
    );
    const response = await onRequestGet(makeContext("https://laladentist.id/api/site-content?slug=tips-gigi", {
      SUPABASE_URL: "https://example.supabase.co/",
      SUPABASE_ANON_KEY: "public-anon-key"
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      settings: { hero_title: "Hero terbit" },
      promotions: [{ title: "Promo aktif" }],
      articles: [{ slug: "tips-gigi", title: "Tips gigi" }]
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const urls = fetchSpy.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls[1].searchParams.get("status")).toBe("eq.published");
    expect(urls[1].searchParams.get("or")).toContain("ends_at.gt.");
    expect(urls[2].searchParams.get("status")).toBe("eq.published");
    expect(urls[2].searchParams.get("slug")).toBe("eq.tips-gigi");
    for (const [, options] of fetchSpy.mock.calls) {
      expect(options?.headers).toMatchObject({ apikey: "public-anon-key", authorization: "Bearer public-anon-key" });
    }
  });

  it("returns an explicit upstream error when Supabase rejects a content request", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));

    const response = await onRequestGet(makeContext(undefined, {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "public-anon-key"
    }));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Konten website gagal dimuat dari penyimpanan." });
  });

  it("serves image uploads through the long-lived website edge cache", async () => {
    const entries = new Map<string, Response>();
    const cache = {
      match: vi.fn(async (request: Request) => entries.get(request.url)?.clone()),
      put: vi.fn(async (request: Request, response: Response) => { entries.set(request.url, response.clone()); })
    };
    vi.stubGlobal("caches", { default: cache });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/webp" } })
    );
    const context = {
      ...makeContext("https://laladentist.id/api/site-media?path=website%2Farticles%2Fabc-123.webp", {
        SUPABASE_URL: "https://example.supabase.co"
      }),
      waitUntil: vi.fn((promise: Promise<unknown>) => { void promise; })
    };

    const first = await onRequestMedia(context);
    const second = await onRequestMedia(context);

    expect(first.headers.get("cache-control")).toContain("max-age=31536000");
    expect(second.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://example.supabase.co/storage/v1/object/public/clinic-public-media/website/articles/abc-123.webp"
    );
  });

  it("rejects media paths outside CMS upload folders without contacting Supabase", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await onRequestMedia(makeContext("https://laladentist.id/api/site-media?path=../../private.jpg", {
      SUPABASE_URL: "https://example.supabase.co"
    }));

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
