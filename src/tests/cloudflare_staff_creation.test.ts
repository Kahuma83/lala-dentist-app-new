import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestOptions, onRequestPost } from "../../functions/api/staff.js";

const origin = "https://klinik.laladentist.id";
const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_server-only-test-key",
  SUPABASE_ANON_KEY: "sb_publishable-test-key"
};

const createRequest = (method: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`${origin}/api/staff`, {
    method,
    headers: {
      Origin: origin,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

const createAccountPayload = {
  username: "ani",
  name: "Ani Staff",
  role: "BRANCH_ADMIN",
  branchId: "branch-id",
  password: "secret-password"
};

describe("Cloudflare Pages staff account endpoint", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles the browser preflight request with the allowed origin and headers", async () => {
    const response = await onRequestOptions({
      request: createRequest("OPTIONS", undefined, {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization,content-type"
      }),
      env
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });

  it("rejects preflight requests from unconfigured origins", async () => {
    const response = await onRequestOptions({
      request: new Request("https://clinic.attacker.example/api/staff", {
        method: "OPTIONS",
        headers: { Origin: "https://clinic.attacker.example" }
      }),
      env
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("requires a session token before accessing Supabase", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost({
      request: createRequest("POST", createAccountPayload),
      env
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Unauthorized: token sesi tidak ditemukan."
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only permits an active Super Admin to create staff accounts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "auth-id" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { role: "BRANCH_ADMIN", active: true }
      ]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost({
      request: createRequest("POST", createAccountPayload, {
        Authorization: "Bearer valid-session-token"
      }),
      env
    });

    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toContain("valid-session-token");
    expect(fetchMock.mock.calls[1][1].headers.apikey).toBe(env.SUPABASE_SECRET_KEY);
  });

  it("creates a Supabase Auth user and a linked staff account for an active Super Admin", async () => {
    const createdAuthUser = { id: "new-auth-user-id" };
    const insertedAccount = {
      id: "new-account-id",
      auth_user_id: createdAuthUser.id,
      username: "ani",
      email: "ani@laladentist.id",
      name: "Ani Staff",
      role: "BRANCH_ADMIN",
      branch_id: "branch-id",
      staff_id: null,
      doctor_id: null,
      active: true,
      created_at: "2026-10-22T00:00:00.000Z",
      updated_at: "2026-10-22T00:00:00.000Z"
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "super-admin-auth-id" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { role: "SUPER_ADMIN", active: true }
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response("[]", { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(createdAuthUser), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([insertedAccount]), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost({
      request: createRequest("POST", createAccountPayload, {
        Authorization: "Bearer valid-session-token"
      }),
      env
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      account: {
        authUserId: createdAuthUser.id,
        username: "ani",
        role: "BRANCH_ADMIN",
        branchId: "branch-id"
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(String(fetchMock.mock.calls[3][0])).toContain("/auth/v1/admin/users");
    expect(fetchMock.mock.calls[3][1].headers.apikey).toBe(env.SUPABASE_SECRET_KEY);
    expect(fetchMock.mock.calls[3][1].body).toContain("ani@laladentist.id");
    expect(fetchMock.mock.calls[4][1].headers.Authorization).toMatch(new RegExp(["Bear", "er"].join("") + " "));
  });

  it("returns a CORS error response from POST for a disallowed origin", async () => {
    const request = new Request("https://klinik.laladentist.id/api/staff", {
      method: "POST",
      headers: {
        Origin: "https://clinic.attacker.example",
        Authorization: "Bearer token",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(createAccountPayload)
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost({ request, env });

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
