import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../../functions/api/auth/lookup-user.js";

const createRequest = (body: unknown) => new Request("https://clinic.example/api/auth/lookup-user", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

const environment = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_server-only-test-key"
};

describe("Cloudflare Pages staff username lookup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a staff account using a new secret API key in the apikey header only", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { email: "cece@example.com", active: true }
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost({
      request: createRequest({ usernameOrEmail: "CECE" }),
      env: environment
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      account: { email: "cece@example.com", active: true }
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("username=eq.cece");
    expect(fetchMock.mock.calls[0][1].headers.apikey).toBe(environment.SUPABASE_SECRET_KEY);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("continues supporting legacy service-role keys for existing deployments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { email: "cece@example.com", active: true }
    ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const legacyKey = "legacy-server-only-test-key";
    const response = await onRequestPost({
      request: createRequest({ usernameOrEmail: "cece" }),
      env: {
        SUPABASE_URL: environment.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: legacyKey
      }
    });

    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][1].headers.apikey).toBe(legacyKey);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${legacyKey}`);
  });

  it("returns an explicit configuration error when the server secret is absent", async () => {
    const response = await onRequestPost({
      request: createRequest({ usernameOrEmail: "cece" }),
      env: { SUPABASE_URL: environment.SUPABASE_URL }
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Layanan login staf belum dikonfigurasi di server."
    });
  });

  it("rejects usernames that could alter the database filter", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost({
      request: createRequest({ usernameOrEmail: "cece,role.eq.SUPER_ADMIN" }),
      env: environment
    });

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not found when no account matches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("[]", { status: 200 })));

    const response = await onRequestPost({
      request: createRequest({ usernameOrEmail: "missing_user" }),
      env: environment
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ message: "Akun tidak ditemukan." });
  });
});
