import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "test-access-token" } },
        error: null
      }))
    }
  }
}));

import { getDoctorChatMessages } from "../../attendance-portal/src/doctorChatService";

describe("doctor chat service compatibility", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a messages response from an API deployment without pin metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      group: { id: "group-id", name: "Grup Dokter" },
      messages: [],
      hasMore: false
    }), { status: 200 })));

    await expect(getDoctorChatMessages()).resolves.toMatchObject({
      group: { id: "group-id", name: "Grup Dokter" },
      messages: [],
      pinnedMessage: null,
      hasMore: false
    });
  });

  it("rejects malformed pin metadata", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      group: { id: "group-id", name: "Grup Dokter" },
      messages: [],
      pinnedMessage: [],
      hasMore: false
    }), { status: 200 })));

    await expect(getDoctorChatMessages()).rejects.toThrow("Respons daftar pesan chat tidak valid.");
  });
});
