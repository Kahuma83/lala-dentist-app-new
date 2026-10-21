import { describe, expect, it } from "vitest";
import {
  doctorChatStickers,
  getDoctorChatMessagePreview,
  getDoctorChatSticker,
  getDoctorChatStickerUrl
} from "../../attendance-portal/src/doctorChatStickers";

describe("built-in doctor chat stickers", () => {
  it("resolves all original sticker assets to local URLs", () => {
    expect(doctorChatStickers).toHaveLength(12);
    for (const sticker of doctorChatStickers) {
      expect(getDoctorChatSticker(`sticker:${sticker.id}`)).toEqual(sticker);
      expect(getDoctorChatStickerUrl(sticker)).toBe(`/stickers/${sticker.id}.png`);
    }
  });

  it("shows a readable label for sticker messages and replies", () => {
    expect(getDoctorChatMessagePreview("sticker:terima-kasih")).toBe("Stiker: Terima Kasih!");
    expect(getDoctorChatSticker("sticker:not-a-real-sticker")).toBeUndefined();
    expect(getDoctorChatMessagePreview("Teks biasa")).toBe("Teks biasa");
  });
});
