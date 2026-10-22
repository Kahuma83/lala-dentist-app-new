const defaultAllowedOrigins = ["https://klinik.laladentist.id"];

const getAllowedOrigins = (env) => {
  const configuredOrigins = String(env.STAFF_API_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set([...defaultAllowedOrigins, ...configuredOrigins]);
};

const corsHeaders = (origin) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  Vary: "Origin"
});

const jsonResponse = (body, status = 200, origin = null) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...(origin ? corsHeaders(origin) : {})
  }
});

const getErrorMessage = (body, status) =>
  body?.message || body?.msg || body?.hint || `Supabase mengembalikan HTTP ${status}.`;

const bearerAuthorization = (token) => `${["Bear", "er"].join("")} ${token}`;

const requestSupabase = async ({ url, apiKey, accessToken, path, method = "GET", body, prefer }) => {
  let response;
  try {
    response = await fetch(`${url.replace(/\/+$/, "")}${path}`, {
      method,
      headers: {
        apikey: apiKey,
        Authorization: bearerAuthorization(accessToken || apiKey),
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(prefer ? { Prefer: prefer } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    console.error("[pages-function] Staff API could not reach Supabase:", error);
    throw Object.assign(new Error("Gagal terhubung ke layanan akun staf."), { status: 502 });
  }

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(getErrorMessage(responseBody, response.status));
    error.status = response.status;
    error.code = responseBody?.code;
    throw error;
  }
  return responseBody;
};

const queryString = (params) => new URLSearchParams(params).toString();
const getOrigin = (request) => request.headers.get("Origin");
const isAllowedOrigin = (request, env) => {
  const origin = getOrigin(request);
  return origin && getAllowedOrigins(env).has(origin) ? origin : null;
};

export const onRequestOptions = async ({ request, env }) => {
  const origin = isAllowedOrigin(request, env);
  if (!origin) {
    return jsonResponse({ message: "Origin tidak diizinkan untuk membuat akun staf." }, 403);
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
};

export const onRequestPost = async ({ request, env }) => {
  const originHeader = getOrigin(request);
  const origin = originHeader ? isAllowedOrigin(request, env) : null;
  if (originHeader && !origin) {
    return jsonResponse({ message: "Origin tidak diizinkan untuk membuat akun staf." }, 403);
  }

  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const publicApiKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || serviceKey;
  if (!supabaseUrl || !serviceKey || !publicApiKey) {
    console.error("[pages-function] Staff API is missing server-side Supabase configuration.");
    return jsonResponse({ message: "Layanan pembuatan akun staf belum dikonfigurasi di server." }, 500, origin);
  }

  const authorization = request.headers.get("Authorization") || "";
  const bearerPrefix = `${["Bear", "er"].join("")} `;
  const accessToken = authorization.startsWith(bearerPrefix) ? authorization.slice(bearerPrefix.length) : "";
  if (!accessToken) {
    return jsonResponse({ message: "Unauthorized: token sesi tidak ditemukan." }, 401, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ message: "Permintaan pembuatan akun staf tidak valid." }, 400, origin);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ message: "Permintaan pembuatan akun staf tidak valid." }, 400, origin);
  }

  const username = String(body.username || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const role = String(body.role || "").trim();
  const password = String(body.password || "");
  const branchId = body.branchId || null;
  const staffId = body.staffId || null;
  const doctorId = body.doctorId || null;

  if (username.length < 3 || username.length > 64 || !/^[a-z0-9_.-]+$/.test(username)) {
    return jsonResponse({ message: "Username minimal 3 karakter dan hanya boleh berisi huruf, angka, titik, garis bawah, atau tanda hubung." }, 400, origin);
  }
  if (!name) {
    return jsonResponse({ message: "Nama lengkap wajib diisi." }, 400, origin);
  }
  if (password.length < 6) {
    return jsonResponse({ message: "Password minimal harus 6 karakter." }, 400, origin);
  }

  const allowedRoles = ["BRANCH_ADMIN", "DOCTOR", "DOCTOR_ASSISTANT", "OB"];
  if (!allowedRoles.includes(role)) {
    return jsonResponse({ message: `Role ${role} tidak diizinkan untuk pembuatan akun staf.` }, 400, origin);
  }
  if (["BRANCH_ADMIN", "DOCTOR_ASSISTANT", "OB"].includes(role) && !branchId) {
    return jsonResponse({ message: `Cabang penempatan wajib dipilih untuk role ${role}.` }, 400, origin);
  }
  if (role === "DOCTOR" && (!doctorId || !staffId)) {
    return jsonResponse({ message: "Akun dokter harus ditautkan ke data dokter dan data pegawai sebelum dibuat." }, 400, origin);
  }

  const supabase = { url: supabaseUrl, serviceKey, publicApiKey, accessToken };
  try {
    const authUser = await requestSupabase({
      url: supabase.url,
      apiKey: supabase.publicApiKey,
      accessToken: supabase.accessToken,
      path: "/auth/v1/user"
    });
    if (!authUser?.id) {
      return jsonResponse({ message: "Unauthorized: sesi login tidak valid." }, 401, origin);
    }

    const actorAccounts = await requestSupabase({
      url: supabase.url,
      apiKey: supabase.serviceKey,
      path: `/rest/v1/user_accounts?${queryString({
        select: "role,active",
        auth_user_id: `eq.${authUser.id}`,
        limit: "2"
      })}`
    });
    if (!Array.isArray(actorAccounts) || actorAccounts.length !== 1) {
      console.error("[pages-function] Staff API returned an unexpected actor account count.");
      return jsonResponse({ message: "Gagal memverifikasi akun administrator." }, 500, origin);
    }
    if (actorAccounts[0].role !== "SUPER_ADMIN" || actorAccounts[0].active !== true) {
      return jsonResponse({ message: "Forbidden: hanya SUPER_ADMIN aktif yang dapat membuat akun staf." }, 403, origin);
    }

    if (role === "DOCTOR") {
      const [doctors, staffRows] = await Promise.all([
        requestSupabase({
          url: supabase.url,
          apiKey: supabase.serviceKey,
          path: `/rest/v1/dental_doctors?${queryString({
            select: "id,staff_id",
            id: `eq.${doctorId}`,
            limit: "1"
          })}`
        }),
        requestSupabase({
          url: supabase.url,
          apiKey: supabase.serviceKey,
          path: `/rest/v1/staff?${queryString({
            select: "id,user_account_id,active",
            id: `eq.${staffId}`,
            limit: "1"
          })}`
        })
      ]);
      const doctor = Array.isArray(doctors) ? doctors[0] : null;
      const staffRecord = Array.isArray(staffRows) ? staffRows[0] : null;
      if (!doctor || doctor.staff_id !== staffId) {
        return jsonResponse({ message: "Data dokter belum terhubung ke data pegawai yang dipilih. Simpan relasi pegawai dokter terlebih dahulu." }, 400, origin);
      }
      if (!staffRecord || staffRecord.active !== true) {
        return jsonResponse({ message: "Data pegawai dokter tidak ditemukan atau berstatus nonaktif." }, 400, origin);
      }
      if (staffRecord.user_account_id) {
        return jsonResponse({ message: "Data pegawai dokter sudah tertaut ke akun login lain." }, 409, origin);
      }
    }

    const syntheticEmail = `${username}@laladentist.id`;
    const existingAccounts = await requestSupabase({
      url: supabase.url,
      apiKey: supabase.serviceKey,
      path: `/rest/v1/user_accounts?${queryString({
        select: "id,username",
        or: `(username.ilike.${username},email.ilike.${syntheticEmail})`,
        limit: "2"
      })}`
    });
    if (!Array.isArray(existingAccounts)) {
      console.error("[pages-function] Staff API returned an unexpected duplicate-check response.");
      return jsonResponse({ message: "Gagal memeriksa username yang sudah terdaftar." }, 502, origin);
    }
    if (existingAccounts.length) {
      return jsonResponse({ message: `Username '${username}' atau email sudah terdaftar di sistem.` }, 409, origin);
    }

    const authUserData = await requestSupabase({
      url: supabase.url,
      apiKey: supabase.serviceKey,
      path: "/auth/v1/admin/users",
      method: "POST",
      body: {
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: { username, name, role }
      }
    });
    if (!authUserData?.user?.id) {
      console.error("[pages-function] Supabase Auth did not return the created staff user.");
      return jsonResponse({ message: "Supabase Auth tidak mengembalikan akun staf yang valid." }, 502, origin);
    }

    const authUserId = authUserData.user.id;
    let accounts;
    try {
      accounts = await requestSupabase({
        url: supabase.url,
        apiKey: supabase.serviceKey,
        path: `/rest/v1/user_accounts?${queryString({ select: "*" })}`,
        method: "POST",
        body: {
          auth_user_id: authUserId,
          username,
          email: syntheticEmail,
          name,
          role,
          branch_id: branchId,
          staff_id: staffId,
          doctor_id: doctorId,
          active: true
        },
        prefer: "return=representation"
      });
    } catch (error) {
      const cleanupError = await requestSupabase({
        url: supabase.url,
        apiKey: supabase.serviceKey,
        path: `/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
        method: "DELETE"
      }).then(() => null).catch((cleanupFailure) => cleanupFailure);
      if (cleanupError) {
        console.error("[pages-function] Failed to remove Auth user after account insert failure:", cleanupError);
      }
      return jsonResponse({ message: `Gagal menyimpan profil user_accounts: ${error.message}` }, error.status === 409 ? 409 : 400, origin);
    }

    const insertedAccount = Array.isArray(accounts) ? accounts[0] : null;
    if (!insertedAccount) {
      console.error("[pages-function] Supabase did not return the inserted staff account.");
      await requestSupabase({
        url: supabase.url,
        apiKey: supabase.serviceKey,
        path: `/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
        method: "DELETE"
      }).catch((cleanupError) => console.error("[pages-function] Failed to clean up Auth user:", cleanupError));
      return jsonResponse({ message: "Profil akun staf tidak berhasil disimpan." }, 502, origin);
    }

    if (role === "DOCTOR") {
      const linkedStaffRows = await requestSupabase({
        url: supabase.url,
        apiKey: supabase.serviceKey,
        path: `/rest/v1/staff?${queryString({
          id: `eq.${staffId}`,
          user_account_id: "is.null",
          select: "id"
        })}`,
        method: "PATCH",
        body: { user_account_id: insertedAccount.id },
        prefer: "return=representation"
      }).catch(async (error) => {
        await Promise.all([
          requestSupabase({
            url: supabase.url,
            apiKey: supabase.serviceKey,
            path: `/rest/v1/user_accounts?id=eq.${encodeURIComponent(insertedAccount.id)}`,
            method: "DELETE"
          }).catch((cleanupError) => console.error("[pages-function] Failed to remove doctor account profile:", cleanupError)),
          requestSupabase({
            url: supabase.url,
            apiKey: supabase.serviceKey,
            path: `/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
            method: "DELETE"
          }).catch((cleanupError) => console.error("[pages-function] Failed to remove doctor Auth user:", cleanupError))
        ]);
        throw error;
      });

      if (!Array.isArray(linkedStaffRows) || !linkedStaffRows.length) {
        await Promise.all([
          requestSupabase({
            url: supabase.url,
            apiKey: supabase.serviceKey,
            path: `/rest/v1/user_accounts?id=eq.${encodeURIComponent(insertedAccount.id)}`,
            method: "DELETE"
          }).catch((cleanupError) => console.error("[pages-function] Failed to remove doctor account profile:", cleanupError)),
          requestSupabase({
            url: supabase.url,
            apiKey: supabase.serviceKey,
            path: `/auth/v1/admin/users/${encodeURIComponent(authUserId)}`,
            method: "DELETE"
          }).catch((cleanupError) => console.error("[pages-function] Failed to remove doctor Auth user:", cleanupError))
        ]);
        return jsonResponse({ message: "Data pegawai dokter sudah ditautkan ke akun lain. Muat ulang data lalu coba lagi." }, 409, origin);
      }
    }

    return jsonResponse({
      account: {
        id: insertedAccount.id,
        authUserId: insertedAccount.auth_user_id || authUserId,
        username: insertedAccount.username,
        email: insertedAccount.email,
        name: insertedAccount.name,
        role: insertedAccount.role,
        branchId: insertedAccount.branch_id || null,
        staffId: insertedAccount.staff_id || null,
        doctorId: insertedAccount.doctor_id || null,
        active: insertedAccount.active ?? true,
        createdAt: insertedAccount.created_at || new Date().toISOString(),
        updatedAt: insertedAccount.updated_at || new Date().toISOString()
      }
    }, 201, origin);
  } catch (error) {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status === 401 || error.status === 403 ? error.status : 502
      : 502;
    console.error("[pages-function] Staff account creation failed:", error);
    return jsonResponse({
      message: status === 401
        ? "Unauthorized: sesi login tidak valid."
        : `Gagal memproses pembuatan akun staf: ${error.message}`
    }, status, origin);
  }
};
