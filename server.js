import express from 'express';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = Number(process.env.BACKEND_PORT || 3001);
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn('[server] Missing Supabase URL or service role key. Booking API will reject writes.');
}

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'lala-dentist-booking-api' });
});

app.post('/api/auth/lookup-user', async (req, res) => {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return res.status(500).json({
        message: 'Supabase service-role key belum dikonfigurasi di server. Tidak bisa mencari data akun pengguna.'
      });
    }

    const identifier = String(req.body?.usernameOrEmail || '').trim();
    if (!identifier) {
      return res.status(400).json({ message: 'Identifier username/email wajib diisi.' });
    }

    const normalized = identifier.toLowerCase();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    let query = supabaseAdmin.from('user_accounts').select('email, active');
    const isEmailLike = normalized.includes('@');
    if (isEmailLike) {
      query = query.ilike('email', normalized);
    } else {
      query = query.ilike('username', normalized);
    }

    const { data, error } = await query.maybeSingle();
    if (error && error.code !== 'PGRST116') {
      console.error('[server] auth lookup failed:', error);
      return res.status(400).json({ message: error.message || 'Gagal mencari akun pengguna.' });
    }

    if (!data) {
      return res.status(404).json({ message: 'Akun tidak ditemukan.' });
    }

    return res.json({
      account: {
        email: data.email || null,
        active: data.active
      }
    });
  } catch (error) {
    console.error('[server] auth lookup error:', error);
    return res.status(500).json({ message: error?.message || 'Server error saat mencari akun pengguna.' });
  }
});

app.post('/api/staff', async (req, res) => {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return res.status(500).json({
        message: 'Supabase service-role key belum dikonfigurasi di server. Tidak bisa membuat akun staf.'
      });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: token sesi tidak ditemukan.' });
    }

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey || 'placeholder-anon-key-string', {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ message: 'Unauthorized: sesi login tidak valid.' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: actorAccount, error: actorError } = await supabaseAdmin
      .from('user_accounts')
      .select('role')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();

    if (actorError || !actorAccount || actorAccount.role !== 'SUPER_ADMIN') {
      console.warn('[server] Staff creation blocked for non-superadmin actor:', {
        userId: userData.user.id,
        email: userData.user.email,
        actorError: actorError?.message,
        actorAccount: actorAccount || null
      });
      return res.status(403).json({ message: 'Forbidden: hanya SUPER_ADMIN yang dapat membuat akun staf.' });
    }

    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const role = String(body.role || '').trim();
    const password = String(body.password || '');
    const branchId = body.branchId || null;
    const staffId = body.staffId || null;
    const doctorId = body.doctorId || null;

    if (!username || username.length < 3) {
      return res.status(400).json({ message: 'Username minimal 3 karakter.' });
    }

    if (!name) {
      return res.status(400).json({ message: 'Nama lengkap wajib diisi.' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'Password minimal harus 6 karakter.' });
    }

    const allowedRoles = ['BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT', 'OB'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: `Role ${role} tidak diizinkan untuk pembuatan akun staf.` });
    }

    if ((role === 'BRANCH_ADMIN' || role === 'DOCTOR_ASSISTANT' || role === 'OB') && !branchId) {
      return res.status(400).json({ message: `Cabang penempatan wajib dipilih untuk role ${role}.` });
    }

    if (role === 'DOCTOR') {
      if (!doctorId || !staffId) {
        return res.status(400).json({
          message: 'Akun dokter harus ditautkan ke data dokter dan data pegawai sebelum dibuat.'
        });
      }

      const { data: doctor, error: doctorError } = await supabaseAdmin
        .from('dental_doctors')
        .select('id, staff_id')
        .eq('id', doctorId)
        .maybeSingle();
      if (doctorError) {
        console.error('[server] doctor account link validation failed:', doctorError);
        return res.status(400).json({ message: `Gagal memvalidasi data dokter: ${doctorError.message}` });
      }
      if (!doctor || doctor.staff_id !== staffId) {
        return res.status(400).json({
          message: 'Data dokter belum terhubung ke data pegawai yang dipilih. Simpan relasi pegawai dokter terlebih dahulu.'
        });
      }

      const { data: staffRecord, error: staffError } = await supabaseAdmin
        .from('staff')
        .select('id, user_account_id, active')
        .eq('id', staffId)
        .maybeSingle();
      if (staffError) {
        console.error('[server] doctor staff link validation failed:', staffError);
        return res.status(400).json({ message: `Gagal memvalidasi data pegawai dokter: ${staffError.message}` });
      }
      if (!staffRecord || !staffRecord.active) {
        return res.status(400).json({ message: 'Data pegawai dokter tidak ditemukan atau berstatus nonaktif.' });
      }
      if (staffRecord.user_account_id) {
        return res.status(409).json({ message: 'Data pegawai dokter sudah tertaut ke akun login lain.' });
      }
    }

    const syntheticEmail = `${username}@laladentist.id`;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('user_accounts')
      .select('id, username')
      .or(`username.ilike.${username},email.ilike.${syntheticEmail}`)
      .maybeSingle();

    if (existingError && existingError.code !== 'PGRST116') {
      console.error('[server] user_accounts duplicate check failed:', existingError);
    }

    if (existing) {
      return res.status(409).json({ message: `Username '${username}' atau email sudah terdaftar di sistem.` });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: { username, name, role }
    });

    if (authError || !authData?.user) {
      return res.status(400).json({
        message: `Gagal membuat akun login: ${authError?.message || 'Unknown error'}`
      });
    }

    const profilePayload = {
      auth_user_id: authData.user.id,
      username,
      email: syntheticEmail,
      name,
      role,
      branch_id: branchId,
      staff_id: staffId,
      doctor_id: doctorId,
      active: true
    };

    const { data: insertedAcc, error: insertError } = await supabaseAdmin
      .from('user_accounts')
      .insert(profilePayload)
      .select()
      .single();

    if (insertError || !insertedAcc) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
      return res.status(400).json({
        message: `Gagal menyimpan profil user_accounts: ${insertError?.message || 'Unknown error'}`
      });
    }

    if (role === 'DOCTOR') {
      const { data: linkedStaff, error: linkError } = await supabaseAdmin
        .from('staff')
        .update({ user_account_id: insertedAcc.id })
        .eq('id', staffId)
        .is('user_account_id', null)
        .select('id')
        .maybeSingle();

      if (linkError || !linkedStaff) {
        if (linkError) {
          console.error('[server] doctor staff account link failed:', linkError);
        }
        const { error: profileCleanupError } = await supabaseAdmin
          .from('user_accounts')
          .delete()
          .eq('id', insertedAcc.id);
        if (profileCleanupError) {
          console.error('[server] failed to clean up unlinked doctor account profile:', profileCleanupError);
        }
        const { error: authCleanupError } = await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        if (authCleanupError) {
          console.error('[server] failed to clean up unlinked doctor auth user:', authCleanupError);
        }
        return res.status(linkError ? 400 : 409).json({
          message: linkError
            ? `Gagal menautkan akun ke data pegawai dokter: ${linkError.message}`
            : 'Data pegawai dokter sudah ditautkan ke akun lain. Muat ulang data lalu coba lagi.'
        });
      }
    }

    return res.status(201).json({
      account: {
        id: insertedAcc.id,
        authUserId: insertedAcc.auth_user_id || authData.user.id,
        username: insertedAcc.username,
        email: insertedAcc.email,
        name: insertedAcc.name,
        role: insertedAcc.role,
        branchId: insertedAcc.branch_id || null,
        staffId: insertedAcc.staff_id || null,
        doctorId: insertedAcc.doctor_id || null,
        active: insertedAcc.active ?? true,
        createdAt: insertedAcc.created_at || new Date().toISOString(),
        updatedAt: insertedAcc.updated_at || new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[server] staff creation failed:', error);
    return res.status(500).json({
      message: error?.message || 'Server error saat membuat akun staf.'
    });
  }
});

app.post('/api/bookings', async (req, res) => {
  try {
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return res.status(500).json({
        message: 'Supabase service-role key belum dikonfigurasi di server. Tidak bisa menyimpan booking.'
      });
    }

    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: token sesi tidak ditemukan.' });
    }

    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey || 'placeholder-anon-key-string', {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: userData, error: userError } = await supabaseAnon.auth.getUser(token);
    if (userError || !userData?.user) {
      return res.status(401).json({ message: 'Unauthorized: sesi login tidak valid.' });
    }

    const payload = { ...(req.body || {}) };
    const required = ['patient_id', 'branch_id', 'doctor_id', 'booking_date_time'];
    const missing = required.filter((key) => !payload[key]);
    if (missing.length) {
      return res.status(400).json({
        message: `Data booking tidak lengkap. Field yang kurang: ${missing.join(', ')}`
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data: actorAccount, error: actorAccountError } = await supabaseAdmin
      .from('user_accounts')
      .select('role, patient_id, branch_id, active')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();

    if (actorAccountError) {
      console.error('[server] booking actor lookup failed:', actorAccountError);
      return res.status(500).json({ message: 'Gagal memverifikasi izin akun untuk membuat booking.' });
    }
    if (!actorAccount || actorAccount.active !== true) {
      return res.status(403).json({ message: 'Akun klinik yang aktif tidak ditemukan untuk sesi ini.' });
    }

    const allowedRoles = ['SUPER_ADMIN', 'BRANCH_ADMIN', 'DOCTOR', 'DOCTOR_ASSISTANT', 'PATIENT'];
    if (!allowedRoles.includes(actorAccount.role)) {
      return res.status(403).json({ message: 'Akun ini tidak memiliki izin untuk membuat booking.' });
    }

    const isPatient = actorAccount.role === 'PATIENT';
    if (isPatient && String(actorAccount.patient_id || '') !== String(payload.patient_id)) {
      return res.status(403).json({ message: 'Pasien hanya dapat membuat booking untuk profilnya sendiri.' });
    }
    if (
      ['BRANCH_ADMIN', 'DOCTOR_ASSISTANT'].includes(actorAccount.role)
      && String(actorAccount.branch_id || '') !== String(payload.branch_id)
    ) {
      return res.status(403).json({ message: 'Akun staf hanya dapat membuat booking pada cabangnya sendiri.' });
    }

    const requestedDateTime = new Date(payload.booking_date_time);
    if (Number.isNaN(requestedDateTime.getTime())) {
      return res.status(400).json({ message: 'Tanggal dan jam booking tidak valid.' });
    }
    const operationalDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(requestedDateTime);
    const operationalDate = `${operationalDateParts.find((part) => part.type === 'year')?.value}-${operationalDateParts.find((part) => part.type === 'month')?.value}-${operationalDateParts.find((part) => part.type === 'day')?.value}`;
    const timeSlot = String(payload.time_slot || new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).format(requestedDateTime));
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(timeSlot)) {
      return res.status(400).json({ message: 'Jam booking tidak valid.' });
    }
    const canonicalBookingDateTime = new Date(`${operationalDate}T${timeSlot}:00+07:00`);
    if (Number.isNaN(canonicalBookingDateTime.getTime())) {
      return res.status(400).json({ message: 'Tanggal dan jam booking tidak valid.' });
    }
    payload.booking_date_time = canonicalBookingDateTime.toISOString();
    payload.time_slot = timeSlot;

    const [{ data: branch, error: branchError }, { data: doctor, error: doctorError }] = await Promise.all([
      supabaseAdmin
        .from('dental_branches')
        .select('id, name, is_active')
        .eq('id', payload.branch_id)
        .maybeSingle(),
      supabaseAdmin
        .from('dental_doctors')
        .select('id, name, active')
        .eq('id', payload.doctor_id)
        .maybeSingle()
    ]);

    if (branchError) {
      console.error('[server] booking branch lookup failed:', branchError);
      return res.status(500).json({ message: 'Gagal memeriksa cabang booking.' });
    }
    if (!branch || branch.is_active !== true) {
      return res.status(400).json({ message: 'Cabang tidak ditemukan atau sedang tidak aktif.' });
    }
    if (doctorError) {
      console.error('[server] booking doctor lookup failed:', doctorError);
      return res.status(500).json({ message: 'Gagal memeriksa dokter booking.' });
    }
    if (!doctor || doctor.active !== true) {
      return res.status(400).json({ message: 'Dokter tidak ditemukan atau sedang tidak aktif.' });
    }

    if (isPatient) {
      if (canonicalBookingDateTime.getTime() <= Date.now()) {
        return res.status(400).json({ message: 'Pilih tanggal dan waktu booking yang masih akan datang.' });
      }

      const { data: patient, error: patientError } = await supabaseAdmin
        .from('patient_profiles')
        .select('id, name, full_name')
        .eq('id', payload.patient_id)
        .maybeSingle();

      if (patientError) {
        console.error('[server] booking patient lookup failed:', patientError);
        return res.status(500).json({ message: 'Gagal memeriksa profil pasien booking.' });
      }
      if (!patient) {
        return res.status(403).json({ message: 'Profil pasien tidak ditemukan atau belum tertaut ke akun ini.' });
      }

      const { data: schedules, error: scheduleError } = await supabaseAdmin
        .from('doctor_schedules')
        .select('start_time, end_time')
        .eq('branch_id', payload.branch_id)
        .eq('doctor_id', payload.doctor_id)
        .eq('date', operationalDate)
        .eq('status', 'ACTIVE');

      const matchingSchedule = schedules?.find((schedule) => {
        const startTime = String(schedule.start_time || '').slice(0, 5);
        const endTime = String(schedule.end_time || '').slice(0, 5);
        return startTime <= timeSlot && timeSlot < endTime;
      });

      if (scheduleError) {
        console.error('[server] booking schedule lookup failed:', scheduleError);
        return res.status(500).json({ message: 'Gagal memeriksa jadwal dokter booking.' });
      }
      if (!matchingSchedule) {
        return res.status(400).json({ message: 'Dokter tidak memiliki jadwal aktif pada cabang, tanggal, dan waktu yang dipilih.' });
      }

      payload.status = 'PENDING';
      payload.source = 'PATIENT_PORTAL';
      payload.channel = 'PATIENT_PORTAL';
      payload.schedule_verified = true;
      payload.patient_name_snapshot = patient.full_name || patient.name || 'Pasien';
      payload.doctor_name_snapshot = doctor.name;
      payload.branch_name_snapshot = branch.name;
      payload.planned_treatments = [];
      delete payload.service_id;
      const complaint = String(payload.complaint || payload.notes || '').trim().slice(0, 1000);
      payload.complaint = complaint || null;
      payload.notes = complaint || null;
    }

    const dayStart = new Date(`${operationalDate}T00:00:00.000+07:00`);
    const requestedSlotStart = new Date(canonicalBookingDateTime);
    requestedSlotStart.setUTCSeconds(0, 0);
    const requestedSlotEnd = new Date(requestedSlotStart.getTime() + 60_000);
    const nextDayStart = new Date(dayStart);
    nextDayStart.setTime(nextDayStart.getTime() + 24 * 60 * 60 * 1000);

    if (isPatient) {
      const { data: activePatientBookings, error: activePatientBookingError } = await supabaseAdmin
        .from('bookings')
        .select('id')
        .eq('patient_id', payload.patient_id)
        .in('status', ['PENDING', 'CONFIRMED'])
        .limit(1);

      if (activePatientBookingError) {
        console.error('[server] patient active booking lookup failed:', activePatientBookingError);
        return res.status(500).json({ message: 'Gagal memeriksa janji temu aktif pasien.' });
      }
      if (activePatientBookings && activePatientBookings.length > 0) {
        return res.status(409).json({
          message: 'Anda masih memiliki janji temu yang belum selesai. Selesaikan atau batalkan melalui klinik sebelum membuat janji temu baru.'
        });
      }
    }

    if (!isPatient) {
      const { data: activeBookings, error: duplicateCheckError } = await supabaseAdmin
        .from('bookings')
        .select('id')
        .eq('patient_id', payload.patient_id)
        .eq('branch_id', payload.branch_id)
        .in('status', ['PENDING', 'CONFIRMED'])
        .gte('booking_date_time', dayStart.toISOString())
        .lt('booking_date_time', nextDayStart.toISOString())
        .limit(1);

      if (duplicateCheckError) {
        return res.status(500).json({
          message: `Gagal memeriksa booking aktif pasien: ${duplicateCheckError.message}`
        });
      }
      if (activeBookings && activeBookings.length > 0) {
        return res.status(409).json({
          message: 'Pasien sudah memiliki booking aktif di cabang ini pada tanggal tersebut.'
        });
      }
    }

    const { data: doctorSlotBookings, error: doctorSlotError } = await supabaseAdmin
      .from('bookings')
      .select('id')
      .eq('doctor_id', payload.doctor_id)
      .eq('branch_id', payload.branch_id)
      .gte('booking_date_time', requestedSlotStart.toISOString())
      .lt('booking_date_time', requestedSlotEnd.toISOString())
      .in('status', ['PENDING', 'CONFIRMED'])
      .limit(1);

    if (doctorSlotError) {
      return res.status(500).json({
        message: `Gagal memeriksa slot dokter: ${doctorSlotError.message}`
      });
    }
    if (doctorSlotBookings && doctorSlotBookings.length > 0) {
      return res.status(409).json({
        message: 'Dokter sudah memiliki booking aktif pada slot waktu tersebut di cabang ini.'
      });
    }

    let { data, error } = await supabaseAdmin
      .from('bookings')
      .insert(payload)
      .select()
      .single();

    if (error && /Could not find the '(source|channel)' column|column .*\b(source|channel)\b.* does not exist/i.test(error.message || '')) {
      const { source, channel, ...schemaCompatiblePayload } = payload;
      ({ data, error } = await supabaseAdmin
        .from('bookings')
        .insert(schemaCompatiblePayload)
        .select()
        .single());
    }

    if (error) {
      console.error('[server] booking insert failed:', error);
      return res.status(error.code === '23505' ? 409 : 400).json({
        message: `Gagal menyimpan booking: ${error.message || 'Unknown error'}`
      });
    }

    return res.status(201).json({ booking: data });
  } catch (error) {
    console.error('[server] unexpected booking error:', error);
    return res.status(500).json({
      message: error?.message || 'Server error saat menyimpan booking.'
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Booking API running at http://localhost:${PORT}`);
});
