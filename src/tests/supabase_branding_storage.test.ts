import { beforeEach, describe, expect, it, vi } from "vitest";
import { SupabaseStorageRepository } from "../repositories/supabaseRepositories";
import * as supabaseLib from "../lib/supabase";

describe("Supabase clinic branding storage", () => {
  let storageRepo: SupabaseStorageRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(true);
    storageRepo = new SupabaseStorageRepository();
  });

  it("uploads branding logos to the public clinic-branding bucket", async () => {
    const upload = vi.fn().mockResolvedValue({
      data: { path: "branding-logos/logo.png" },
      error: null
    });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://project.supabase.co/storage/v1/object/public/clinic-branding/branding-logos/logo.png" }
    });
    const from = vi.spyOn(supabaseLib.supabase.storage, "from").mockReturnValue({
      upload,
      getPublicUrl
    } as any);

    const result = await storageRepo.uploadImage({
      name: "logo.png",
      type: "image/png",
      size: 10,
      base64OrDataUrl: "data:image/png;base64,aGVsbG8="
    }, "branding-logos");

    expect(from).toHaveBeenCalledWith("clinic-branding");
    expect(result.url).toContain("/clinic-branding/branding-logos/logo.png");
  });

  it("does not report a base64 fallback as a successful production logo upload", async () => {
    const upload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Bucket not found" }
    });
    vi.spyOn(supabaseLib.supabase.storage, "from").mockReturnValue({ upload } as any);

    await expect(storageRepo.uploadImage({
      name: "logo.png",
      type: "image/png",
      size: 10,
      base64OrDataUrl: "data:image/png;base64,aGVsbG8="
    }, "branding-logos")).rejects.toThrow("Bucket not found");
  });

  it("uploads doctor portraits to their dedicated public bucket", async () => {
    const upload = vi.fn().mockResolvedValue({
      data: { path: "doctor-portraits/doctor.png" },
      error: null
    });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://project.supabase.co/storage/v1/object/public/clinic-doctor-portraits/doctor-portraits/doctor.png" }
    });
    const from = vi.spyOn(supabaseLib.supabase.storage, "from").mockReturnValue({
      upload,
      getPublicUrl
    } as any);

    const result = await storageRepo.uploadImage({
      name: "doctor.png",
      type: "image/png",
      size: 10,
      base64OrDataUrl: "data:image/png;base64,aGVsbG8="
    }, "doctor-portraits");

    expect(from).toHaveBeenCalledWith("clinic-doctor-portraits");
    expect(result.url).toContain("/clinic-doctor-portraits/doctor-portraits/doctor.png");
  });

  it("does not fall back to a data URL when doctor portrait storage upload fails", async () => {
    const upload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Bucket not found" }
    });
    vi.spyOn(supabaseLib.supabase.storage, "from").mockReturnValue({ upload } as any);

    await expect(storageRepo.uploadImage({
      name: "doctor.png",
      type: "image/png",
      size: 10,
      base64OrDataUrl: "data:image/png;base64,aGVsbG8="
    }, "doctor-portraits")).rejects.toThrow("Bucket not found");
  });

  it("requires Supabase to be configured for doctor portrait uploads", async () => {
    vi.spyOn(supabaseLib, "isSupabaseConfigured", "get").mockReturnValue(false);

    await expect(storageRepo.uploadImage({
      name: "doctor.png",
      type: "image/png",
      size: 10,
      base64OrDataUrl: "data:image/png;base64,aGVsbG8="
    }, "doctor-portraits")).rejects.toThrow("Koneksi ke Supabase belum terkonfigurasi.");
  });

  it("uploads branch and promotion media to the dedicated public media bucket", async () => {
    const upload = vi.fn().mockResolvedValue({
      data: { path: "promotions/promo.png" },
      error: null
    });
    const getPublicUrl = vi.fn().mockReturnValue({
      data: { publicUrl: "https://project.supabase.co/storage/v1/object/public/clinic-public-media/promotions/promo.png" }
    });
    const from = vi.spyOn(supabaseLib.supabase.storage, "from").mockReturnValue({
      upload,
      getPublicUrl
    } as any);

    const result = await storageRepo.uploadImage({
      name: "promo.png",
      type: "image/png",
      size: 10,
      base64OrDataUrl: "data:image/png;base64,aGVsbG8="
    }, "promotions");

    expect(from).toHaveBeenCalledWith("clinic-public-media");
    expect(result.url).toContain("/clinic-public-media/promotions/promo.png");
  });

  it("does not fall back to a data URL when public media storage upload fails", async () => {
    const upload = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "Bucket not found" }
    });
    vi.spyOn(supabaseLib.supabase.storage, "from").mockReturnValue({ upload } as any);

    await expect(storageRepo.uploadImage({
      name: "promo.png",
      type: "image/png",
      size: 10,
      base64OrDataUrl: "data:image/png;base64,aGVsbG8="
    }, "promotions")).rejects.toThrow("Bucket not found");
  });
});
