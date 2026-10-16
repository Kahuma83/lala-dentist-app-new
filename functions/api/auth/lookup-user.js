const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

export const onRequestPost = async ({ request, env }) => {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[pages-function] Auth lookup is missing server-side Supabase configuration.");
    return jsonResponse({ message: "Layanan login staf belum dikonfigurasi di server." }, 500);
  }

  let identifier;
  try {
    const body = await request.json();
    identifier = String(body?.usernameOrEmail || "").trim().toLowerCase();
  } catch {
    return jsonResponse({ message: "Permintaan pencarian akun tidak valid." }, 400);
  }

  if (!identifier || identifier.includes("@")) {
    return jsonResponse({ message: "Username wajib diisi." }, 400);
  }

  const username = identifier.replace(/[^a-z0-9_.-]/g, "");
  if (!username || username !== identifier) {
    return jsonResponse({ message: "Username tidak valid." }, 400);
  }

  const query = new URLSearchParams({
    select: "email,active",
    username: `eq.${username}`,
    limit: "2"
  });

  let supabaseResponse;
  try {
    supabaseResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/user_accounts?${query}`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json"
      }
    });
  } catch (error) {
    console.error("[pages-function] Supabase auth lookup request failed:", error);
    return jsonResponse({ message: "Gagal terhubung ke layanan akun login." }, 502);
  }

  if (!supabaseResponse.ok) {
    console.error("[pages-function] Supabase auth lookup returned HTTP", supabaseResponse.status);
    return jsonResponse({ message: "Gagal membaca data akun login dari database." }, 502);
  }

  let accounts;
  try {
    accounts = await supabaseResponse.json();
  } catch (error) {
    console.error("[pages-function] Supabase auth lookup returned invalid JSON:", error);
    return jsonResponse({ message: "Respons data akun login tidak valid." }, 502);
  }

  if (!Array.isArray(accounts)) {
    console.error("[pages-function] Supabase auth lookup returned an unexpected response.");
    return jsonResponse({ message: "Respons data akun login tidak valid." }, 502);
  }

  if (accounts.length > 1) {
    return jsonResponse({ message: "Username terdaftar lebih dari satu kali. Hubungi administrator." }, 409);
  }

  const account = accounts[0];
  if (!account) {
    return jsonResponse({ message: "Akun tidak ditemukan." }, 404);
  }

  return jsonResponse({
    account: {
      email: account.email || null,
      active: account.active
    }
  });
};
