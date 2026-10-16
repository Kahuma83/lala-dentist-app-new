const CONTENT_CACHE_SECONDS = 300;

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, max-age=60, s-maxage=${CONTENT_CACHE_SECONDS}`,
      "cdn-cache-control": `public, max-age=${CONTENT_CACHE_SECONDS}`
    }
  });

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    return jsonResponse({ error: "Konfigurasi konten website belum tersedia." }, 503);
  }

  const slug = new URL(request.url).searchParams.get("slug");
  if (slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return jsonResponse({ settings: null, promotions: [], articles: [] });
  }
  const cacheUrl = new URL(request.url);
  cacheUrl.search = slug ? new URLSearchParams({ slug }).toString() : "";
  const cacheRequest = new Request(cacheUrl, { method: "GET" });
  return withEdgeCache(cacheRequest, context, async () => {
    return loadPublicContent(request, env);
  });
}

async function loadPublicContent(request, env) {
  const endpoint = `${env.SUPABASE_URL.replace(/\/$/, "")}/rest/v1`;
  const now = new Date().toISOString();
  const slug = new URL(request.url).searchParams.get("slug");
  const articleQuery = new URLSearchParams({
    select: "id,title,slug,excerpt,content,category,cover_image_url,published_at",
    status: "eq.published",
    published_at: `lte.${now}`,
    order: "published_at.desc",
    limit: slug ? "1" : "3"
  });
  if (slug) articleQuery.set("slug", `eq.${slug}`);

  const requests = [
    fetch(`${endpoint}/website_settings?${new URLSearchParams({ select: "hero_title,hero_description,hero_image_url,hero_button_text,hero_button_url", id: "eq.main", limit: "1" })}`, { headers: restHeaders(env) }),
    fetch(`${endpoint}/website_promotions?${new URLSearchParams({ select: "id,title,description,image_url,starts_at,ends_at", status: "eq.published", starts_at: `lte.${now}`, or: `(ends_at.is.null,ends_at.gt.${now})`, order: "starts_at.desc", limit: "6" })}`, { headers: restHeaders(env) }),
    fetch(`${endpoint}/website_articles?${articleQuery}`, { headers: restHeaders(env) })
  ];

  try {
    const responses = await Promise.all(requests);
    if (responses.some((response) => !response.ok)) {
      return jsonResponse({ error: "Konten website gagal dimuat dari penyimpanan." }, 502);
    }
    const [settings, promotions, articles] = await Promise.all(responses.map((response) => response.json()));
    return jsonResponse({ settings: settings[0] || null, promotions, articles });
  } catch (error) {
    console.error("Website content request failed:", error);
    return jsonResponse({ error: "Konten website gagal dimuat dari penyimpanan." }, 502);
  }
}

function restHeaders(env) {
  return {
    apikey: env.SUPABASE_ANON_KEY,
    authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
  };
}

async function withEdgeCache(request, context, load) {
  if (typeof caches === "undefined" || !caches.default) {
    return load();
  }

  const cache = caches.default;
  try {
    const cached = await cache.match(request);
    if (cached) return cached;
  } catch (cacheError) {
    console.error("Website edge cache lookup failed:", cacheError);
  }

  const response = await load();
  if (!response.ok) return response;

  const store = cache.put(request, response.clone()).catch((cacheError) => {
    console.error("Website edge cache write failed:", cacheError);
  });
  if (typeof context.waitUntil === "function") context.waitUntil(store);
  else await store;
  return response;
}
