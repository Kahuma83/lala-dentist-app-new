import {
  createPatientCardToken,
  getAuthenticatedAccount,
  getPatientCardProfile,
  handlePatientCardError,
  jsonResponse
} from "../../_shared/patient-card.js";

export const onRequestPost = async ({ request, env }) => {
  try {
    const { account, configuration } = await getAuthenticatedAccount(request, env);
    if (!account || account.active !== true) {
      return jsonResponse({ message: "Sesi login pasien tidak aktif. Silakan masuk kembali." }, 401);
    }
    if (account.role !== "PATIENT" || !account.patient_id) {
      return jsonResponse({ message: "Kartu hanya tersedia untuk akun pasien yang sudah tertaut." }, 403);
    }

    const profile = await getPatientCardProfile(env, configuration, String(account.patient_id));
    const token = await createPatientCardToken(
      profile.id,
      configuration.serviceKey
    );
    return jsonResponse({
      token,
      expiresInSeconds: 90,
      patient: {
        name: profile.name || "",
        fullName: profile.full_name || profile.name || "",
        medicalRecordNumber: profile.medical_record_number || "",
        address: profile.address || "",
        phone: profile.phone || ""
      }
    });
  } catch (error) {
    return handlePatientCardError(error);
  }
};
