const TOKEN_ISSUER = "lala-patient-card";
const TOKEN_TTL_SECONDS = 90;

export class PatientCardApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.name = "PatientCardApiError";
    this.status = status;
  }
}

export const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

const getConfiguration = (env) => {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const publicApiKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || serviceKey;
  if (!supabaseUrl || !serviceKey || !publicApiKey) {
    throw new PatientCardApiError("Layanan kartu pasien belum dikonfigurasi di server.", 500);
  }
  return { supabaseUrl: supabaseUrl.replace(/\/+$/, ""), serviceKey, publicApiKey };
};

const toQueryString = (values) => new URLSearchParams(values).toString();

const requestJson = async (url, headers, path) => {
  let response;
  try {
    response = await fetch(`${url}${path}`, { headers });
  } catch (error) {
    console.error("[pages-function] Patient-card Supabase request failed:", error);
    throw new PatientCardApiError("Gagal terhubung ke layanan pasien.", 502);
  }

  let body;
  try {
    body = await response.json();
  } catch (error) {
    console.error("[pages-function] Patient-card Supabase response was invalid JSON:", error);
    throw new PatientCardApiError("Respons layanan pasien tidak valid.", 502);
  }
  if (!response.ok) {
    console.error("[pages-function] Patient-card Supabase request returned HTTP", response.status);
    throw new PatientCardApiError("Gagal memverifikasi data kartu pasien.", 502);
  }
  return body;
};

const getServiceHeaders = (env, serviceKey) => ({
  apikey: serviceKey,
  Accept: "application/json",
  ...(!env.SUPABASE_SECRET_KEY && env.SUPABASE_SERVICE_ROLE_KEY
    ? { Authorization: `Bearer ${serviceKey}` }
    : {})
});

export const getAuthenticatedAccount = async (request, env) => {
  const { supabaseUrl, serviceKey, publicApiKey } = getConfiguration(env);
  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return { account: null, configuration: { supabaseUrl, serviceKey } };

  let authResponse;
  try {
    authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: publicApiKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json"
      }
    });
  } catch (error) {
    console.error("[pages-function] Patient-card session validation failed:", error);
    throw new PatientCardApiError("Gagal memverifikasi sesi login.", 502);
  }
  if (!authResponse.ok) return { account: null, configuration: { supabaseUrl, serviceKey } };

  let authUser;
  try {
    authUser = await authResponse.json();
  } catch (error) {
    console.error("[pages-function] Patient-card auth response was invalid JSON:", error);
    throw new PatientCardApiError("Respons autentikasi tidak valid.", 502);
  }
  if (!authUser?.id) return { account: null, configuration: { supabaseUrl, serviceKey } };

  const accounts = await requestJson(
    supabaseUrl,
    getServiceHeaders(env, serviceKey),
    `/rest/v1/user_accounts?${toQueryString({
      select: "role,patient_id,branch_id,active",
      auth_user_id: `eq.${authUser.id}`,
      limit: "2"
    })}`
  );
  if (!Array.isArray(accounts) || accounts.length > 1) {
    console.error("[pages-function] Patient-card account lookup returned an unexpected result.");
    throw new PatientCardApiError("Gagal memverifikasi izin akun.", 502);
  }
  return { account: accounts[0] || null, configuration: { supabaseUrl, serviceKey } };
};

export const getPatientCardProfile = async (env, configuration, patientId) => {
  const serviceHeaders = getServiceHeaders(env, configuration.serviceKey);
  const profiles = await requestJson(
    configuration.supabaseUrl,
    serviceHeaders,
    `/rest/v1/patient_profiles?${toQueryString({
      select: "id,name,full_name,medical_record_number,address,phone",
      id: `eq.${patientId}`,
      limit: "2"
    })}`
  );
  if (!Array.isArray(profiles) || profiles.length !== 1) {
    throw new PatientCardApiError("Profil pasien tertaut tidak ditemukan.", 404);
  }
  return profiles[0];
};

const base64UrlEncode = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
};

const getSigningKey = (secret) => crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(secret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

export const createPatientCardToken = async (patientId, secret, now = Date.now()) => {
  const payload = base64UrlEncode(JSON.stringify({
    iss: TOKEN_ISSUER,
    sub: patientId,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + TOKEN_TTL_SECONDS,
    jti: crypto.randomUUID()
  }));
  const key = await getSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const signatureBytes = new Uint8Array(signature);
  let binary = "";
  for (const byte of signatureBytes) binary += String.fromCharCode(byte);
  return `LDPC1.${payload}.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
};

export const verifyPatientCardToken = async (token, secret, now = Date.now()) => {
  const [prefix, payload, encodedSignature, extra] = String(token || "").split(".");
  if (prefix !== "LDPC1" || !payload || !encodedSignature || extra) return null;
  let signature;
  let claims;
  try {
    const normalizedSignature = encodedSignature.replace(/-/g, "+").replace(/_/g, "/");
    const signatureBinary = atob(normalizedSignature.padEnd(Math.ceil(normalizedSignature.length / 4) * 4, "="));
    signature = Uint8Array.from(signatureBinary, (character) => character.charCodeAt(0));
    claims = JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }

  if (
    claims.iss !== TOKEN_ISSUER ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= Math.floor(now / 1000)
  ) {
    return null;
  }

  const key = await getSigningKey(secret);
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    new TextEncoder().encode(payload)
  );
  return validSignature ? claims : null;
};

export const handlePatientCardError = (error) => {
  if (error instanceof PatientCardApiError) {
    return jsonResponse({ message: error.message }, error.status);
  }
  console.error("[pages-function] Unexpected patient-card error:", error);
  return jsonResponse({ message: "Terjadi kesalahan saat memproses kartu pasien." }, 500);
};
