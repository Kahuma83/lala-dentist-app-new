import {
  getAuthenticatedAccount,
  getPatientCardProfile,
  handlePatientCardError,
  jsonResponse,
  verifyPatientCardToken
} from "../../_shared/patient-card.js";

export const onRequestPost = async ({ request, env }) => {
  try {
    const { account, configuration } = await getAuthenticatedAccount(request, env);
    if (!account || account.active !== true) {
      return jsonResponse({ message: "Sesi petugas tidak aktif. Silakan masuk kembali." }, 401);
    }
    if (!["SUPER_ADMIN", "BRANCH_ADMIN"].includes(account.role)) {
      return jsonResponse({ message: "Hanya petugas berwenang yang dapat memverifikasi kartu pasien." }, 403);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ message: "Permintaan verifikasi kartu tidak valid." }, 400);
    }
    const token = typeof body?.token === "string" ? body.token : "";
    const claims = await verifyPatientCardToken(token, configuration.serviceKey);
    if (!claims) {
      return jsonResponse({ message: "QR tidak valid atau sudah kedaluwarsa. Minta pasien memuat ulang kartu." }, 410);
    }

    const profile = await getPatientCardProfile(env, configuration, claims.sub);
    return jsonResponse({
      patient: {
        id: profile.id,
        name: profile.full_name || profile.name || "",
        medicalRecordNumber: profile.medical_record_number || ""
      },
      verifiedAt: new Date().toISOString()
    });
  } catch (error) {
    return handlePatientCardError(error);
  }
};
