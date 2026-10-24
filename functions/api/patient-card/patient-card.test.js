import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost as issuePatientCardToken } from "./token.js";
import { onRequestPost as verifyPatientCardToken } from "./verify.js";
import {
  createPatientCardToken,
  verifyPatientCardToken as verifySignedToken
} from "../../_shared/patient-card.js";

const env = {
  SUPABASE_URL: "https://clinic.example",
  SUPABASE_SECRET_KEY: "server-secret",
  SUPABASE_ANON_KEY: "public-key"
};

const patient = {
  id: "patient-123",
  name: "Ani",
  full_name: "Ani Patient",
  date_of_birth: "1988-01-12",
  medical_record_number: "RM-001",
  internal_patient_code: "GEB-RM0001",
  address: "Jl. Sehat",
  phone: "08123456789"
};

const makeRequest = (path, { token = "session-token", body } = {}) =>
  new Request(`https://clinic.example${path}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

const stubSupabase = (account, booking = null, profileOverrides = {}) => {
  vi.stubGlobal("fetch", vi.fn(async (input) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) {
      return Response.json({ id: "auth-user-1" });
    }
    if (url.includes("/rest/v1/user_accounts?")) {
      return Response.json(account ? [account] : []);
    }
    if (url.includes("/rest/v1/patient_profiles?")) {
      return Response.json([{ ...patient, ...profileOverrides }]);
    }
    if (url.includes("/rest/v1/patient_branch_medical_records?")) {
      if (!profileOverrides.registered_branch_id) return Response.json([]);
      return Response.json([{
        branch_id: profileOverrides.registered_branch_id,
        medical_record_number: patient.medical_record_number
      }]);
    }
    if (url.includes("/rest/v1/dental_branches?")) {
      return Response.json([{ branch_code: "GEB" }]);
    }
    if (url.includes("/rest/v1/bookings?")) {
      return Response.json(booking ? [booking] : []);
    }
    throw new Error(`Unexpected request: ${url}`);
  }));
};

describe("patient card API", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("issues a signed QR token and only returns the linked patient's card data", async () => {
    stubSupabase({ role: "PATIENT", patient_id: patient.id, active: true });

    const response = await issuePatientCardToken({
      request: makeRequest("/api/patient-card/token"),
      env
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.patient).toEqual({
      name: patient.name,
      fullName: patient.full_name,
      dateOfBirth: patient.date_of_birth,
      medicalRecordNumber: patient.medical_record_number,
      internalPatientCode: patient.internal_patient_code,
      address: patient.address,
      phone: patient.phone
    });
    expect(await verifySignedToken(body.token, env.SUPABASE_SECRET_KEY)).toMatchObject({
      sub: patient.id
    });
  });

  it("verifies a permanent branch-prefixed RM QR for staff", async () => {
    stubSupabase({ role: "BRANCH_ADMIN", branch_id: "branch-1", active: true });

    const response = await verifyPatientCardToken({
      request: makeRequest("/api/patient-card/verify", {
        body: { token: patient.internal_patient_code }
      }),
      env
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      patient: {
        id: patient.id,
        internalPatientCode: "GEB-RM0001"
      },
      booking: null
    });
  });

  it("reconstructs the branch-prefixed code from an existing branch RM", async () => {
    stubSupabase(
      { role: "PATIENT", patient_id: patient.id, active: true },
      null,
      { internal_patient_code: null, registered_branch_id: "branch-1" }
    );

    const response = await issuePatientCardToken({
      request: makeRequest("/api/patient-card/token"),
      env
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      patient: {
        medicalRecordNumber: "RM-001",
        internalPatientCode: "GEB-RM-001"
      }
    });
  });

  it("shows an active booking for the scanning branch", async () => {
    const booking = {
      id: "booking-1",
      booking_date_time: "2026-10-24T03:00:00Z",
      time_slot: "10:00",
      status: "CONFIRMED",
      branch_name_snapshot: "Lala Dentist Gebang"
    };
    stubSupabase({ role: "BRANCH_ADMIN", branch_id: "branch-1", active: true }, booking);

    const response = await verifyPatientCardToken({
      request: makeRequest("/api/patient-card/verify", {
        body: { token: patient.internal_patient_code }
      }),
      env
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      booking: {
        id: booking.id,
        timeSlot: "10:00",
        status: "CONFIRMED",
        branchName: "Lala Dentist Gebang"
      }
    });
    const bookingRequest = vi.mocked(fetch).mock.calls.find(([input]) =>
      String(input).includes("/rest/v1/bookings?")
    );
    expect(String(bookingRequest?.[0])).toContain("branch_id=eq.branch-1");
  });

  it("rejects missing sessions and accounts that are not linked patients", async () => {
    const missingSession = await issuePatientCardToken({
      request: makeRequest("/api/patient-card/token", { token: null }),
      env
    });
    expect(missingSession.status).toBe(401);

    stubSupabase({ role: "PATIENT", patient_id: null, active: true });
    const unlinkedPatient = await issuePatientCardToken({
      request: makeRequest("/api/patient-card/token"),
      env
    });
    expect(unlinkedPatient.status).toBe(403);
  });

  it("does not issue a QR token before the first check-in assigns a branch RM", async () => {
    stubSupabase(
      { role: "PATIENT", patient_id: patient.id, active: true },
      null,
      { internal_patient_code: null, medical_record_number: "", registered_branch_id: null }
    );

    const response = await issuePatientCardToken({
      request: makeRequest("/api/patient-card/token"),
      env
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      token: null,
      patient: { internalPatientCode: "" }
    });
  });

  it("verifies signed tokens only for authorized staff and rejects expired or altered tokens", async () => {
    const token = await createPatientCardToken(patient.id, env.SUPABASE_SECRET_KEY);
    stubSupabase({ role: "PATIENT", patient_id: patient.id, active: true });
    const patientResponse = await verifyPatientCardToken({
      request: makeRequest("/api/patient-card/verify", { body: { token } }),
      env
    });
    expect(patientResponse.status).toBe(403);

    stubSupabase({ role: "BRANCH_ADMIN", branch_id: "branch-1", active: true });
    const staffResponse = await verifyPatientCardToken({
      request: makeRequest("/api/patient-card/verify", { body: { token } }),
      env
    });
    expect(staffResponse.status).toBe(200);
    expect(await staffResponse.json()).toMatchObject({
      patient: {
        id: patient.id,
        name: patient.full_name,
        medicalRecordNumber: patient.medical_record_number
      }
    });

    const alteredToken = `${token.slice(0, -1)}x`;
    expect(await verifySignedToken(alteredToken, env.SUPABASE_SECRET_KEY)).toBeNull();

    const expiredNow = Date.now() + 91_000;
    expect(await verifySignedToken(token, env.SUPABASE_SECRET_KEY, expiredNow)).toBeNull();
  });
});
