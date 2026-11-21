import jsPDF from "jspdf";
import {
  Booking,
  BookingStatus,
  DentalBranch,
  DentalDoctor,
  DoctorSchedule,
  PatientProfile,
  ScheduleStatus
} from "../types/domain";
import { getOperationalDateString, getOperationalTimeString } from "./dateUtils";
import { getBookingDoctorDisplayName } from "./doctorNameUtils";
import { getPlannedTreatmentDurationMinutes, getPlannedTreatmentSummary } from "./plannedTreatmentUtils";
import { getScheduledBookingTimeSlots } from "./bookingScheduleUtils";

export interface DailyAgendaRow {
  time: string;
  patientName: string;
  treatment: string;
  doctorName: string;
  status: string;
  kind?: "AVAILABLE" | "BLOCKED";
}

interface BuildDailyAgendaRowsInput {
  bookings: readonly Booking[];
  agendaDate: string;
  schedules?: readonly DoctorSchedule[];
  doctors: readonly Pick<DentalDoctor, "id" | "name" | "doctorCode">[];
  patients: readonly Pick<PatientProfile, "id" | "fullName" | "name">[];
  checkedInBookingIds: ReadonlySet<string>;
  completedBookingIds: ReadonlySet<string>;
}

const normalizeDoctorId = (doctorId: string) => doctorId.toLowerCase().replace(/^doc-/, "");

const getDoctorForSchedule = (
  doctorId: string,
  doctors: readonly Pick<DentalDoctor, "id" | "name" | "doctorCode">[]
) => doctors.find((doctor) =>
  doctor.id === doctorId
  || normalizeDoctorId(doctor.id) === normalizeDoctorId(doctorId)
  || (!!doctor.doctorCode && doctor.doctorCode.toLowerCase() === doctorId.toLowerCase())
);

const getTimeInMinutes = (time: string): number | null => {
  const match = time.match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  return hours > 23 ? null : hours * 60 + Number(match[2]);
};

export function buildDailyAgendaRows({
  bookings,
  agendaDate,
  schedules = [],
  doctors,
  patients,
  checkedInBookingIds,
  completedBookingIds
}: BuildDailyAgendaRowsInput): DailyAgendaRow[] {
  const patientNames = new Map(patients.map((patient) => [patient.id, patient.fullName || patient.name]));
  const activeBookings = bookings
    .filter((booking) =>
      getOperationalDateString(booking.bookingDateTime) === agendaDate &&
      booking.status !== BookingStatus.CANCELLED &&
      booking.status !== BookingStatus.RESCHEDULED &&
      booking.status !== BookingStatus.COMPLETED &&
      booking.status !== BookingStatus.NO_SHOW &&
      !completedBookingIds.has(booking.id)
    )
    .map((booking) => {
      const operationalTime = getOperationalTimeString(booking.bookingDateTime);
      const time = operationalTime !== "--:--" ? operationalTime : booking.timeSlot || "--:--";
      const startMinutes = getTimeInMinutes(time);
      const doctor = getDoctorForSchedule(booking.doctorId, doctors);
      return {
        booking,
        time,
        startMinutes,
        endMinutes: startMinutes === null
          ? null
          : startMinutes + getPlannedTreatmentDurationMinutes(booking.plannedTreatments, 30),
        doctorKey: normalizeDoctorId(doctor?.id || booking.doctorId),
        row: {
          time,
          patientName: booking.patientNameSnapshot?.trim() || patientNames.get(booking.patientId) || "Pasien",
          treatment: getPlannedTreatmentSummary(booking.plannedTreatments),
          doctorName: getBookingDoctorDisplayName(booking, doctors),
          status: checkedInBookingIds.has(booking.id)
            ? "Check-in"
            : booking.status === BookingStatus.CONFIRMED
              ? "Dikonfirmasi"
              : "Terjadwal"
        }
      };
    });

  const rows: DailyAgendaRow[] = activeBookings.map((entry) => entry.row);
  const scheduleSlotsByDoctor = new Map<string, { doctorName: string; slots: Set<string> }>();

  schedules
    .filter((schedule) => schedule.date === agendaDate && schedule.status === ScheduleStatus.ACTIVE)
    .forEach((schedule) => {
      const doctor = getDoctorForSchedule(schedule.doctorId, doctors);
      const doctorKey = normalizeDoctorId(doctor?.id || schedule.doctorId);
      const scheduleSlots = scheduleSlotsByDoctor.get(doctorKey) || {
        doctorName: doctor?.name?.trim() || "Dokter",
        slots: new Set<string>()
      };
      getScheduledBookingTimeSlots(schedule).forEach((slot) => scheduleSlots.slots.add(slot));
      scheduleSlotsByDoctor.set(doctorKey, scheduleSlots);
    });

  scheduleSlotsByDoctor.forEach(({ doctorName, slots }, doctorKey) => {
    [...slots].sort().forEach((time) => {
      const slotStart = getTimeInMinutes(time);
      if (slotStart === null) return;

      const bookingStartsHere = activeBookings.some((entry) =>
        entry.doctorKey === doctorKey && entry.startMinutes === slotStart
      );
      if (bookingStartsHere) return;

      const overlappingBooking = activeBookings.find((entry) =>
        entry.doctorKey === doctorKey
        && entry.startMinutes !== null
        && entry.endMinutes !== null
        && entry.startMinutes < slotStart + 15
        && slotStart < entry.endMinutes
      );

      if (overlappingBooking) {
        rows.push({
          time,
          patientName: "",
          treatment: `Terpakai dari ${overlappingBooking.time}`,
          doctorName,
          status: "Terpakai",
          kind: "BLOCKED"
        });
        return;
      }

      rows.push({
        time,
        patientName: "",
        treatment: "",
        doctorName,
        status: "Tersedia",
        kind: "AVAILABLE"
      });
    });
  });

  return rows.sort((left, right) =>
    left.time.localeCompare(right.time)
    || Number(left.kind === "AVAILABLE") - Number(right.kind === "AVAILABLE")
    || left.doctorName.localeCompare(right.doctorName)
    || (left.kind || "").localeCompare(right.kind || "")
  );
}

const colors = {
  navy: [30, 48, 65] as const,
  gold: [185, 145, 57] as const,
  paleGold: [250, 246, 235] as const,
  text: [40, 51, 61] as const,
  muted: [105, 117, 128] as const,
  line: [225, 230, 234] as const,
  rowAlt: [248, 249, 247] as const,
  amber: [178, 126, 28] as const,
  blue: [43, 105, 154] as const,
  violet: [105, 76, 158] as const
};

const formatAgendaDate = (date: string) =>
  new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T12:00:00Z`));

const formatPrintDate = (date: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta"
  }).format(date);

async function loadLogoDataUrl(): Promise<string> {
  const response = await fetch("/logo-lala.svg");
  if (!response.ok) {
    throw new Error(`Logo Lala Dentist gagal dimuat (${response.status}).`);
  }

  const svg = (await response.text()).replace(
    /<svg\b([^>]*)>/i,
    (_tag, attributes: string) => {
      const fixedAttributes = attributes
        .replace(/\swidth="[^"]*"/i, "")
        .replace(/\sheight="[^"]*"/i, "");
      return `<svg${fixedAttributes} width="512" height="512">`;
    }
  );
  const image = new Image();
  const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));

  try {
    image.src = objectUrl;
    await image.decode();

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak dapat menyiapkan logo untuk PDF.");

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawTableHeader(pdf: jsPDF, y: number, columnWidths: number[], margin: number) {
  const headers = ["No.", "Jam", "Nama Pasien", "Rencana Tindakan", "Dokter", "Status"];
  let x = margin;
  const height = 8;

  pdf.setFillColor(...colors.navy);
  pdf.roundedRect(margin, y, columnWidths.reduce((sum, width) => sum + width, 0), height, 1.5, 1.5, "F");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.setTextColor(255, 255, 255);

  headers.forEach((header, index) => {
    const align = index === 0 || index === 1 || index === 5 ? "center" : "left";
    const textX = align === "center" ? x + columnWidths[index] / 2 : x + 3;
    pdf.text(header, textX, y + 5.2, { align });
    x += columnWidths[index];
    if (index < headers.length - 1) {
      pdf.setDrawColor(92, 108, 121);
      pdf.setLineWidth(0.25);
      pdf.line(x, y + 1, x, y + height - 1);
    }
  });

  return y + height;
}

function drawFirstPageHeader(
  pdf: jsPDF,
  logoDataUrl: string,
  branch: Pick<DentalBranch, "name" | "address">,
  agendaDate: string,
  agendaCount: number,
  doctorCount: number,
  margin: number,
  contentWidth: number
) {
  pdf.setFillColor(...colors.gold);
  pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 3, "F");
  pdf.addImage(logoDataUrl, "PNG", margin, 7, 20, 20);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(...colors.navy);
  pdf.text("LALA DENTIST", margin + 25, 13);

  pdf.setFontSize(9);
  pdf.setTextColor(...colors.gold);
  pdf.text(branch.name || "Cabang Klinik", margin + 25, 19);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(...colors.muted);
  const dateBoxX = margin + contentWidth - 73;
  const address = branch.address?.trim() || "Alamat cabang belum diatur pada profil cabang.";
  pdf.text(pdf.splitTextToSize(address, dateBoxX - margin - 29).slice(0, 2), margin + 25, 24, { lineHeightFactor: 1.1 });

  pdf.setFillColor(...colors.paleGold);
  pdf.roundedRect(dateBoxX, 7, 73, 21, 2, 2, "F");
  pdf.setDrawColor(...colors.gold);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(dateBoxX, 7, 73, 21, 2, 2, "S");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  pdf.setTextColor(...colors.gold);
  pdf.text("LAMPIRAN JADWAL PASIEN", dateBoxX + 4, 12);
  pdf.setFontSize(8.5);
  pdf.setTextColor(...colors.navy);
  pdf.text(formatAgendaDate(agendaDate), dateBoxX + 4, 20, { maxWidth: 65 });

  pdf.setDrawColor(...colors.line);
  pdf.setLineWidth(0.3);
  pdf.line(margin, 32, margin + contentWidth, 32);

  const summaryY = 36;
  const summaryWidth = (contentWidth - 4) / 2;
  [
    { label: "TOTAL JADWAL", value: String(agendaCount) },
    { label: "DOKTER BERTUGAS", value: String(doctorCount) }
  ].forEach((item, index) => {
    const x = margin + index * (summaryWidth + 4);
    pdf.setFillColor(index === 0 ? 248 : 244, index === 0 ? 249 : 247, index === 0 ? 247 : 251);
    pdf.roundedRect(x, summaryY, summaryWidth, 12, 1.5, 1.5, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6);
    pdf.setTextColor(...colors.muted);
    pdf.text(item.label, x + 3, summaryY + 4.5);
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.navy);
    pdf.text(item.value, x + 3, summaryY + 9.5);
  });

  return summaryY + 16;
}

function drawContinuationHeader(
  pdf: jsPDF,
  logoDataUrl: string,
  branchName: string,
  agendaDate: string,
  margin: number,
  contentWidth: number
) {
  pdf.setFillColor(...colors.gold);
  pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), 3, "F");
  pdf.addImage(logoDataUrl, "PNG", margin, 7, 12, 12);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(...colors.navy);
  pdf.text("LALA DENTIST", margin + 16, 11);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(...colors.muted);
  pdf.text(branchName, margin + 16, 16);
  pdf.text(`Agenda: ${formatAgendaDate(agendaDate)}`, margin + contentWidth, 13, { align: "right" });
  pdf.setDrawColor(...colors.line);
  pdf.setLineWidth(0.3);
  pdf.line(margin, 23, margin + contentWidth, 23);
  return 27;
}

function getAgendaRowLines(pdf: jsPDF, row: DailyAgendaRow, columnWidths: number[]) {
  const fitLines = (text: string, width: number, style: "bold" | "normal") => {
    pdf.setFont("helvetica", style);
    pdf.setFontSize(7.2);
    const lines = pdf.splitTextToSize(text, width);
    if (lines.length <= 2) return lines;

    let lastLine = lines[1].trimEnd();
    while (lastLine && pdf.getTextWidth(`${lastLine}...`) > width) {
      lastLine = lastLine.slice(0, -1).trimEnd();
    }
    return [lines[0], `${lastLine}...`];
  };
  return {
    patientLines: fitLines(row.patientName, columnWidths[2] - 6, "bold"),
    treatmentLines: fitLines(row.treatment, columnWidths[3] - 6, "normal"),
    doctorLines: fitLines(row.doctorName, columnWidths[4] - 6, "normal")
  };
}

function drawAgendaRow(
  pdf: jsPDF,
  row: DailyAgendaRow,
  index: number,
  y: number,
  columnWidths: number[],
  margin: number,
  rowHeight: number
) {
  const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
  const rowColor = index % 2 === 0 ? colors.rowAlt : [255, 255, 255] as const;
  pdf.setFillColor(rowColor[0], rowColor[1], rowColor[2]);
  pdf.rect(margin, y, tableWidth, rowHeight, "F");
  pdf.setDrawColor(...colors.line);
  pdf.setLineWidth(0.25);
  pdf.line(margin, y + rowHeight, margin + tableWidth, y + rowHeight);
  let gridX = margin;
  for (let columnIndex = 0; columnIndex < columnWidths.length - 1; columnIndex += 1) {
    gridX += columnWidths[columnIndex];
    pdf.line(gridX, y, gridX, y + rowHeight);
  }
  pdf.line(margin, y, margin, y + rowHeight);
  pdf.line(margin + tableWidth, y, margin + tableWidth, y + rowHeight);

  const { patientLines, treatmentLines, doctorLines } = getAgendaRowLines(pdf, row, columnWidths);
  const cells = [patientLines, treatmentLines, doctorLines];

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.2);
  pdf.setTextColor(...colors.text);
  pdf.text(String(index + 1), margin + columnWidths[0] / 2, y + rowHeight / 2 + 1, { align: "center" });
  pdf.setFont("helvetica", "bold");
  pdf.text(row.time, margin + columnWidths[0] + columnWidths[1] / 2, y + rowHeight / 2 + 1, { align: "center" });

  let x = margin + columnWidths[0] + columnWidths[1];
  cells.forEach((lines, indexInCells) => {
    pdf.setFont("helvetica", indexInCells === 0 ? "bold" : "normal");
    const textY = y + (rowHeight - (lines.length - 1) * 3.5) / 2 + 1.5;
    pdf.text(lines, x + 3, textY, { lineHeightFactor: 1.1 });
    x += columnWidths[indexInCells + 2];
  });

  const statusX = margin + tableWidth - columnWidths[5];
  const statusColor = row.status === "Check-in"
    ? colors.violet
    : row.kind === "AVAILABLE"
      ? [38, 132, 90] as const
      : row.kind === "BLOCKED"
        ? colors.muted
        : row.status === "Dikonfirmasi"
          ? colors.blue
          : colors.amber;
  if (row.status) {
    const pillWidth = Math.min(columnWidths[5] - 4, Math.max(19, pdf.getTextWidth(row.status) + 7));
    const pillX = statusX + (columnWidths[5] - pillWidth) / 2;
    const pillY = y + (rowHeight - 6) / 2;
    pdf.setFillColor(statusColor[0], statusColor[1], statusColor[2]);
    pdf.roundedRect(pillX, pillY, pillWidth, 6, 2, 2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.2);
    pdf.setTextColor(255, 255, 255);
    pdf.text(row.status, statusX + columnWidths[5] / 2, pillY + 4, { align: "center" });
  }
}

export function getDailyAgendaPdfFileName(
  branch: Pick<DentalBranch, "name" | "branchCode">,
  agendaDate: string
): string {
  const branchSlug = (branch.branchCode || branch.name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `agenda-jadwal-${branchSlug}-${agendaDate}.pdf`;
}

export async function createDailyAgendaPdf({
  branch,
  agendaDate,
  rows
}: {
  branch: Pick<DentalBranch, "name" | "address" | "branchCode">;
  agendaDate: string;
  rows: DailyAgendaRow[];
}): Promise<jsPDF> {
  const logoDataUrl = await loadLogoDataUrl();
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;
  const footerY = pageHeight - 7;
  const columnWidths = [9, 15, 38, 55, 34, 35];
  const doctorCount = new Set(rows.map((row) => row.doctorName).filter(Boolean)).size;
  const bookingCount = rows.filter((row) => row.kind !== "AVAILABLE" && row.kind !== "BLOCKED").length;
  const generatedAt = formatPrintDate(new Date());

  pdf.setProperties({
    title: `Agenda Jadwal Pasien - ${branch.name} - ${agendaDate}`,
    subject: "Lampiran jadwal pasien harian",
    author: "Lala Dentist"
  });

  let y = drawFirstPageHeader(
    pdf,
    logoDataUrl,
    branch,
    agendaDate,
    bookingCount,
    doctorCount,
    margin,
    contentWidth
  );
  y = drawTableHeader(pdf, y, columnWidths, margin) + 1;

  if (rows.length === 0) {
    pdf.setFillColor(...colors.rowAlt);
    pdf.roundedRect(margin, y + 4, contentWidth, 20, 2, 2, "F");
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(...colors.muted);
    pdf.text("Belum ada jadwal aktif pada tanggal ini.", pageWidth / 2, y + 16, { align: "center" });
  }

  rows.forEach((row, index) => {
    const rowHeight = 14;

    if (y + rowHeight > footerY - 2) {
      pdf.addPage();
      y = drawContinuationHeader(pdf, logoDataUrl, branch.name, agendaDate, margin, contentWidth);
      y = drawTableHeader(pdf, y, columnWidths, margin) + 1;
    }

    drawAgendaRow(pdf, row, index, y, columnWidths, margin, rowHeight);
    y += rowHeight;
  });

  const pageCount = pdf.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    pdf.setPage(pageNumber);
    pdf.setDrawColor(...colors.line);
    pdf.setLineWidth(0.3);
    pdf.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(...colors.muted);
    pdf.text("Dokumen internal cabang - jaga kerahasiaan data pasien.", margin, footerY);
    pdf.text(`Halaman ${pageNumber} dari ${pageCount} | Dicetak ${generatedAt}`, pageWidth - margin, footerY, { align: "right" });
  }

  return pdf;
}

export async function downloadDailyAgendaPdf(input: {
  branch: Pick<DentalBranch, "name" | "address" | "branchCode">;
  agendaDate: string;
  rows: DailyAgendaRow[];
}): Promise<void> {
  const pdf = await createDailyAgendaPdf(input);
  pdf.save(getDailyAgendaPdfFileName(input.branch, input.agendaDate));
}
