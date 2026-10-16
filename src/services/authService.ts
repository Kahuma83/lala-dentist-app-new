import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { MockDatabase } from "../data/mockData";
import { UserRole, UserAccount } from "../types/domain";
import { createClient } from "@supabase/supabase-js";

export interface AuthenticatedUserContext {
  authUserId: string;
  userAccountId: string;
  role: UserRole;
  staffId?: string | null;
  patientId?: string | null;
  assignedBranchId?: string | null;
  doctorId?: string | null;
  isMockFallback?: boolean;
}

export interface PatientRegistrationDetails {
  phone: string;
  dateOfBirth: string;
  gender: "L" | "P";
  address: string;
}

export class AuthService {
  static async registerPatientAccount(
    email: string,
    password: string,
    name: string,
    patientDetails: PatientRegistrationDetails
  ): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error("Pendaftaran akun pasien memerlukan koneksi Supabase.");
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();
    const cleanPhone = patientDetails.phone.trim();
    const cleanAddress = patientDetails.address.trim();
    if (!cleanName) throw new Error("Nama lengkap wajib diisi.");
    if (cleanName.length > 150) throw new Error("Nama lengkap maksimal 150 karakter.");
    if (!cleanEmail) throw new Error("Email wajib diisi.");
    if (cleanEmail.length > 100) throw new Error("Email maksimal 100 karakter.");
    if (password.length < 8) throw new Error("Kata sandi minimal 8 karakter.");
    if (!cleanPhone) throw new Error("Nomor HP wajib diisi.");
    if (cleanPhone.length > 30) throw new Error("Nomor HP maksimal 30 karakter.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patientDetails.dateOfBirth)
      || Number.isNaN(Date.parse(`${patientDetails.dateOfBirth}T00:00:00Z`))
      || new Date(`${patientDetails.dateOfBirth}T00:00:00Z`).toISOString().slice(0, 10) !== patientDetails.dateOfBirth) {
      throw new Error("Tanggal lahir tidak valid.");
    }
    if (patientDetails.dateOfBirth > new Date().toISOString().slice(0, 10)) {
      throw new Error("Tanggal lahir tidak boleh di masa depan.");
    }
    if (patientDetails.gender !== "L" && patientDetails.gender !== "P") {
      throw new Error("Jenis kelamin wajib dipilih.");
    }
    if (!cleanAddress) throw new Error("Alamat lengkap wajib diisi.");
    if (cleanAddress.length > 500) throw new Error("Alamat maksimal 500 karakter.");
    if (/@laladentist\.(com|id)$/i.test(cleanEmail)) {
      throw new Error("Email internal klinik tidak dapat digunakan untuk pendaftaran akun pasien.");
    }

    const { error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          account_type: "patient_portal",
          name: cleanName,
          phone: cleanPhone,
          date_of_birth: patientDetails.dateOfBirth,
          gender: patientDetails.gender,
          address: cleanAddress
        },
        emailRedirectTo: `${window.location.origin}/patient/login?type=signup-confirmed`
      }
    });
    if (error) {
      if (/rate limit|over_email_send_rate_limit/i.test(error.message)) {
        throw new Error("Terlalu banyak permintaan email verifikasi. Tunggu sebelum mencoba lagi, lalu periksa kotak masuk dan folder spam. Jangan daftar ulang selama menunggu.");
      }
      throw new Error(`Pendaftaran akun gagal: ${error.message}`);
    }
  }

  static async resendPatientConfirmation(email: string): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error("Pengiriman ulang verifikasi memerlukan koneksi Supabase.");
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) throw new Error("Email wajib diisi.");

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: cleanEmail,
      options: {
        emailRedirectTo: `${window.location.origin}/patient/login?type=signup-confirmed`
      }
    });
    if (error) {
      if (/rate limit|over_email_send_rate_limit/i.test(error.message)) {
        throw new Error("Terlalu banyak permintaan email verifikasi. Tunggu sebelum meminta tautan baru, lalu periksa kotak masuk dan folder spam.");
      }
      throw new Error(`Gagal mengirim ulang verifikasi: ${error.message}`);
    }
  }

  static async listUserAccounts(): Promise<UserAccount[]> {
    if (!isSupabaseConfigured || typeof supabase?.from !== "function") {
      throw new Error("Supabase belum dikonfigurasi; daftar akun login tidak tersedia.");
    }

    const { data, error } = await supabase.from("user_accounts").select("*");
    if (error) {
      throw new Error(`Gagal membaca akun login dari Supabase: ${error.message}`);
    }

    return (data || []).map((row: any) => ({
      id: row.id,
      authUserId: row.auth_user_id || undefined,
      username: row.username || row.email?.split("@")[0] || "",
      email: row.email || undefined,
      name: row.name || "",
      role: row.role as UserRole,
      staffId: row.staff_id || null,
      patientId: row.patient_id || null,
      doctorId: row.doctor_id || null,
      branchId: row.branch_id || null,
      active: row.active ?? true,
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || ""
    }));
  }

  static isLegacySeededAccount(account?: UserAccount | null): boolean {
    if (!account) return false;

    const legacyPattern = /^user-[a-z0-9_-]+-(ambulu|gebang|kampus|kencong|lengkong|muktisari)$/i;
    if (typeof account.id === "string" && legacyPattern.test(account.id)) {
      return true;
    }

    const explicitLegacyIds = new Set([
      "user-dinda-ambulu",
      "user-anisa-ambulu",
      "user-marsa-ambulu",
      "user-anggel-gebang",
      "user-lilis-gebang",
      "user-cece-gebang",
      "user-linda-gebang",
      "user-novi-gebang",
      "user-ayik-kampus",
      "user-usnake-kencong",
      "user-cyntia-kencong",
      "user-khalisa-kencong",
      "user-anita-kencong",
      "user-rani-lengkong",
      "user-safira-muktisari",
      "user-drg-syafira",
      "assistant-clary"
    ]);

    return explicitLegacyIds.has(account.id || "");
  }

  private static findMatchingUserAccount(input: string): UserAccount | undefined {
    const db = MockDatabase.getInstance();
    const clean = input.toLowerCase().trim();
    const prefix = clean.split("@")[0];

    // Explicitly reject old/legacy admin emails and aliases from acquiring Super Admin privilege
    if (
      clean === "superadmin@laladentist.com" ||
      clean === "super@laladentist.com" ||
      clean === "nonapresident@gmail.com" ||
      clean === "lala_super" ||
      clean === "admin"
    ) {
      return undefined;
    }

    // Official designated Super Admin identity ONLY
    if (clean === "superadmin@laladentist.id" || clean === "superadmin") {
      const superAcc = db.userAccounts.find((a) => a.email === "superadmin@laladentist.id" && a.role === UserRole.SUPER_ADMIN);
      if (superAcc) return superAcc;
    }

    const isDindaAlias = (val: string) =>
      val === "dinda" || val === "dinda_ambulu" || val === "dinda_admin" || val === "dinda@laladentist.com";
    if (isDindaAlias(clean) || isDindaAlias(prefix)) {
      const acc = db.userAccounts.find((a) => a.id === "user-dinda-ambulu" || a.username === "dinda");
      if (acc) return acc;
    }

    const isAnisaAlias = (val: string) =>
      val === "anisa" || val === "anisa_ambulu" || val === "anisa_assistant" || val === "anisa@laladentist.com";
    if (isAnisaAlias(clean) || isAnisaAlias(prefix)) {
      const acc = db.userAccounts.find((a) => a.id === "user-anisa-ambulu" || a.username === "anisa");
      if (acc) return acc;
    }

    const isMarsaAlias = (val: string) =>
      val === "marsa" || val === "marsa_ambulu" || val === "marsa_assistant" || val === "marsa@laladentist.com";
    if (isMarsaAlias(clean) || isMarsaAlias(prefix)) {
      const acc = db.userAccounts.find((a) => a.id === "user-marsa-ambulu" || a.username === "marsa");
      if (acc) return acc;
    }

    const byUserAccount = [...db.userAccounts]
      .sort((a, b) => Number(b.active !== false) - Number(a.active !== false))
      .find((a) => {
        const accEmail = a.email?.toLowerCase();
        const accUsername = a.username.toLowerCase();
        const accPrefix = accEmail ? accEmail.split("@")[0] : "";
        return (
          accEmail === clean ||
          accUsername === clean ||
          (accPrefix === clean && a.role !== UserRole.SUPER_ADMIN) ||
          (accPrefix === prefix && a.role !== UserRole.SUPER_ADMIN)
        );
      });
    if (byUserAccount) return byUserAccount;

    // Check matching staff by phone number or employee code
    const cleanDigits = clean.replace(/[^0-9]/g, "");
    if (cleanDigits.length >= 6) {
      const staffByPhone = db.staff.find(
        (s) => s.phone && s.phone.replace(/[^0-9]/g, "") === cleanDigits
      );
      if (staffByPhone) {
        const acc = db.userAccounts.find((a) => a.staffId === staffByPhone.id || a.id === staffByPhone.userAccountId);
        if (acc) return acc;
      }
    }

    const staffByCode = db.staff.find(
      (s) => s.employeeCode && s.employeeCode.toLowerCase() === clean
    );
    if (staffByCode) {
      const acc = db.userAccounts.find((a) => a.staffId === staffByCode.id || a.id === staffByCode.userAccountId);
      if (acc) return acc;
    }

    return undefined;
  }

  /**
   * Normalizes a staff username to lowercase, trimmed, with alphanumeric and underscores/hyphens.
   */
  static normalizeUsername(username: string): string {
    return (username || "").trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
  }

  /**
   * Deterministically maps a normalized staff username to the internal Supabase Auth email.
   * Format: <normalized_username>@laladentist.id
   */
  static usernameToInternalEmail(username: string): string {
    const clean = this.normalizeUsername(username);
    return `${clean}@laladentist.id`;
  }

  /**
   * Signs in a user using email or username and password.
   * Staff login: Username + Password.
   * Patient / Super Admin login: Email + Password.
   * Uses real Supabase authentication when configured, otherwise falls back to mock simulation for development/testing.
   * STRICT SECURITY: Never attempts silent auto-provisioning on failed login.
   */
  private static async lookupUserAccountFromServer(identifier: string): Promise<Pick<UserAccount, "email" | "active"> | undefined> {
    if (typeof window === "undefined" || typeof fetch !== "function") {
      return undefined;
    }

    try {
      const response = await fetch('/api/auth/lookup-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernameOrEmail: identifier })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (response.status === 404) return undefined;
        throw new Error(payload?.message || `Gagal membaca akun login (HTTP ${response.status}).`);
      }

      const payload = await response.json().catch(() => ({}));
      const account = payload?.account;
      if (!account) {
        return undefined;
      }

      return {
        email: account.email || undefined,
        active: Boolean(account.active)
      };
    } catch (error: unknown) {
      if (error instanceof Error) throw error;
      throw new Error("Gagal terhubung ke layanan akun login.");
    }
  }

  static async signIn(emailOrUsername: string, password?: string): Promise<{ session: any; user: any; context: AuthenticatedUserContext }> {
    if (!isSupabaseConfigured && !(typeof process !== "undefined" && process.env.VITEST)) {
      throw new Error("Supabase belum dikonfigurasi. Login lokal/demo dinonaktifkan.");
    }
    if (!emailOrUsername || emailOrUsername.trim() === "") {
      throw new Error("Email atau username tidak boleh kosong");
    }

    const cleanInput = emailOrUsername.toLowerCase().trim();

    // Check if input is a disallowed legacy admin alias
    if (
      cleanInput === "superadmin@laladentist.com" ||
      cleanInput === "super@laladentist.com" ||
      cleanInput === "nonapresident@gmail.com"
    ) {
      throw new Error("Email atau password salah");
    }

    const isEmailInput = cleanInput.includes("@");
    let resolvedEmail = cleanInput;
    let matchingAccount: UserAccount | undefined;
    let accountLoginMetadata: Pick<UserAccount, "email" | "active"> | undefined;

    if (!isSupabaseConfigured && typeof process !== "undefined" && process.env.VITEST) {
      matchingAccount = this.findMatchingUserAccount(cleanInput);
    } else if (isEmailInput) {
      // Patient or Super Admin login using Email + Password
      resolvedEmail = cleanInput;
    } else {
      // Staff login using Username + Password
      const normalizedUser = this.normalizeUsername(cleanInput);

      if (!matchingAccount && !isSupabaseConfigured) {
        matchingAccount = this.findMatchingUserAccount(normalizedUser);
      }

      if (!matchingAccount && isSupabaseConfigured) {
        accountLoginMetadata = await this.lookupUserAccountFromServer(normalizedUser);
      }

      // Check if username is registered
      const accountForLogin = isSupabaseConfigured ? accountLoginMetadata : matchingAccount;
      if (!accountForLogin) {
        throw new Error(`Username '${emailOrUsername}' tidak terdaftar di sistem`);
      }

      // Check if account is active
      if (!accountForLogin.active) {
        throw new Error("Akun Anda tidak aktif. Silakan hubungi administrator.");
      }

      resolvedEmail = accountForLogin.email || this.usernameToInternalEmail(normalizedUser);
    }

    if (isSupabaseConfigured) {
      if (!password || password.trim() === "") {
        throw new Error("Password tidak boleh kosong");
      }

      // PRODUCTION / REAL SUPABASE AUTH
      let data: any;
      let authError: any;
      try {
        const res = await supabase.auth.signInWithPassword({
          email: resolvedEmail,
          password
        });
        data = res.data;
        authError = res.error;
      } catch (networkErr: any) {
        console.warn("AuthService network exception:", networkErr);
        throw new Error("Gagal terhubung ke server autentikasi Supabase. Periksa koneksi internet Anda.");
      }

      if (authError?.message?.toLowerCase().includes("email not confirmed")) {
        throw new Error("Email belum diverifikasi. Silakan buka email Anda dan klik tautan verifikasi sebelum masuk.");
      }

      if (authError) {
        const isCredentialError =
          authError.status === 400 ||
          authError.message?.toLowerCase().includes("invalid login credentials") ||
          authError.message?.toLowerCase().includes("invalid credentials");

        if (isCredentialError) {
          // Production mode must never silently fallback to mock session data.
          if (isEmailInput) {
            throw new Error("Email atau password salah");
          }
          throw new Error("Username atau password salah");
        }

        const isNetworkError =
          authError.name === "AuthRetryableFetchError" ||
          authError.message?.toLowerCase().includes("fetch") ||
          authError.message?.toLowerCase().includes("network") ||
          authError.message?.toLowerCase().includes("failed to fetch");

        if (isNetworkError) {
          throw new Error("Gagal terhubung ke server autentikasi Supabase. Periksa koneksi internet Anda.");
        }

        throw new Error(authError.message || "Autentikasi gagal. Silakan periksa kembali akun Anda.");
      }

      if (!data?.session || !data?.user) {
        throw new Error("Sesi autentikasi Supabase tidak valid atau tidak ditemukan");
      }

      const context = await this.resolveUserContext(data.user.id, data.user.email || null);
      return { session: data.session, user: data.user, context };
    } else {
      // DEVELOPMENT / TEST MOCK MODE
      const account = matchingAccount || this.findMatchingUserAccount(cleanInput);

      if (!account) {
        if (isEmailInput) {
          throw new Error("User tidak ditemukan di sistem");
        } else {
          throw new Error(`Username '${emailOrUsername}' tidak terdaftar di sistem`);
        }
      }

      if (!account.active) {
        throw new Error("Akun Anda tidak aktif. Silakan hubungi administrator.");
      }

      if (account.password && password && account.password.trim() !== "") {
        const isMatch =
          account.password === password ||
          (account.password === "laladentist123" && (password === "laladentist123" || password === "123456")) ||
          (account.password === "123456" && (password === "laladentist123" || password === "123456"));
        if (!isMatch) {
          throw new Error("Password yang Anda masukkan salah. Silakan periksa kembali.");
        }
      }

      // Generate a mock auth user identity
      const mockUser = {
        id: account.authUserId || `mock-auth-${account.id}`,
        email: account.email || `${account.username}@laladentist.com`,
        name: account.name,
        user_metadata: { name: account.name }
      };

      const mockSession = {
        access_token: "mock-token",
        user: mockUser
      };

      // Bind simulated authUserId
      account.authUserId = mockUser.id;

      const context: AuthenticatedUserContext = {
        authUserId: mockUser.id,
        userAccountId: account.id,
        role: account.role,
        staffId: account.staffId,
        patientId: account.role === UserRole.PATIENT ? account.id : null,
        assignedBranchId: account.branchId,
        doctorId: account.doctorId || null
      };

      return { session: mockSession, user: mockUser, context };
    }
  }

  /**
   * Signs out the currently authenticated user.
   */
  static async signOut(): Promise<void> {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
  }

  /**
   * Retrieves the current Supabase session.
   */
  static async getCurrentSession(): Promise<any> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw new Error(`Gagal membaca sesi Supabase: ${error.message}`);
      }
      return data.session;
    }
    return null;
  }

  /**
   * Retrieves the currently logged-in user object.
   */
  static async getCurrentUser(): Promise<any> {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        throw new Error(`Gagal membaca pengguna Supabase: ${error.message}`);
      }
      return data.user;
    }
    return null;
  }

  /**
   * Listens for auth state changes.
   */
  static onAuthStateChange(callback: (event: string, session: any) => void): { unsubscribe: () => void } {
    if (isSupabaseConfigured) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
      });
      return {
        unsubscribe: () => {
          data.subscription.unsubscribe();
        }
      };
    }
    // Return dummy unsubscriber in mock mode
    return { unsubscribe: () => {} };
  }

  /**
   * Updates password for the current authenticated user.
   * If currentPassword is provided and email is present, re-authenticates to securely verify old password.
   */
  static async changePassword(
    newPassword: string,
    currentPassword?: string,
    email?: string | null
  ): Promise<void> {
    if (!newPassword || newPassword.trim() === "") {
      throw new Error("Password baru tidak boleh kosong");
    }
    if (newPassword.length < 6) {
      throw new Error("Password baru minimal harus 6 karakter");
    }

    if (isSupabaseConfigured) {
      // If currentPassword & email provided, verify old password first
      if (currentPassword && email) {
        const { error: verifyError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password: currentPassword
        });
        if (verifyError) {
          throw new Error("Password saat ini salah. Silakan periksa kembali.");
        }
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        throw new Error(updateError.message || "Gagal memperbarui password di Supabase Auth");
      }
      } else {
        // Mock mode for local tests/development
        if (!(typeof process !== "undefined" && process.env.VITEST)) {
          throw new Error("Supabase belum dikonfigurasi. Perubahan kata sandi lokal/demo dinonaktifkan.");
        }
        const db = MockDatabase.getInstance();
      if (email) {
        const acc = db.userAccounts.find(
          (a) => a.email?.toLowerCase() === email.toLowerCase()
        );
        if (acc) {
          if (currentPassword && acc.password && acc.password !== currentPassword) {
            throw new Error("Password saat ini salah. Silakan periksa kembali.");
          }
          acc.password = newPassword;
          acc.updatedAt = new Date().toISOString();
        }
      }
    }
  }

  /**
   * Requests a password reset email via Supabase Auth.
   */
  static async requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
    if (!email || email.trim() === "") {
      throw new Error("Email wajib diisi");
    }

    const cleanEmail = email.trim().toLowerCase();

    // Disallow deprecated admin email aliases
    if (
      cleanEmail === "superadmin@laladentist.com" ||
      cleanEmail === "super@laladentist.com" ||
      cleanEmail === "nonapresident@gmail.com"
    ) {
      throw new Error("Email ini tidak terdaftar sebagai akun aktif.");
    }

    if (isSupabaseConfigured) {
      const redirectUrl =
        redirectTo ||
        (typeof window !== "undefined"
          ? `${window.location.origin}/login?mode=recovery`
          : undefined);

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl
      });

      if (error) {
        throw new Error(error.message || "Gagal mengirimkan instruksi pemulihan password");
      }
    } else {
      // Mock mode
      const db = MockDatabase.getInstance();
      const acc = db.userAccounts.find((a) => a.email?.toLowerCase() === cleanEmail);
      if (!acc) {
        // Safe feedback without leaking sensitive timing or errors
      }
    }
  }

  /**
   * Completes password reset when user accesses the app with a recovery token/session.
   */
  static async resetPassword(newPassword: string): Promise<void> {
    if (!newPassword || newPassword.trim() === "") {
      throw new Error("Password baru tidak boleh kosong");
    }
    if (newPassword.length < 6) {
      throw new Error("Password baru minimal harus 6 karakter");
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) {
        throw new Error(error.message || "Gagal mengatur ulang kata sandi");
      }
    }
  }

  /**
   * Core identity mapping: Resolves a Supabase Auth UUID & email into the matching domain UserAccount, Staff/Patient context.
   * Throws safe errors for inactive or invalid accounts.
   */
  static async resolveUserContext(authUserId: string, email: string | null): Promise<AuthenticatedUserContext> {
    if (isSupabaseConfigured && typeof supabase?.from === "function") {
      try {
        let q = supabase.from("user_accounts").select("*");
        if (email) {
          q = q.or(`auth_user_id.eq.${authUserId},email.eq.${email}`);
        } else {
          q = q.eq("auth_user_id", authUserId);
        }
        const { data: dbAccount, error } = await q.maybeSingle();

        if (dbAccount && !error) {
          if (!dbAccount.active) {
            throw new Error("Akun Anda dinonaktifkan. Akses ditolak.");
          }
          const role = dbAccount.role as UserRole;
          if (!Object.values(UserRole).includes(role)) {
            throw new Error("Peran pengguna (UserRole) tidak valid");
          }
          return {
            authUserId,
            userAccountId: dbAccount.id,
            role,
            staffId: dbAccount.staff_id || null,
            patientId: role === UserRole.PATIENT ? dbAccount.patient_id || null : null,
            assignedBranchId: dbAccount.branch_id || null,
            doctorId: role === UserRole.DOCTOR ? dbAccount.doctor_id || null : null,
            isMockFallback: false
          };
        }

        if (!error) {
          throw new Error("Akun pengguna belum dipetakan ke user_accounts. Gunakan alur pembuatan akun real yang aman.");
        }

        throw new Error(error?.message || "Gagal membaca profil akun real dari database.");
      } catch (err: any) {
        if (err.message?.includes("dinonaktifkan") || err.message?.includes("tidak valid") || err.message?.includes("Akun pengguna belum dipetakan") || err.message?.includes("profil akun real")) {
          throw err;
        }
        if (!(typeof process !== "undefined" && process.env.VITEST)) {
          throw err;
        }
      }
    }

    if (!(typeof process !== "undefined" && process.env.VITEST)) {
      throw new Error("Supabase belum dikonfigurasi. Pemetaan akun lokal/demo dinonaktifkan.");
    }
    const db = MockDatabase.getInstance();

    // 1. Match by authUserId
    let account = db.userAccounts.find((a) => a.authUserId === authUserId || a.id === authUserId);

    // 2. Fallback: match by email to bind initial seed user
    if (!account && email) {
      const cleanEmail = email.toLowerCase().trim();
      if (
        cleanEmail === "superadmin@laladentist.com" ||
        cleanEmail === "super@laladentist.com" ||
        cleanEmail === "nonapresident@gmail.com"
      ) {
        throw new Error(`Email ${cleanEmail} bukan akun administrator resmi.`);
      }
      account = this.findMatchingUserAccount(email);
      if (account) {
        account.authUserId = authUserId;
      }
    }

    if (!account) {
      throw new Error("Akun pengguna (UserAccount) tidak ditemukan di database klinik");
    }

    // Role security check: only superadmin@laladentist.id can be SUPER_ADMIN
    if (account.role === UserRole.SUPER_ADMIN && account.email !== "superadmin@laladentist.id") {
      throw new Error("Akses Super Admin hanya diizinkan untuk superadmin@laladentist.id");
    }

    // Account status validation
    if (!account.active) {
      throw new Error("Akun Anda dinonaktifkan. Akses ditolak.");
    }

    // Role validation
    if (!Object.values(UserRole).includes(account.role)) {
      throw new Error("Peran pengguna (UserRole) tidak valid");
    }

    // Map context fields safely
    return {
      authUserId,
      userAccountId: account.id,
      role: account.role,
      staffId: account.staffId || null,
      patientId: account.role === UserRole.PATIENT ? account.id : null,
      assignedBranchId: account.branchId || null,
      doctorId: account.doctorId || null,
      isMockFallback: isSupabaseConfigured
    };
  }

  /**
   * Updates a user account, adhering strictly to the PostgreSQL RLS & field protection trigger policies.
   * - In real Supabase mode: Executes supabase.from("user_accounts").update(patch).eq("id", targetAccountId)
   * - In mock/test mode: Enforces identical RLS + trigger restrictions to guarantee zero privilege escalation:
   *   1. Non-superadmins can only update their own row (RLS USING check).
   *   2. Non-superadmins cannot modify role, staffId, patientId, branchId, active, authUserId, or id.
   *   3. SUPER_ADMIN has full administrative authority.
   */
  static async updateUserAccount(
    actorContext: AuthenticatedUserContext,
    targetAccountId: string,
    patch: Partial<UserAccount>
  ): Promise<UserAccount> {
    const isSuperAdmin = actorContext.role === UserRole.SUPER_ADMIN;

    // RLS Check: Non-superadmins can only target their own account
    if (!isSuperAdmin) {
      const isOwner =
        targetAccountId === actorContext.userAccountId ||
        targetAccountId === actorContext.authUserId;
      if (!isOwner) {
        throw new Error("Permission denied: Cannot update other user accounts (RLS violation)");
      }

      // Trigger Check: trg_protect_user_fields
      if (patch.role !== undefined) {
        throw new Error("Privilege escalation rejected: role modification is restricted to SUPER_ADMIN.");
      }

      if (patch.authUserId !== undefined) {
        throw new Error("Identity tampering rejected: auth_user_id is immutable.");
      }

      if (patch.id !== undefined && patch.id !== targetAccountId) {
        throw new Error("Identity tampering rejected: id is immutable.");
      }

      if (patch.staffId !== undefined) {
        throw new Error("Authorization tampering rejected: staff_id modification is restricted to SUPER_ADMIN.");
      }

      if (patch.patientId !== undefined) {
        throw new Error("Authorization tampering rejected: patient_id modification is restricted to SUPER_ADMIN.");
      }

      if (patch.branchId !== undefined) {
        throw new Error("Authorization tampering rejected: branch_id modification is restricted to SUPER_ADMIN.");
      }

      if (patch.active !== undefined) {
        throw new Error("Status tampering rejected: account active status modification is restricted to SUPER_ADMIN.");
      }
    }

    const db = MockDatabase.getInstance();
    const target = db.userAccounts.find((a) => a.id === targetAccountId || a.authUserId === targetAccountId);
    if (target) {
      Object.assign(target, patch, { updatedAt: new Date().toISOString() });
    }

    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase
          .from("user_accounts")
          .update(patch)
          .eq("id", targetAccountId)
          .select()
          .single();

        if (error) {
          if (target && typeof process !== "undefined" && process.env.VITEST) {
            return target;
          }
          throw new Error(error.message);
        }
        if (!data) {
          throw new Error("Supabase tidak mengembalikan data akun setelah pembaruan.");
        }
        return {
          id: data.id,
          authUserId: data.auth_user_id,
          username: data.username,
          email: data.email || undefined,
          name: data.name,
          role: data.role as UserRole,
          staffId: data.staff_id || null,
          patientId: data.patient_id || null,
          doctorId: data.doctor_id || null,
          branchId: data.branch_id || null,
          active: data.active ?? true,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
      } catch (err: any) {
        if (target && typeof process !== "undefined" && process.env.VITEST) {
          return target;
        }
        throw err;
      }
    }

    if (!target) {
      throw new Error("Target user account not found");
    }

    return target;
  }

  /**
  * Creates a new staff/doctor login account securely in Supabase Auth & user_accounts.
  * Enforces Super Admin authorization, username uniqueness, password strength, and branch binding.
  */
  /**
   * Compatibility alias used by the admin UI and newer secure flows.
   * The browser app depends on this method name, so it must forward to the
   * real, backend-backed createStaffAccount implementation.
   */
  static async createStaffAccountSecure(
    actorContext: AuthenticatedUserContext,
    params: {
      username: string;
      name: string;
      role: UserRole;
      branchId?: string | null;
      password: string;
      staffId?: string | null;
      doctorId?: string | null;
    }
  ): Promise<UserAccount> {
    return this.createStaffAccount(actorContext, params);
  }

  static async createStaffAccount(
    actorContext: AuthenticatedUserContext,
    params: {
      username: string;
      name: string;
      role: UserRole;
      branchId?: string | null;
      password: string;
      staffId?: string | null;
      doctorId?: string | null;
    }
  ): Promise<UserAccount> {
    if (isSupabaseConfigured) {
      const actorAuthId = actorContext.authUserId;
      if (!actorAuthId || /^(user-|auth-|patient-)/i.test(actorAuthId)) {
        throw new Error("Sesi login Anda belum terhubung ke akun Supabase yang valid. Silakan login ulang dan coba lagi.");
      }
    }
    if (actorContext.role !== UserRole.SUPER_ADMIN) {
      throw new Error("Permission denied: Only SUPER_ADMIN can create staff accounts.");
    }

    const username = this.normalizeUsername(params.username);
    if (!username || username.length < 3) {
      throw new Error("Username minimal 3 karakter");
    }
    if (!params.password || params.password.length < 6) {
      throw new Error("Password minimal harus 6 karakter");
    }
    if (!params.name || params.name.trim() === "") {
      throw new Error("Nama lengkap wajib diisi");
    }

    // Role validation: Staff roles allowed
    const allowedRoles = [UserRole.BRANCH_ADMIN, UserRole.DOCTOR, UserRole.DOCTOR_ASSISTANT];
    if (!allowedRoles.includes(params.role)) {
      throw new Error(`Role ${params.role} tidak diizinkan untuk pembuatan akun staf`);
    }

    // Branch assignment validation
    if (
      (params.role === UserRole.BRANCH_ADMIN || params.role === UserRole.DOCTOR_ASSISTANT) &&
      !params.branchId
    ) {
      throw new Error(`Cabang penempatan wajib dipilih untuk role ${params.role}`);
    }

    const syntheticEmail = this.usernameToInternalEmail(username);

    if (isSupabaseConfigured) {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (sessionError || !accessToken) {
        throw new Error("Sesi autentikasi SUPER_ADMIN tidak valid. Silakan login ulang.");
      }

      const response = await fetch("/api/staff", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          username,
          name: params.name,
          role: params.role,
          branchId: params.branchId || null,
          password: params.password,
          staffId: params.staffId || null,
          doctorId: params.doctorId || null
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.message || "Gagal membuat akun staf di server autentikasi.");
      }

      const account = payload?.account as UserAccount | undefined;
      if (!account) {
        throw new Error("Server tidak mengembalikan profil akun staf yang valid.");
      }

      return account;
    } else {
      // Mock mode
      if (!(typeof process !== "undefined" && process.env.VITEST)) {
        throw new Error("Supabase belum dikonfigurasi. Pembuatan akun lokal tidak diizinkan.");
      }
      const db = MockDatabase.getInstance();
      db.userAccounts
        .filter((account) => this.isLegacySeededAccount(account) && account.username.toLowerCase() === username)
        .forEach((account) => {
          account.active = false;
          account.updatedAt = new Date().toISOString();
        });
      const existing = db.userAccounts.find(
        (a) => !this.isLegacySeededAccount(a) && (a.username.toLowerCase() === username || a.email?.toLowerCase() === syntheticEmail)
      );
      if (existing) {
        throw new Error(`Username '${username}' sudah terdaftar.`);
      }

      const newId = `user-${Date.now()}`;
      const newAccount: UserAccount = {
        id: newId,
        authUserId: `auth-${newId}`,
        username,
        email: syntheticEmail,
        name: params.name,
        role: params.role,
        branchId: params.branchId || null,
        staffId: params.staffId || null,
        doctorId: params.doctorId || null,
        active: true,
        password: params.password,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      db.userAccounts.push(newAccount);

      return newAccount;
    }
  }

  /**
   * Dedicated recovery & synchronization tool for staff accounts.
   * Can ONLY be invoked by an active SUPER_ADMIN.
   * Never invoked during login.
   * Resolves integrity issues when a staff user exists in user_accounts but requires auth synchronization.
   */
  static async recoverOrSyncStaffAccount(
    actorContext: AuthenticatedUserContext,
    params: {
      userAccountId: string;
      newInitialPassword?: string;
    }
  ): Promise<{ success: boolean; message: string; account: UserAccount }> {
    if (actorContext.role !== UserRole.SUPER_ADMIN) {
      throw new Error("Akses ditolak: Hanya Super Admin yang berhak memulihkan akun staf.");
    }

    const db = MockDatabase.getInstance();
    let account = db.userAccounts.find((a) => a.id === params.userAccountId);

    if (isSupabaseConfigured && typeof supabase?.from === "function") {
      const { data: dbAcc } = await supabase
        .from("user_accounts")
        .select("*")
        .eq("id", params.userAccountId)
        .maybeSingle();

      if (dbAcc) {
        account = {
          id: dbAcc.id,
          authUserId: dbAcc.auth_user_id,
          username: dbAcc.username,
          email: dbAcc.email,
          name: dbAcc.name,
          role: dbAcc.role as UserRole,
          branchId: dbAcc.branch_id || null,
          staffId: dbAcc.staff_id || null,
          patientId: dbAcc.patient_id || null,
          active: dbAcc.active,
          createdAt: dbAcc.created_at,
          updatedAt: dbAcc.updated_at
        };
      }
    }

    if (!account) {
      throw new Error("Akun pengguna tidak ditemukan di database.");
    }

    const passwordToUse = params.newInitialPassword || "laladentist123";
    const syntheticEmail = account.email || this.usernameToInternalEmail(account.username);

    if (isSupabaseConfigured) {
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL || "",
        import.meta.env.VITE_SUPABASE_ANON_KEY || "",
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

      const { data: authData, error: authErr } = await tempClient.auth.signUp({
        email: syntheticEmail,
        password: passwordToUse,
        options: {
          data: {
            username: account.username,
            name: account.name,
            role: account.role
          }
        }
      });

      if (authData?.user) {
        const newAuthId = authData.user.id;
        await supabase
          .from("user_accounts")
          .update({ auth_user_id: newAuthId, updated_at: new Date().toISOString() })
          .eq("id", account.id);
        account.authUserId = newAuthId;
      }
    }

    if (account) {
      account.password = passwordToUse;
    }

    return {
      success: true,
      message: `Akun staf '${account.username}' berhasil dipulihkan dengan kata sandi baru.`,
      account
    };
  }
}
