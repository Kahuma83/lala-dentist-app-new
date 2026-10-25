import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getUnreadCount,
  markDoctorChatRead,
  saveDoctorChatPushSubscription
} from "../../functions/_shared/doctor-chat.js";

const clinicUserId = "10000000-0000-4000-8000-000000000001";
const groupId = "20000000-0000-4000-8000-000000000002";
const lastReadAt = "2026-10-21T10:00:00.000Z";
const environment = {
  SUPABASE_URL: "https://clinic-project.supabase.co",
  SUPABASE_ANON_KEY: "clinic-publishable-key",
  SUPABASE_SECRET_KEY: "sb_secret_clinic_test",
  CHAT_SUPABASE_URL: "https://chat-project.supabase.co",
  CHAT_SUPABASE_SECRET_KEY: "sb_secret_chat_test",
  CHAT_VAPID_PUBLIC_KEY: "B".repeat(87),
  CHAT_VAPID_PRIVATE_KEY: "C".repeat(43),
  CHAT_VAPID_SUBJECT: "mailto:admin@example.com"
};

function createAuthorizedRequest(url: string, init: RequestInit = {}) {
  return new Request(`https://clinic.example${url}`, {
    ...init,
    headers: {
      Authorization: "Bearer test-session-token",
      ...(init.headers || {})
    }
  });
}

function createDoctorFetch(unreadMessages: Array<{ id: string }> = []) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "auth-user-id" }), { status: 200 });
    }
    if (url.includes("/rest/v1/user_accounts?")) {
      return new Response(JSON.stringify([{
        id: clinicUserId,
        name: "Dokter",
        role: "DOCTOR",
        active: true,
        doctor_id: "clinic-doctor-id",
        auth_user_id: "auth-user-id"
      }]), { status: 200 });
    }
    if (url.includes("/rest/v1/dental_doctors?")) {
      return new Response(JSON.stringify([{
        id: "clinic-doctor-id",
        name: "drg. Dokter",
        active: true
      }]), { status: 200 });
    }
    if (url.includes("/rest/v1/chat_groups?")) {
      return new Response(JSON.stringify([{
        id: groupId,
        slug: "all-doctors",
        name: "Grup Dokter"
      }]), { status: 200 });
    }
    if (url.includes("/rest/v1/doctor_chat_read_receipts?") && init?.method === "POST") {
      return new Response(null, { status: 204 });
    }
    if (url.includes("/rest/v1/doctor_chat_read_receipts?")) {
      return new Response(JSON.stringify([{ last_read_at: lastReadAt }]), { status: 200 });
    }
    if (url.includes("/rest/v1/group_chat_messages?")) {
      return new Response(JSON.stringify(unreadMessages), { status: 200 });
    }
    if (url.includes("/rest/v1/doctor_chat_push_subscriptions?")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected chat test request: ${url}`);
  });
}

describe("doctor chat notification endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("counts only messages after the doctor's read receipt", async () => {
    const fetchMock = createDoctorFetch([{ id: "message-1" }, { id: "message-2" }]);
    vi.stubGlobal("fetch", fetchMock);

    const response = await getUnreadCount({
      request: createAuthorizedRequest("/api/chat/unread"),
      env: environment
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ unreadCount: 2, hasMore: false });
    const unreadRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/rest/v1/group_chat_messages?")
    );
    const query = new URL(String(unreadRequest?.[0])).searchParams;
    expect(query.get("sender_clinic_user_id")).toBe(`neq.${clinicUserId}`);
    expect(query.get("created_at")).toBe(`gt.${lastReadAt}`);
  });

  it("caps the badge count while reporting additional unread messages", async () => {
    const fetchMock = createDoctorFetch(Array.from({ length: 101 }, (_, index) => ({ id: `message-${index}` })));
    vi.stubGlobal("fetch", fetchMock);

    const response = await getUnreadCount({
      request: createAuthorizedRequest("/api/chat/unread"),
      env: environment
    });

    await expect(response.json()).resolves.toEqual({ unreadCount: 100, hasMore: true });
  });

  it("updates the read receipt for the authenticated doctor", async () => {
    const fetchMock = createDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);

    const response = await markDoctorChatRead({
      request: createAuthorizedRequest("/api/chat/unread", { method: "POST" }),
      env: environment
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Date.parse(body.lastReadAt)).not.toBeNaN();
    const updateRequest = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes("/rest/v1/doctor_chat_read_receipts?") && init?.method === "POST"
    );
    expect(JSON.parse(String(updateRequest?.[1]?.body))).toMatchObject({
      group_id: groupId,
      clinic_user_id: clinicUserId,
      last_read_at: body.lastReadAt
    });
  });

  it("stores a validated push subscription against the authenticated doctor", async () => {
    const fetchMock = createDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);
    const subscription = {
      endpoint: "https://push.example.test/subscription-id",
      keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) }
    };

    const response = await saveDoctorChatPushSubscription({
      request: createAuthorizedRequest("/api/chat/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription)
      }),
      env: environment
    });

    expect(response.status).toBe(200);
    const savedRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/rest/v1/doctor_chat_push_subscriptions?")
    );
    expect(JSON.parse(String(savedRequest?.[1]?.body))).toMatchObject({
      group_id: groupId,
      clinic_user_id: clinicUserId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth
    });
  });

  it("rejects push subscription setup until server-side VAPID keys exist", async () => {
    const fetchMock = createDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveDoctorChatPushSubscription({
      request: createAuthorizedRequest("/api/chat/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: "https://push.example.test/subscription-id",
          keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) }
        })
      }),
      env: { ...environment, CHAT_VAPID_PRIVATE_KEY: "" }
    })).rejects.toMatchObject({
      status: 503,
      message: "Notifikasi push belum dikonfigurasi di server."
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects insecure push subscription endpoints", async () => {
    const fetchMock = createDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveDoctorChatPushSubscription({
      request: createAuthorizedRequest("/api/chat/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: "http://push.example.test/subscription-id",
          keys: { p256dh: "A".repeat(87), auth: "B".repeat(22) }
        })
      }),
      env: environment
    })).rejects.toMatchObject({
      status: 400,
      message: "Data notifikasi tidak lengkap atau tidak valid."
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
