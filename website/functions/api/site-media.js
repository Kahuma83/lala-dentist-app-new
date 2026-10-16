const MEDIA_CACHE_SECONDS = 31536000;
const ALLOWED_MEDIA_PATH = /^website\/(?:hero|promotions|articles)\/[A-Za-z0-9-]+\.(?:jpg|png|webp)$/;

export async function onRequestGet(context) {
  const { request, env } = context;
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!ALLOWED_MEDIA_PATH.test(path)) {
    return new Response("Gambar tidak ditemukan.", { status: 404 });
  }
  if (!env.SUPABASE_URL) {
    return new Response("Konfigurasi media website belum tersedia.", { status: 503 });
  }

  return withMediaCache(request, context, async () => {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    let upstream;
    try {
      upstream = await fetch(
        `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/clinic-public-media/${encodedPath}`
      );
    } catch (error) {
      console.error("Website media request failed:", error);
      return new Response("Gambar gagal dimuat.", { status: 502 });
    }

    if (!upstream.ok) return new Response("Gambar tidak ditemukan.", { status: upstream.status });
    const contentType = upstream.headers.get("content-type") || "";
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType.split(";")[0].trim().toLowerCase())) {
      return new Response("Format gambar tidak didukung.", { status: 415 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": `public, max-age=${MEDIA_CACHE_SECONDS}, s-maxage=${MEDIA_CACHE_SECONDS}, immutable`,
        "cdn-cache-control": `public, max-age=${MEDIA_CACHE_SECONDS}`,
        "x-content-type-options": "nosniff"
      }
    });
  });
}

async function withMediaCache(request, context, load) {
  if (typeof caches === "undefined" || !caches.default) return load();

  const cache = caches.default;
  try {
    const cached = await cache.match(request);
    if (cached) return cached;
  } catch (cacheError) {
    console.error("Website media edge cache lookup failed:", cacheError);
  }

  const response = await load();
  if (!response.ok) return response;

  const store = cache.put(request, response.clone()).catch((cacheError) => {
    console.error("Website media edge cache write failed:", cacheError);
  });
  if (typeof context.waitUntil === "function") context.waitUntil(store);
  else await store;
  return response;
}
