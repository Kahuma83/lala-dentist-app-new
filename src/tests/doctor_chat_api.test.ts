import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  onRequestGet,
  onRequestPost
} from "../../functions/api/chat/messages.js";

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

function createSuccessfulDoctorFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "auth-user-id" }), { status: 200 });
    }
    if (url.includes("/rest/v1/user_accounts?")) {
      return new Response(JSON.stringify([{
        id: "clinic-account-id",
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
        id: "10000000-0000-4000-8000-000000000001",
        slug: "all-doctors",
        name: "Grup Dokter Lala Dentist"
      }]), { status: 200 });
    }
    if (url.includes("/rest/v1/group_chat_messages?") && init?.method === "POST") {
      return new Response(JSON.stringify([{
        id: "20000000-0000-4000-8000-000000000002",
        sender_clinic_user_id: "clinic-account-id",
        sender_name_snapshot: "drg. Dokter",
        message_text: "Halo",
        attachment_file_name: "foto.png",
        attachment_content_type: "image/png",
        attachment_size_bytes: 16,
        created_at: "2026-10-21T10:00:00.000Z"
      }]), { status: 201 });
    }
    if (url.includes("/rest/v1/group_chat_messages?")) {
      return new Response(JSON.stringify([]), { status: 200 });
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
});
