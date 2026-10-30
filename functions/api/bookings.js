const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  }
});

const getSupabaseErrorMessage = (body, status) =>
  body?.message || body?.msg || body?.hint || `Supabase returned HTTP ${status}`;

const requestSupabase = async ({ url, apiKey, accessToken, path, method = "GET", body, prefer }) => {
  const response = await fetch(`${url.replace(/\/+$/, "")}${path}`, {
    method,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken || apiKey}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  const responseBody = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(getSupabaseErrorMessage(responseBody, response.status));
    error.status = response.status;
    error.code = responseBody?.code;
    throw error;
  }
  return responseBody;
};

const toQueryString = (values) => new URLSearchParams(values).toString();

export const onRequestPost = async ({ request, env }) => {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const publicApiKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || serviceKey;

  if (!supabaseUrl || !serviceKey || !publicApiKey) {
    console.error("[pages-function] Booking API is missing server-side Supabase configuration.");
    return jsonResponse({ message: "Layanan booking belum dikonfigurasi di server." }, 500);
  }

  const authHeader = request.headers.get("Authorization") || "";
  const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!accessToken) {
    return jsonResponse({ message: "Unauthorized: token sesi tidak ditemukan." }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ message: "Permintaan booking tidak valid." }, 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonResponse({ message: "Permintaan booking tidak valid." }, 400);
  }
  payload = { ...payload };

  const required = ["patient_id", "branch_id", "doctor_id", "booking_date_time"];
  const missing = required.filter((key) => !payload[key]);
  if (missing.length) {
    return jsonResponse({
      message: `Data booking tidak lengkap. Field yang kurang: ${missing.join(", ")}`
    }, 400);
  }

  try {
    const authUser = await requestSupabase({
      url: supabaseUrl,
      apiKey: publicApiKey,
      accessToken,
      path: "/auth/v1/user"
    });
    if (!authUser?.id) {
      return jsonResponse({ message: "Unauthorized: sesi login tidak valid." }, 401);
    }

    const accountQuery = toQueryString({
      select: "role,patient_id,branch_id,active",
      auth_user_id: `eq.${authUser.id}`,
      limit: "2"
    });
    const accounts = await requestSupabase({
      url: supabaseUrl,
      apiKey: serviceKey,
      path: `/rest/v1/user_accounts?${accountQuery}`
    });
    if (!Array.isArray(accounts) || accounts.length > 1) {
      console.error("[pages-function] Booking actor lookup returned an unexpected account count.");
      return jsonResponse({ message: "Gagal memverifikasi izin akun untuk membuat booking." }, 500);
    }

    const actorAccount = accounts[0];
    if (!actorAccount || actorAccount.active !== true) {
      return jsonResponse({ message: "Akun klinik yang aktif tidak ditemukan untuk sesi ini." }, 403);
    }

    const allowedRoles = ["SUPER_ADMIN", "BRANCH_ADMIN", "DOCTOR", "DOCTOR_ASSISTANT", "PATIENT"];
    if (!allowedRoles.includes(actorAccount.role)) {
      return jsonResponse({ message: "Akun ini tidak memiliki izin untuk membuat booking." }, 403);
    }

    const isPatient = actorAccount.role === "PATIENT";
    if (isPatient && String(actorAccount.patient_id || "") !== String(payload.patient_id)) {
      return jsonResponse({ message: "Pasien hanya dapat membuat booking untuk profilnya sendiri." }, 403);
    }
    if (
      ["BRANCH_ADMIN", "DOCTOR_ASSISTANT"].includes(actorAccount.role)
      && String(actorAccount.branch_id || "") !== String(payload.branch_id)
    ) {
      return jsonResponse({ message: "Akun staf hanya dapat membuat booking pada cabangnya sendiri." }, 403);
    }

    const requestedDateTime = new Date(payload.booking_date_time);
    if (Number.isNaN(requestedDateTime.getTime())) {
      return jsonResponse({ message: "Tanggal dan jam booking tidak valid." }, 400);
    }
    const operationalDateParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(requestedDateTime);
    const operationalDate = `${operationalDateParts.find((part) => part.type === "year")?.value}-${operationalDateParts.find((part) => part.type === "month")?.value}-${operationalDateParts.find((part) => part.type === "day")?.value}`;
    const timeSlot = String(payload.time_slot || new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(requestedDateTime));
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeSlot)) {
      return jsonResponse({ message: "Jam booking tidak valid." }, 400);
    }
    const canonicalBookingDateTime = new Date(`${operationalDate}T${timeSlot}:00+07:00`);
    if (Number.isNaN(canonicalBookingDateTime.getTime())) {
      return jsonResponse({ message: "Tanggal dan jam booking tidak valid." }, 400);
    }
    payload.booking_date_time = canonicalBookingDateTime.toISOString();
    payload.time_slot = timeSlot;

    const [branches, doctors] = await Promise.all([
      requestSupabase({
        url: supabaseUrl,
        apiKey: serviceKey,
        path: `/rest/v1/dental_branches?${toQueryString({
          select: "id,name,is_active",
          id: `eq.${payload.branch_id}`,
          limit: "1"
        })}`
      }),
      requestSupabase({
        url: supabaseUrl,
        apiKey: serviceKey,
        path: `/rest/v1/dental_doctors?${toQueryString({
          select: "id,name,active",
          id: `eq.${payload.doctor_id}`,
          limit: "1"
        })}`
      })
    ]);

    const branch = Array.isArray(branches) ? branches[0] : null;
    const doctor = Array.isArray(doctors) ? doctors[0] : null;
    if (!branch || branch.is_active !== true) {
      return jsonResponse({ message: "Cabang tidak ditemukan atau sedang tidak aktif." }, 400);
    }
    if (!doctor || doctor.active !== true) {
      return jsonResponse({ message: "Dokter tidak ditemukan atau sedang tidak aktif." }, 400);
    }

    if (payload.referring_staff_id) {
      if (isPatient) {
        return jsonResponse({ message: "Pasien tidak dapat menetapkan staf referral pada booking." }, 403);
      }
      const referringStaffRows = await requestSupabase({
        url: supabaseUrl,
        apiKey: serviceKey,
        path: `/rest/v1/staff?${toQueryString({
          select: "id,branch_id,position,employment_status,active",
          id: `eq.${payload.referring_staff_id}`,
          limit: "1"
        })}`
      });
      const referringStaff = Array.isArray(referringStaffRows) ? referringStaffRows[0] : null;
      if (
        !referringStaff ||
        !["BRANCH_ADMIN", "ASSISTANT"].includes(referringStaff.position) ||
        referringStaff.employment_status !== "ACTIVE" ||
        referringStaff.active !== true
      ) {
        return jsonResponse({ message: "Staf referral harus admin atau asisten aktif." }, 400);
      }
    }

    if (isPatient) {
      if (canonicalBookingDateTime.getTime() <= Date.now()) {
        return jsonResponse({ message: "Pilih tanggal dan waktu booking yang masih akan datang." }, 400);
      }

      const patients = await requestSupabase({
        url: supabaseUrl,
        apiKey: serviceKey,
        path: `/rest/v1/patient_profiles?${toQueryString({
          select: "id,name,full_name",
          id: `eq.${payload.patient_id}`,
          limit: "1"
        })}`
      });
      const patient = Array.isArray(patients) ? patients[0] : null;
      if (!patient) {
        return jsonResponse({ message: "Profil pasien tidak ditemukan atau belum tertaut ke akun ini." }, 403);
      }

      const schedules = await requestSupabase({
        url: supabaseUrl,
        apiKey: serviceKey,
        path: `/rest/v1/doctor_schedules?${toQueryString({
          select: "start_time,end_time",
          branch_id: `eq.${payload.branch_id}`,
          doctor_id: `eq.${payload.doctor_id}`,
          date: `eq.${operationalDate}`,
          status: "eq.ACTIVE"
        })}`
      });
      const matchingSchedule = Array.isArray(schedules) && schedules.find((schedule) => {
        const startTime = String(schedule.start_time || "").slice(0, 5);
        const endTime = String(schedule.end_time || "").slice(0, 5);
        return startTime <= timeSlot && timeSlot < endTime;
      });
      if (!matchingSchedule) {
        return jsonResponse({
          message: "Dokter tidak memiliki jadwal aktif pada cabang, tanggal, dan waktu yang dipilih."
        }, 400);
      }

      payload.status = "PENDING";
      payload.source = "PATIENT_PORTAL";
      payload.channel = "PATIENT_PORTAL";
      payload.schedule_verified = true;
      payload.patient_name_snapshot = patient.full_name || patient.name || "Pasien";
      payload.doctor_name_snapshot = doctor.name;
      payload.branch_name_snapshot = branch.name;
      payload.planned_treatments = [];
      delete payload.service_id;
      const complaint = String(payload.complaint || payload.notes || "").trim().slice(0, 1000);
      payload.complaint = complaint || null;
      payload.notes = complaint || null;
    }

    const dayStart = new Date(`${operationalDate}T00:00:00.000+07:00`);
    const requestedSlotStart = new Date(canonicalBookingDateTime);
    requestedSlotStart.setUTCSeconds(0, 0);
    const nextDayStart = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    if (isPatient) {
      const activeBookings = await requestSupabase({
        url: supabaseUrl,
        apiKey: serviceKey,
        path: `/rest/v1/bookings?${toQueryString({
          select: "id",
          patient_id: `eq.${payload.patient_id}`,
          status: "in.(PENDING,CONFIRMED)",
          limit: "1"
        })}`
      });
      if (Array.isArray(activeBookings) && activeBookings.length) {
        return jsonResponse({
          message: "Anda masih memiliki janji temu yang belum selesai. Selesaikan atau batalkan melalui klinik sebelum membuat janji temu baru."
        }, 409);
      }
    } else {
      const activeBookings = await requestSupabase({
        url: supabaseUrl,
        apiKey: serviceKey,
        path: `/rest/v1/bookings?${toQueryString({
          select: "id",
          patient_id: `eq.${payload.patient_id}`,
          branch_id: `eq.${payload.branch_id}`,
          status: "in.(PENDING,CONFIRMED)",
          booking_date_time: `gte.${dayStart.toISOString()}`,
          and: `(booking_date_time.lt.${nextDayStart.toISOString()})`,
          limit: "1"
        })}`
      });
      if (Array.isArray(activeBookings) && activeBookings.length) {
        return jsonResponse({ message: "Pasien sudah memiliki booking aktif di cabang ini pada tanggal tersebut." }, 409);
      }
    }

    const doctorBookings = await requestSupabase({
      url: supabaseUrl,
      apiKey: serviceKey,
      path: `/rest/v1/bookings?${toQueryString({
        select: "booking_date_time,planned_treatments",
        doctor_id: `eq.${payload.doctor_id}`,
        branch_id: `eq.${payload.branch_id}`,
        booking_date_time: `gte.${dayStart.toISOString()}`,
        and: `(booking_date_time.lt.${nextDayStart.toISOString()})`,
        status: "in.(PENDING,CONFIRMED)",
      })}`
    });
    const requestedDuration = (Array.isArray(payload.planned_treatments) ? payload.planned_treatments : [])
      .reduce((total, treatment) => total + Math.max(0, Number(treatment?.estimatedDurationMinutes) || 0), 0) || 30;
    const requestedEnd = requestedSlotStart.getTime() + requestedDuration * 60_000;
    const hasDoctorConflict = (Array.isArray(doctorBookings) ? doctorBookings : []).some((booking) => {
      const bookedStart = new Date(booking.booking_date_time).getTime();
      const bookedDuration = (Array.isArray(booking.planned_treatments) ? booking.planned_treatments : [])
        .reduce((total, treatment) => total + Math.max(0, Number(treatment?.estimatedDurationMinutes) || 0), 0) || 30;
      return requestedSlotStart.getTime() < bookedStart + bookedDuration * 60_000 &&
        bookedStart < requestedEnd;
    });
    if (hasDoctorConflict) {
      return jsonResponse({ message: "Dokter sudah memiliki booking aktif yang bertabrakan dengan durasi tindakan ini di cabang tersebut." }, 409);
    }

    const insert = (booking) => requestSupabase({
      url: supabaseUrl,
      apiKey: serviceKey,
      path: "/rest/v1/bookings",
      method: "POST",
      body: booking,
      prefer: "return=representation"
    });

    let inserted;
    try {
      inserted = await insert(payload);
    } catch (error) {
      if (!/Could not find the '(source|channel)' column|column .*\b(source|channel)\b.* does not exist/i.test(error.message || "")) {
        throw error;
      }
      const { source, channel, ...schemaCompatiblePayload } = payload;
      inserted = await insert(schemaCompatiblePayload);
    }

    const booking = Array.isArray(inserted) ? inserted[0] : null;
    if (!booking) {
      console.error("[pages-function] Booking insert returned no booking row.");
      return jsonResponse({ message: "Booking tersimpan tanpa data respons yang valid." }, 502);
    }
    return jsonResponse({ booking }, 201);
  } catch (error) {
    if (error?.status === 401) {
      return jsonResponse({ message: "Unauthorized: sesi login tidak valid." }, 401);
    }
    if (error?.code === "23505") {
      return jsonResponse({ message: "Slot booking baru saja digunakan. Silakan pilih waktu lain." }, 409);
    }
    console.error("[pages-function] Booking request failed:", error);
    return jsonResponse({
      message: error?.message || "Server error saat menyimpan booking."
    }, error?.status && error.status >= 400 && error.status < 500 ? error.status : 500);
  }
};
