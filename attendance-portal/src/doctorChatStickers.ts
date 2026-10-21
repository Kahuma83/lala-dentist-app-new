export const doctorChatStickers = [
  { id: "siap", label: "Siap!" },
  { id: "terima-kasih", label: "Terima Kasih!" },
  { id: "tolong", label: "Tolong!" },
  { id: "mohon-bantu", label: "Mohon Bantu!" },
  { id: "selesai", label: "Selesai!" },
  { id: "sudah-beres", label: "Sudah Beres!" },
  { id: "kasus-menarik", label: "Kasus Menarik Nih!" },
  { id: "lanjut-pasien", label: "Lanjut Pasien Berikutnya?" },
  { id: "duh-ngilu", label: "Duh, Ngilu!" },
  { id: "oklusi-sempurna", label: "Oklusi Sempurna!" },
  { id: "anamnesis-pusing", label: "Anamnesis Bikin Pusing" },
  { id: "karang-gigi", label: "Siap-siap Karang Gigi!" }
] as const;

export type DoctorChatStickerId = typeof doctorChatStickers[number]["id"];
export type DoctorChatSticker = typeof doctorChatStickers[number];

export function getDoctorChatSticker(messageText: string): DoctorChatSticker | undefined {
  const match = /^sticker:([a-z-]+)$/.exec(messageText);
  if (!match) return undefined;
  return doctorChatStickers.find((sticker) => sticker.id === match[1]);
}

export function getDoctorChatStickerUrl(sticker: DoctorChatSticker): string {
  return `/stickers/${sticker.id}.png`;
}

export function getDoctorChatMessagePreview(messageText: string): string {
  const sticker = getDoctorChatSticker(messageText);
  return sticker ? `Stiker: ${sticker.label}` : messageText;
}
