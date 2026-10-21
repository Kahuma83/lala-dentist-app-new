import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  onRequestGet,
  onRequestPost
} from "../../functions/api/chat/messages.js";
import {
  onRequestDelete as onRequestUnpin,
  onRequestPut as onRequestPin
} from "../../functions/api/chat/messages/[id]/pin.js";
import {
  onRequestDelete as onRequestDeleteMessage
} from "../../functions/api/chat/messages/[id].js";
import {
  onRequestPut as onRequestUpdateGroupSubtitle
} from "../../functions/api/chat/group.js";

const environment = {
  SUPABASE_URL: "https://clinic-project.supabase.co",
  SUPABASE_ANON_KEY: "clinic-publishable-key",
  SUPABASE_SECRET_KEY: "sb_secret_clinic_test",
  CHAT_SUPABASE_URL: "https://chat-project.supabase.co",
  CHAT_SUPABASE_SECRET_KEY: "sb_secret_chat_test"
};

const createAuthorizedRequest = (url: string, init?: RequestInit) => new Request(
  `https://clinic.example${url}`,
  {
    ...init,
    headers: {
      Authorization: "Bearer clinic-access-token",
      ...(init?.headers || {})
    }
  }
);

function createSuccessfulDoctorFetch(options: {
  accountId?: string;
  messages?: Array<Record<string, unknown>>;
  messageToDelete?: Record<string, unknown>;
  staffRows?: Array<Record<string, unknown>>;
} = {}) {
  const accountId = options.accountId || "clinic-account-id";
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "auth-user-id" }), { status: 200 });
    }
    if (url.includes("/rest/v1/user_accounts?")) {
      return new Response(JSON.stringify([{
        id: accountId,
        name: "Dokter",
        role: "DOCTOR",
        active: true,
        doctor_id: "clinic-doctor-id",
        staff_id: null,
        auth_user_id: "auth-user-id"
      }]), { status: 200 });
    }
    if (url.includes("/rest/v1/dental_doctors?")) {
      return new Response(JSON.stringify([{
        id: "clinic-doctor-id",
        name: "drg. Dokter",
        active: true,
        staff_id: null,
        avatar_url: "https://images.example/dokter.png"
      }]), { status: 200 });
    }
    if (url.includes("/rest/v1/staff?")) {
      return new Response(JSON.stringify(options.staffRows || []), { status: 200 });
    }
    if (url.includes("/storage/v1/object/sign/staff-profile-photos")) {
      return new Response(JSON.stringify((JSON.parse(String(init?.body || "{}")).paths || []).map((path: string) => ({
        path,
        signedURL: `/storage/v1/object/sign/staff-profile-photos/${path}?token=test-token`
      }))), { status: 200 });
    }
    if (url.includes("/rest/v1/chat_groups?") && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body || "{}"));
      return new Response(JSON.stringify([{ subtitle: body.subtitle }]), { status: 200 });
    }
    if (url.includes("/rest/v1/chat_groups?")) {
      return new Response(JSON.stringify([{
        id: "10000000-0000-4000-8000-000000000001",
        slug: "all-doctors",
        name: "Grup Dokter Lala Dentist",
        subtitle: "Percakapan bersama dokter"
      }]), { status: 200 });
    }
    if (url.includes("/rest/v1/group_chat_messages?") && init?.method === "DELETE") {
      return new Response(JSON.stringify([options.messageToDelete || {
        id: "20000000-0000-4000-8000-000000000002"
      }]), { status: 200 });
    }
    if (
      url.includes("/rest/v1/group_chat_messages?") &&
      new URL(url).searchParams.get("select") === "id,attachment_path"
    ) {
      const message = options.messageToDelete || {
        id: "20000000-0000-4000-8000-000000000002",
        sender_clinic_user_id: accountId,
        attachment_path: "group-id/clinic-account-id/attachment-id"
      };
      const senderFilter = new URL(url).searchParams.get("sender_clinic_user_id") || "";
      const requestedSender = senderFilter.startsWith("eq.") ? senderFilter.slice(3) : "";
      const visibleMessages = requestedSender && message.sender_clinic_user_id !== requestedSender
        ? []
        : [message];
      return new Response(JSON.stringify(visibleMessages), { status: 200 });
    }
    if (url.includes("/rest/v1/group_chat_messages?") && init?.method === "POST") {
      return new Response(JSON.stringify([{
        id: "20000000-0000-4000-8000-000000000002",
        sender_clinic_user_id: accountId,
        sender_name_snapshot: "drg. Dokter",
        message_text: "Halo",
        reply_to_message_id: "30000000-0000-4000-8000-000000000003",
        reply_to: {
          id: "30000000-0000-4000-8000-000000000003",
          sender_name_snapshot: "drg. Rekan",
          message_text: "Pesan asal",
          attachment_file_name: null,
          attachment_content_type: null
        },
        attachment_file_name: "foto.png",
        attachment_content_type: "image/png",
        attachment_size_bytes: 16,
        created_at: "2026-10-21T10:00:00.000Z"
      }]), { status: 201 });
    }
    if (url.includes("/rest/v1/group_chat_messages?") && url.includes("id=eq.30000000-0000-4000-8000-000000000003")) {
      return new Response(JSON.stringify([{ id: "30000000-0000-4000-8000-000000000003" }]), { status: 200 });
    }
    if (url.includes("/rest/v1/group_chat_messages?")) {
      if (url.includes("pinned_at=not.is.null")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("id=eq.30000000-0000-4000-8000-000000000003")) {
        return new Response(JSON.stringify([{ id: "30000000-0000-4000-8000-000000000003" }]), { status: 200 });
      }
      return new Response(JSON.stringify(options.messages || []), { status: 200 });
    }
    if (url.includes("/rest/v1/rpc/set_pinned_doctor_chat_message")) {
      return new Response(null, { status: 204 });
    }
    if (url.includes("/storage/v1/object/doctor-group-chat-files/")) {
      return new Response(JSON.stringify({ Key: "uploaded" }), { status: 200 });
    }
    throw new Error(`Unexpected chat test request: ${url}`);
  });
}

describe("Cloudflare doctor group chat API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("requires a clinic session and does not contact Supabase without a bearer token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestGet({
      request: new Request("https://clinic.example/api/chat/messages"),
      env: environment
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Sesi login tidak ditemukan. Silakan masuk kembali."
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows an authenticated doctor to update the shared group subtitle", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestUpdateGroupSubtitle({
      request: createAuthorizedRequest("/api/chat/group", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitle: "Info jadwal dokter" })
      }),
      env: environment
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ subtitle: "Info jadwal dokter" });
    const updateCall = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes("/rest/v1/chat_groups?") && init?.method === "PATCH"
    );
    expect(updateCall).toBeDefined();
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({ subtitle: "Info jadwal dokter" });
  });

  it("rejects a shared group subtitle over 120 characters", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestUpdateGroupSubtitle({
      request: createAuthorizedRequest("/api/chat/group", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtitle: "x".repeat(121) })
      }),
      env: environment
    });

    expect(response.status).toBe(400);
    expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url).includes("/rest/v1/chat_groups?") && init?.method === "PATCH"
    )).toBe(false);
  });

  it("rejects non-doctor accounts before accessing the chat project", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) {
        return new Response(JSON.stringify({ id: "auth-user-id" }), { status: 200 });
      }
      return new Response(JSON.stringify([{
        id: "clinic-account-id",
        role: "BRANCH_ADMIN",
        active: true,
        doctor_id: null
      }]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestGet({
      request: createAuthorizedRequest("/api/chat/messages"),
      env: environment
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: "Menu chat grup hanya tersedia untuk akun Dokter aktif."
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the existing clinic account id and server-only chat key for file messages", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.set("messageText", "Halo");
    formData.set("file", new File([new Uint8Array(16)], "foto.png", { type: "image/png" }));

    const response = await onRequestPost({
      request: createAuthorizedRequest("/api/chat/messages", {
        method: "POST",
        body: formData
      }),
      env: environment
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.message.senderClinicUserId).toBe("clinic-account-id");
    expect(body.message.attachmentFileName).toBe("foto.png");

    const storageRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/storage/v1/object/doctor-group-chat-files/")
    );
    expect(storageRequest?.[1]?.headers).toMatchObject({
      apikey: environment.CHAT_SUPABASE_SECRET_KEY,
      "Content-Type": "image/png"
    });
    expect(storageRequest?.[1]?.headers).not.toHaveProperty("Authorization");

    const insertRequest = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes("/rest/v1/group_chat_messages?") && init?.method === "POST"
    );
    expect(insertRequest?.[1]?.headers).toMatchObject({
      apikey: environment.CHAT_SUPABASE_SECRET_KEY,
      Prefer: "return=representation"
    });
    expect(JSON.parse(String(insertRequest?.[1]?.body))).toMatchObject({
      sender_clinic_user_id: "clinic-account-id",
      sender_name_snapshot: "drg. Dokter",
      message_text: "Halo"
    });
  });

  it("does not send a new Supabase secret key as a bearer token", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);

    await onRequestGet({
      request: createAuthorizedRequest("/api/chat/messages"),
      env: environment
    });

    const chatDatabaseRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("chat-project.supabase.co/rest/v1/chat_groups?")
    );
    expect(chatDatabaseRequest?.[1]?.headers).toMatchObject({
      apikey: environment.CHAT_SUPABASE_SECRET_KEY
    });
    expect(chatDatabaseRequest?.[1]?.headers).not.toHaveProperty("Authorization");
  });

  it("rejects images above 400 KB on the server", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.set("messageText", "");
    formData.set("file", new File([new Uint8Array(400 * 1024 + 1)], "foto.jpg", { type: "image/jpeg" }));

    const response = await onRequestPost({
      request: createAuthorizedRequest("/api/chat/messages", {
        method: "POST",
        body: formData
      }),
      env: environment
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      message: "Ukuran gambar maksimal 400 KB setelah dikompres."
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/storage/v1/object/doctor-group-chat-files/"),
      expect.anything()
    );
  });

  it("stores a reply relationship to a message in the same doctor group", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.set("messageText", "Saya balas");
    formData.set("replyToMessageId", "30000000-0000-4000-8000-000000000003");

    const response = await onRequestPost({
      request: createAuthorizedRequest("/api/chat/messages", {
        method: "POST",
        body: formData
      }),
      env: environment
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.message.replyToMessageId).toBe("30000000-0000-4000-8000-000000000003");
    expect(body.message.replyTo.senderName).toBe("drg. Rekan");
    const insertRequest = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes("/rest/v1/group_chat_messages?") && init?.method === "POST"
    );
    expect(JSON.parse(String(insertRequest?.[1]?.body))).toMatchObject({
      reply_to_message_id: "30000000-0000-4000-8000-000000000003"
    });
  });

  it("stores sticker messages as a small text marker without uploading an image", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.set("messageText", "sticker:siap");

    const response = await onRequestPost({
      request: createAuthorizedRequest("/api/chat/messages", {
        method: "POST",
        body: formData
      }),
      env: environment
    });

    expect(response.status).toBe(201);
    const insertRequest = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes("/rest/v1/group_chat_messages?") && init?.method === "POST"
    );
    expect(JSON.parse(String(insertRequest?.[1]?.body))).toMatchObject({
      message_text: "sticker:siap",
      attachment_path: null,
      attachment_file_name: null,
      attachment_size_bytes: null
    });
    expect(fetchMock.mock.calls.some(([url]) =>
      String(url).includes("/storage/v1/object/doctor-group-chat-files/")
    )).toBe(false);
  });

  it("keeps search and cursor pagination filters in the same PostgREST query", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);
    const beforeId = "30000000-0000-4000-8000-000000000003";

    const response = await onRequestGet({
      request: createAuthorizedRequest(
        `/api/chat/messages?search=karies%2C.*&before=2026-10-21T10%3A00%3A00.000Z&beforeId=${beforeId}`
      ),
      env: environment
    });

    expect(response.status).toBe(200);
    const listRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/rest/v1/group_chat_messages?") &&
      !String(url).includes("pinned_at=not.is.null")
    );
    const query = new URL(String(listRequest?.[0])).searchParams;
    const combinedFilter = query.get("and") || "";
    expect(query.has("or")).toBe(false);
    expect(combinedFilter).toContain("created_at.lt.2026-10-21T10:00:00.000Z");
    expect(combinedFilter).toContain("message_text.ilike.*karies*");
    expect(combinedFilter).not.toContain("*.*");
  });

  it("maps a doctor's HTTPS profile image onto messages", async () => {
    const accountId = "40000000-0000-4000-8000-000000000004";
    const fetchMock = createSuccessfulDoctorFetch({
      accountId,
      messages: [{
        id: "20000000-0000-4000-8000-000000000002",
        group_id: "10000000-0000-4000-8000-000000000001",
        sender_clinic_user_id: accountId,
        sender_name_snapshot: "drg. Dokter",
        message_text: "Siap",
        created_at: "2026-10-21T10:00:00.000Z",
        pinned_at: null
      }]
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestGet({
      request: createAuthorizedRequest("/api/chat/messages"),
      env: environment
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messages[0].avatarUrl).toBe("https://images.example/dokter.png");
  });

  it("prefers the employee portal photo linked through staff.user_account_id", async () => {
    const accountId = "40000000-0000-4000-8000-000000000004";
    const staffId = "50000000-0000-4000-8000-000000000005";
    const profilePhotoPath = `staff-profile/${staffId}/60000000-0000-4000-8000-000000000006.jpg`;
    const fetchMock = createSuccessfulDoctorFetch({
      accountId,
      staffRows: [{
        id: staffId,
        user_account_id: accountId,
        profile_photo_path: profilePhotoPath
      }],
      messages: [{
        id: "20000000-0000-4000-8000-000000000002",
        group_id: "10000000-0000-4000-8000-000000000001",
        sender_clinic_user_id: accountId,
        sender_name_snapshot: "drg. Dokter",
        message_text: "Siap",
        created_at: "2026-10-21T10:00:00.000Z",
        pinned_at: null
      }]
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestGet({
      request: createAuthorizedRequest("/api/chat/messages"),
      env: environment
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.messages[0].avatarUrl).toBe(
      `https://clinic-project.supabase.co/storage/v1/object/sign/staff-profile-photos/${profilePhotoPath}?token=test-token`
    );
    expect(body.messages[0].avatarUrl).not.toBe("https://images.example/dokter.png");
    const staffRequest = fetchMock.mock.calls.find(([url]) => String(url).includes("/rest/v1/staff?"));
    expect(new URL(String(staffRequest?.[0])).searchParams.get("or")).toContain(`user_account_id.in.(${accountId})`);
  });

  it("does not request the optional dental doctor photo_url column", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestGet({
      request: createAuthorizedRequest("/api/chat/messages"),
      env: environment
    });

    expect(response.status).toBe(200);
    const doctorRequests = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/rest/v1/dental_doctors?")
    );
    expect(doctorRequests.length).toBeGreaterThan(0);
    expect(doctorRequests.every(([url]) =>
      !new URL(String(url)).searchParams.get("select")?.split(",").includes("photo_url")
    )).toBe(true);
  });

  it("pins and unpins only through the server-side group RPC", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);
    const messageId = "30000000-0000-4000-8000-000000000003";
    const context = (method: "PUT" | "DELETE") => ({
      request: createAuthorizedRequest(`/api/chat/messages/${messageId}/pin`, { method }),
      env: environment,
      params: { id: messageId }
    });

    const pinResponse = await onRequestPin(context("PUT"));
    const unpinResponse = await onRequestUnpin(context("DELETE"));
    expect(pinResponse.status).toBe(200);
    expect(unpinResponse.status).toBe(200);

    const rpcCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/rpc/set_pinned_doctor_chat_message")
    );
    expect(rpcCalls).toHaveLength(2);
    expect(JSON.parse(String(rpcCalls[0][1]?.body))).toEqual({
      p_group_id: "10000000-0000-4000-8000-000000000001",
      p_message_id: messageId,
      p_expected_message_id: null
    });
    expect(JSON.parse(String(rpcCalls[1][1]?.body))).toEqual({
      p_group_id: "10000000-0000-4000-8000-000000000001",
      p_message_id: null,
      p_expected_message_id: messageId
    });
  });

  it("deletes an owned message and its attachment for all group members", async () => {
    const fetchMock = createSuccessfulDoctorFetch();
    vi.stubGlobal("fetch", fetchMock);
    const messageId = "20000000-0000-4000-8000-000000000002";

    const response = await onRequestDeleteMessage({
      request: createAuthorizedRequest(`/api/chat/messages/${messageId}`, { method: "DELETE" }),
      env: environment,
      params: { id: messageId }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deleted: true,
      attachmentDeleted: true
    });
    const deleteRequest = fetchMock.mock.calls.find(([url, init]) =>
      String(url).includes("/rest/v1/group_chat_messages?") && init?.method === "DELETE"
    );
    const deleteQuery = new URL(String(deleteRequest?.[0])).searchParams;
    expect(deleteQuery.get("sender_clinic_user_id")).toBe("eq.clinic-account-id");
    expect(deleteQuery.get("group_id")).toBe("eq.10000000-0000-4000-8000-000000000001");
    expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url).includes("/storage/v1/object/doctor-group-chat-files/group-id/clinic-account-id/attachment-id") &&
      init?.method === "DELETE"
    )).toBe(true);
  });

  it("does not delete another doctor's message or attachment", async () => {
    const fetchMock = createSuccessfulDoctorFetch({
      messageToDelete: {
        id: "20000000-0000-4000-8000-000000000002",
        sender_clinic_user_id: "another-doctor-account",
        attachment_path: "group-id/another-doctor-account/attachment-id"
      }
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestDeleteMessage({
      request: createAuthorizedRequest("/api/chat/messages/20000000-0000-4000-8000-000000000002", { method: "DELETE" }),
      env: environment,
      params: { id: "20000000-0000-4000-8000-000000000002" }
    });

    expect(response.status).toBe(404);
    expect(fetchMock.mock.calls.some(([url, init]) =>
      (String(url).includes("/rest/v1/group_chat_messages?") && init?.method === "DELETE") ||
      (String(url).includes("/storage/v1/object/doctor-group-chat-files/") && init?.method === "DELETE")
    )).toBe(false);
  });
});
