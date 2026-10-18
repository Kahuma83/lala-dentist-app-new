import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("staff profile photo storage", () => {
  const migration = fs.readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261116000000_staff_profile_photos_storage.sql"),
    "utf8"
  );
  const photoUtility = fs.readFileSync(
    path.resolve(process.cwd(), "src/utils/staffProfilePhoto.ts"),
    "utf8"
  );

  it("creates a private JPEG-only bucket with a strict upload-size limit", () => {
    expect(migration).toContain("'staff-profile-photos'");
    expect(migration).toContain("FALSE");
    expect(migration).toContain("524288");
    expect(migration).toContain("ARRAY['image/jpeg']");
  });

  it("allows photo reads only for the linked employee", () => {
    const ownerReadPolicy = migration.slice(
      migration.indexOf('CREATE POLICY "Staff profile photos owner read"'),
      migration.indexOf('DROP POLICY IF EXISTS "Staff profile photos authorized upload"')
    );

    expect(ownerReadPolicy).toContain("FOR SELECT");
    expect(ownerReadPolicy).toContain("public.get_user_staff_id()::TEXT");
    expect(ownerReadPolicy).not.toContain("can_manage_staff_profile_photo");
  });

  it("limits photo uploads and cleanup to the owner or authorized branch administrators", () => {
    expect(migration).toContain("public.can_manage_staff_profile_photo((storage.foldername(name))[2])");
    expect(migration).toContain("public.get_user_role() = 'BRANCH_ADMIN'");
    expect(migration).toContain("s.branch_id::TEXT = public.get_user_branch_id()::TEXT");
    expect(migration).toContain("public.is_super_admin()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.set_staff_profile_photo_path(UUID, TEXT) FROM PUBLIC, anon");
  });

  it("keeps one current photo per staff and removes the previous object after updating its pointer", () => {
    expect(migration).toContain("profile_photo_path TEXT");
    expect(migration).toContain("RETURN previous_photo_path");
    expect(photoUtility).toContain('upsert: false');
    expect(photoUtility).toContain('.remove([oldPhotoPath])');
  });

  it("uses local browser cache for a week before requesting the image again", () => {
    const photoLoader = photoUtility.slice(photoUtility.indexOf("export async function loadOwnStaffProfilePhoto"));
    expect(photoUtility).toContain('PROFILE_PHOTO_CACHE = "lala-staff-profile-photos-v1"');
    expect(photoUtility).toContain("const PROFILE_PHOTO_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000");
    expect(photoLoader).toContain("await readCachedProfilePhoto(staffId)");
    expect(photoLoader.indexOf("await readCachedProfilePhoto(staffId)"))
      .toBeLessThan(photoLoader.indexOf('.from("staff")'));
  });
});
