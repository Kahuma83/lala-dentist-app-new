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
      select: "id,name,full_name,date_of_birth,medical_record_number,internal_patient_code,registered_branch_id,address,phone",
      id: `eq.${patientId}`,
      limit: "2"
    })}`
  );
  if (!Array.isArray(profiles) || profiles.length !== 1) {
    throw new PatientCardApiError("Profil pasien tertaut tidak ditemukan.", 404);
  }

  const profile = profiles[0];
  if (profile.internal_patient_code) return profile;

  const records = await requestJson(
    configuration.supabaseUrl,
    serviceHeaders,
    `/rest/v1/patient_branch_medical_records?${toQueryString({
      select: "branch_id,medical_record_number",
      patient_id: `eq.${patientId}`,
      order: "created_at.asc",
      limit: "20"
    })}`
  );
  if (!Array.isArray(records)) {
    throw new PatientCardApiError("Gagal membaca No. RM cabang pasien.", 502);
  }
  const originalRecord = records.find((record) => record.branch_id === profile.registered_branch_id)
    || records[0];
  const medicalRecordNumber = profile.medical_record_number || originalRecord?.medical_record_number;
  const branchId = profile.registered_branch_id || originalRecord?.branch_id;
  if (!medicalRecordNumber || !branchId) return profile;

  const branches = await requestJson(
    configuration.supabaseUrl,
    serviceHeaders,
    `/rest/v1/dental_branches?${toQueryString({
      select: "branch_code",
      id: `eq.${branchId}`,
      limit: "2"
    })}`
  );
  if (!Array.isArray(branches) || branches.length !== 1 || !branches[0].branch_code) {
    throw new PatientCardApiError("Kode cabang untuk kartu pasien belum tersedia.", 502);
  }
  const cleanRm = String(medicalRecordNumber).trim().toUpperCase();
  const rmCode = cleanRm.startsWith("RM")
    ? `RM-${cleanRm.replace(/^RM[- ]*/, "")}`
    : `RM${cleanRm}`;
  return {
    ...profile,
    medical_record_number: profile.medical_record_number || medicalRecordNumber,
    internal_patient_code: `${String(branches[0].branch_code).trim().toUpperCase()}-${rmCode}`
  };
};

export const getPatientCardProfileByCode = async (env, configuration, patientCode) => {
  const profiles = await requestJson(
    configuration.supabaseUrl,
    getServiceHeaders(env, configuration.serviceKey),
    `/rest/v1/patient_profiles?${toQueryString({
      select: "id,name,full_name,medical_record_number,internal_patient_code",
      internal_patient_code: `eq.${patientCode}`,
      limit: "2"
    })}`
  );
  if (!Array.isArray(profiles) || profiles.length !== 1) {
    throw new PatientCardApiError("Kode kartu pasien tidak ditemukan.", 404);
  }
  return profiles[0];
};

export const getPatientCardBooking = async (env, configuration, patientId, branchId) => {
  if (!branchId) return null;

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const tomorrow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(Date.parse(`${today}T00:00:00+07:00`) + 24 * 60 * 60 * 1000));
  const bookings = await requestJson(
    configuration.supabaseUrl,
    getServiceHeaders(env, configuration.serviceKey),
    `/rest/v1/bookings?${toQueryString({
      select: "id,booking_date_time,time_slot,status,branch_name_snapshot",
      patient_id: `eq.${patientId}`,
      branch_id: `eq.${branchId}`,
      booking_date_time: `gte.${today}T00:00:00+07:00`,
      and: `(booking_date_time.lt.${tomorrow}T00:00:00+07:00,status.in.(PENDING,CONFIRMED))`,
      order: "booking_date_time.asc",
      limit: "10"
    })}`
  );
  if (!Array.isArray(bookings)) {
    throw new PatientCardApiError("Gagal membaca jadwal booking pasien.", 502);
  }
  return bookings[0] || null;
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
