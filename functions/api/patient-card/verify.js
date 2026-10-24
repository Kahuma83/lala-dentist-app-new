import {
  getPatientCardBooking,
  getAuthenticatedAccount,
  getPatientCardProfile,
  getPatientCardProfileByCode,
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
    const scannedValue = typeof body?.token === "string" ? body.token.trim() : "";
    if (!scannedValue) {
      return jsonResponse({ message: "QR tidak valid atau sudah kedaluwarsa. Minta pasien memuat ulang kartu." }, 410);
    }

    const claims = await verifyPatientCardToken(scannedValue, configuration.serviceKey);
    const profile = claims
      ? await getPatientCardProfile(env, configuration, claims.sub)
      : /^[A-Z0-9]{1,10}-RM-?[A-Z0-9][A-Z0-9-]{0,49}$/i.test(scannedValue)
        ? await getPatientCardProfileByCode(env, configuration, scannedValue.toUpperCase())
        : null;
    if (!profile) {
      return jsonResponse({ message: "QR tidak valid atau sudah kedaluwarsa. Minta pasien memuat ulang kartu." }, 410);
    }

    const booking = await getPatientCardBooking(
      env,
      configuration,
      profile.id,
      account.role === "BRANCH_ADMIN" ? account.branch_id : null
    );
    return jsonResponse({
      patient: {
        id: profile.id,
        name: profile.full_name || profile.name || "",
        medicalRecordNumber: profile.medical_record_number || "",
        internalPatientCode: profile.internal_patient_code || ""
      },
      booking: booking
        ? {
            id: booking.id,
            bookingDateTime: booking.booking_date_time,
            timeSlot: booking.time_slot || "",
            status: booking.status,
            branchName: booking.branch_name_snapshot || ""
          }
        : null,
      verifiedAt: new Date().toISOString()
    });
  } catch (error) {
    return handlePatientCardError(error);
  }
};
