import { afterEach, describe, expect, it, vi } from "vitest";

describe("Supabase booking write client", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("must not expose a service-role key to the browser booking client", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("VITE_SUPABASE_SERVICE_ROLE_KEY", "service-role-key");

    const mod = await import("../lib/supabase");

    expect(mod.hasSupabaseServiceRoleKey).toBe(false);
    expect(mod.supabaseWriteClient).toBeDefined();
    expect(mod.supabaseWriteClient).toBe(mod.supabase);
  });
});
