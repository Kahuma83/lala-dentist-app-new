import { supabase } from "../lib/supabase";

const MAX_PROFILE_PHOTO_BYTES = 512 * 1024;
const PROFILE_PHOTO_BUCKET = "staff-profile-photos";
const PROFILE_PHOTO_CACHE = "lala-staff-profile-photos-v1";
const PROFILE_PHOTO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function compressStaffProfilePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Pilih file gambar untuk foto profil.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Foto tidak dapat dibaca. Pilih ulang gambar profil.");
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak dapat menyiapkan foto profil.");

    const cropSize = Math.min(bitmap.width, bitmap.height);
    const cropX = Math.floor((bitmap.width - cropSize) / 2);
    const cropY = Math.floor((bitmap.height - cropSize) / 2);
    context.drawImage(bitmap, cropX, cropY, cropSize, cropSize, 0, 0, 512, 512);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => result ? resolve(result) : reject(new Error("Foto profil gagal diproses.")),
        "image/jpeg",
        0.76
      );
    });
    if (blob.size > MAX_PROFILE_PHOTO_BYTES) {
      throw new Error("Foto profil tetap terlalu besar setelah dikompres. Pilih gambar yang lebih kecil.");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

function getProfilePhotoCacheRequest(staffId: string): Request | null {
  if (typeof window === "undefined") return null;
  return new Request(new URL(`/__private-cache/staff-profile-photos/${encodeURIComponent(staffId)}`, window.location.origin));
}

async function cacheProfilePhoto(staffId: string, path: string | null, photo?: Blob): Promise<void> {
  const cacheRequest = getProfilePhotoCacheRequest(staffId);
  if (!cacheRequest || typeof caches === "undefined") {
    console.warn("[Staff profile photo] Browser cache storage is unavailable.");
    return;
  }
  try {
    const cache = await caches.open(PROFILE_PHOTO_CACHE);
    const headers = new Headers({
      "X-Profile-Photo-Cached-At": String(Date.now()),
      "X-Profile-Photo-Path": path || "none"
    });
    if (photo) headers.set("Content-Type", "image/jpeg");
    await cache.put(cacheRequest, new Response(photo || null, { headers }));
  } catch (error) {
    console.warn("[Staff profile photo] Could not save the local browser cache:", error);
  }
}

async function readCachedProfilePhoto(staffId: string): Promise<string | null | undefined> {
  const cacheRequest = getProfilePhotoCacheRequest(staffId);
  if (!cacheRequest || typeof caches === "undefined") return undefined;
  try {
    const cache = await caches.open(PROFILE_PHOTO_CACHE);
    const cached = await cache.match(cacheRequest);
    if (!cached) return undefined;

    const cachedAt = Number(cached.headers.get("X-Profile-Photo-Cached-At"));
    const cacheTtl = cached.headers.get("X-Profile-Photo-Path") === "none"
      ? 10 * 60 * 1000
      : PROFILE_PHOTO_CACHE_TTL_MS;
    if (!Number.isFinite(cachedAt) || Date.now() - cachedAt >= cacheTtl) {
      await cache.delete(cacheRequest);
      return undefined;
    }
    if (cached.headers.get("X-Profile-Photo-Path") === "none") return null;
    return URL.createObjectURL(await cached.blob());
  } catch (error) {
    console.warn("[Staff profile photo] Could not read the local browser cache:", error);
    return undefined;
  }
}

export async function uploadStaffProfilePhoto(file: File, targetStaffId: string): Promise<string | null> {
  if (!targetStaffId) throw new Error("Data staf tidak ditemukan untuk foto profil.");
  const compressedPhoto = await compressStaffProfilePhoto(file);
  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("profile_photo_path")
    .eq("id", targetStaffId)
    .maybeSingle();
  if (staffError) throw new Error(`Gagal memeriksa pemilik foto profil: ${staffError.message}`);
  if (!staff) throw new Error("Data pegawai tidak ditemukan atau Anda tidak memiliki akses.");

  const photoPath = `staff-profile/${targetStaffId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(photoPath, compressedPhoto, {
      contentType: "image/jpeg",
      cacheControl: "604800",
      upsert: false
    });
  if (uploadError) throw new Error(`Gagal mengunggah foto profil: ${uploadError.message}`);

  const { data: oldPhotoPath, error: updateError } = await supabase.rpc("set_staff_profile_photo_path", {
    p_staff_id: targetStaffId,
    p_photo_path: photoPath
  });
  if (updateError) {
    const { error: rollbackError } = await supabase.storage
      .from(PROFILE_PHOTO_BUCKET)
      .remove([photoPath]);
    const rollbackMessage = rollbackError ? ` Foto baru gagal dibersihkan: ${rollbackError.message}` : "";
    throw new Error(`Gagal memperbarui data foto profil: ${updateError.message}.${rollbackMessage}`);
  }

  await cacheProfilePhoto(targetStaffId, photoPath, compressedPhoto);

  if (oldPhotoPath && oldPhotoPath !== photoPath) {
    const { error: cleanupError } = await supabase.storage
      .from(PROFILE_PHOTO_BUCKET)
      .remove([oldPhotoPath]);
    if (cleanupError) {
      return `Foto profil berhasil diperbarui, tetapi foto lama belum berhasil dihapus: ${cleanupError.message}`;
    }
  }
  return null;
}

export async function loadOwnStaffProfilePhoto(staffId: string): Promise<string | null> {
  const cachedPhoto = await readCachedProfilePhoto(staffId);
  if (cachedPhoto !== undefined) return cachedPhoto;

  const { data: staff, error: staffError } = await supabase
    .from("staff")
    .select("profile_photo_path")
    .eq("id", staffId)
    .maybeSingle();
  if (staffError) throw new Error(`Gagal membaca foto profil pegawai: ${staffError.message}`);
  if (!staff) throw new Error("Data pegawai tidak ditemukan atau Anda tidak memiliki akses.");

  const photoPath = staff.profile_photo_path as string | null;
  if (!photoPath) {
    await cacheProfilePhoto(staffId, null);
    return null;
  }

  const { data: photo, error: downloadError } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .download(photoPath);
  if (downloadError) throw new Error(`Gagal memuat foto profil pegawai: ${downloadError.message}`);
  if (!photo) throw new Error("Foto profil tidak ditemukan pada penyimpanan.");

  await cacheProfilePhoto(staffId, photoPath, photo);
  return URL.createObjectURL(photo);
}
