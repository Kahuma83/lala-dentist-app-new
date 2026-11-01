export const getBookingConflictMessage = (error, timeSlot) => {
  const databaseMessage = [error?.message, error?.details, error?.hint]
    .filter((value) => typeof value === "string")
    .join(" ");
  const slot = typeof timeSlot === "string" && timeSlot ? ` ${timeSlot}` : "";

  if (/Dokter sudah memiliki booking aktif.*(bertabrakan|slot waktu)/i.test(databaseMessage)) {
    return `Slot${slot} bentrok dengan booking aktif dokter berdasarkan durasi tindakan. Muat ulang booking dan pilih waktu lain.`;
  }
  if (/Pasien sudah memiliki booking aktif di cabang ini pada tanggal tersebut/i.test(databaseMessage)) {
    return "Pasien sudah memiliki booking aktif di cabang ini pada tanggal tersebut.";
  }
  if (/Pasien masih memiliki janji temu aktif yang belum selesai/i.test(databaseMessage)) {
    return "Pasien masih memiliki janji temu aktif yang belum selesai.";
  }

  return "Booking tidak dapat disimpan karena terjadi konflik pada data booking. Muat ulang data, lalu periksa booking aktif pasien dan dokter.";
};
