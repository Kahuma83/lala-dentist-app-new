import React, { useState, useMemo, useRef, useEffect } from "react";
import html2canvas from "html2canvas";
import { useApp } from "../../context/AppContext";
import {
  UserRole,
  DoctorSchedule,
  ScheduleStatus,
  ClinicBranding,
  DentalDoctor
} from "../../types/domain";
import { DEFAULT_CLINIC_BRANDING } from "../../data/mockData";
import { LalaLogo } from "../common/LalaLogo";
import {
  formatIndonesianDate,
  getTodayDateString,
  getTomorrowDateString
} from "../../utils/dateUtils";
import {
  X,
  Calendar,
  Download,
  Share2,
  Copy,
  Check,
  AlertTriangle,
  Building2,
  Clock,
  Sparkles,
  MapPin,
  Phone,
  Palette,
  User,
  Bot,
  Heart,
  ShieldCheck,
  Plus,
  Trash2,
  Smartphone,
  Eye
} from "lucide-react";

interface DoctorSchedulePosterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type PosterTheme = "lala-aesthetic-cream" | "dark-emerald" | "clean-white" | "gold-velvet";
type AspectRatio = "4:5" | "9:16" | "1:1";

export const DoctorSchedulePosterModal: React.FC<DoctorSchedulePosterModalProps> = ({
  isOpen,
  onClose
}) => {
  const {
    currentUser,
    branches,
    doctors,
    doctorSchedules,
    configRepo
  } = useApp();

  const isSuper = currentUser?.role === UserRole.SUPER_ADMIN;

  // Selected date for poster (default to today's date)
  const [posterDate, setPosterDate] = useState<string>(() => getTodayDateString());
  // Selected branch filter (default to "ALL" for multi-branch poster)
  const [selectedBranchId, setSelectedBranchId] = useState<string>("ALL");
  // Aspect ratio option: "4:5" (Default Instagram portrait), "9:16" (Story/WA), "1:1" (Square)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:5");
  // Theme option (Default to the aesthetic cream design matching the brochure)
  const [posterTheme, setPosterTheme] = useState<PosterTheme>("lala-aesthetic-cream");

  // Branding state
  const [branding, setBranding] = useState<ClinicBranding>(DEFAULT_CLINIC_BRANDING);

  // UI feedback states
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [copiedCaption, setCopiedCaption] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [showAiPromptModal, setShowAiPromptModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const posterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (configRepo && typeof configRepo.getClinicBranding === "function") {
      configRepo.getClinicBranding().then((b) => {
        if (b) setBranding(b);
      }).catch((err) => console.error("Error loading branding:", err));
    }
  }, [configRepo]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Active branches to render
  const activeBranches = useMemo(() => {
    const list = branches.filter((b) => b.isActive ?? (b as any).active ?? true);
    if (selectedBranchId === "ALL") {
      return list;
    }
    return list.filter((b) => b.id === selectedBranchId);
  }, [branches, selectedBranchId]);

  // 2. Doctor map for quick lookup
  const doctorMap = useMemo(() => {
    const map = new Map<
      string,
      { name: string; specialization?: string; image?: string }
    >();
    doctors.forEach((d) => {
      const docName = d.name || d.fullName || "Dokter Gigi";
      const spec = d.specialization || "Dokter Gigi";
      const img = d.avatarUrl || d.photoUrl || d.profileImage || (d as any).image;
      map.set(d.id, { name: docName, specialization: spec, image: img });
    });
    return map;
  }, [doctors]);

  // 3. Filtered and sorted schedules per branch for the selected date
  const schedulesByBranch = useMemo(() => {
    const map = new Map<string, DoctorSchedule[]>();

    const targetSchedules = doctorSchedules.filter((s) => {
      const matchDate = s.date === posterDate;
      const matchStatus = s.status !== ScheduleStatus.CANCELLED;
      return matchDate && matchStatus;
    });

    activeBranches.forEach((b) => {
      const branchScheds = targetSchedules
        .filter((s) => s.branchId === b.id)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
      map.set(b.id, branchScheds);
    });

    return map;
  }, [doctorSchedules, posterDate, activeBranches]);

  // 4. Formatted Indonesian day name and full date
  const formattedDateDetails = useMemo(() => {
    const dateObj = new Date(posterDate + "T00:00:00");
    const dayNames = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    const monthNames = [
      "Januari", "Februari", "Maret", "April", "Mei", "Juni",
      "Juli", "Agustus", "September", "Oktober", "November", "Desember"
    ];

    const dayName = dayNames[dateObj.getDay()] || "Rabu";
    const dateNum = String(dateObj.getDate()).padStart(2, "0");
    const monthName = monthNames[dateObj.getMonth()] || "Oktober";
    const year = dateObj.getFullYear();

    return {
      dayName,
      fullDateLabel: `${dayName}, ${dateNum} ${monthName} ${year}`,
      dateOnly: `${dateNum} ${monthName} ${year}`
    };
  }, [posterDate]);

  // 5. Dynamic caption text generator
  const generatedCaption = useMemo(() => {
    const clinicName = branding?.name || "Lala Dentist";
    const phone = branding?.phone || "0812-3456-7890";

    return `🦷 JADWAL PRAKTEK DOKTER GIGI ${clinicName.toUpperCase()}
📅 ${formattedDateDetails.fullDateLabel}

Yuk reservasi pemeriksaan dan perawatan gigi bersama tim dokter gigi spesialis kami di cabang terdekat!

📍 Cabang Tersedia:
${activeBranches.map((b) => `• Cabang ${b.name}`).join("\n")}

📞 Informasi & Booking Antrean:
${phone}

✨ ${branding?.tagline || "Senyum Indah dimulai di Laladentist"}
"Your Smile Our Priority ♡"

#LalaDentist #JadwalDokter #DokterGigi #KlinikGigi #KesehatanGigi`;
  }, [formattedDateDetails, activeBranches, branding]);

  // 6. Descriptive AI Prompt Generator (For Midjourney / ChatGPT / Canva AI)
  const generatedAiPrompt = useMemo(() => {
    const clinicName = branding?.name || "Lala Dentist";
    const scheduleSummary = activeBranches
      .map((b) => {
        const scheds = schedulesByBranch.get(b.id) || [];
        const doctorsText = scheds.length > 0
          ? scheds.map((s) => {
              const doc = doctorMap.get(s.doctorId);
              return `${doc?.name || "Dokter"} (${s.startTime.replace(":", ".")} - ${s.endTime.replace(":", ".")} WIB)`;
            }).join(", ")
          : "Jadwal sesuai konfirmasi";
        return `[Cabang ${b.name}]: ${doctorsText}`;
      })
      .join("\n");

    return `A high-end, elegant dental clinic daily schedule flyer poster for "${clinicName}".
Background: Warm aesthetic cream (#fcf8f2) with soft terracotta (#be7d6a) pastel accents, subtle watercolor olive/sage leaves in the corners, very clean, bright lighting.
Top Header: Modern dental tooth line art logo "${clinicName} - Healthy Smile, Brighter Future", large elegant handwritten script "Jadwal", bold luxury serif typography "DOKTER GIGI", subtitle "L A L A D E N T I S T" between thin divider lines, and a rounded terracotta pill badge displaying "🗓️ ${formattedDateDetails.fullDateLabel}". Handwritten cute note on top right "Your Smile Our Priority ♡".
Content Layout: 2-column clean card grid organized by branch sections:
${scheduleSummary}
Each doctor item has a rounded portrait frame preserving real authentic Indonesian doctor portraits with white medical coats/hijab, bold clean doctor name, and clock badge with WIB operating hours.
Footer: 3 minimalist pill icons [Pelayanan Profesional] [Peralatan Modern] [Ramah & Nyaman] and handwritten script "Jaga Kesehatan Gigi Bersama Laladentist ♡".
Quality: 8K resolution, hyper-realistic graphic design, professional medical clinic marketing material, balanced typography.`;
  }, [formattedDateDetails, activeBranches, schedulesByBranch, doctorMap, branding]);

  // Handler: Copy Caption
  const handleCopyCaption = () => {
    navigator.clipboard.writeText(generatedCaption);
    setCopiedCaption(true);
    showToast("Caption Instagram & WhatsApp berhasil disalin!");
    setTimeout(() => setCopiedCaption(false), 2500);
  };

  // Handler: Copy AI Prompt
  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(generatedAiPrompt);
    setCopiedPrompt(true);
    showToast("Prompt AI berhasil disalin ke clipboard!");
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  // Handler: Download Poster as PNG HD
  const handleDownloadPoster = async () => {
    if (!posterRef.current) return;
    setIsDownloading(true);

    try {
      const canvas = await html2canvas(posterRef.current, {
        scale: 3, // Ultra-sharp 3x DPI output
        useCORS: true,
        allowTaint: true,
        backgroundColor:
          posterTheme === "lala-aesthetic-cream"
            ? "#fcf8f2"
            : posterTheme === "clean-white"
            ? "#ffffff"
            : "#0f172a"
      });

      const image = canvas.toDataURL("image/png");
      const fileName = `Jadwal-Dokter-LalaDentist-${posterDate}.png`;

      const link = document.createElement("a");
      link.href = image;
      link.download = fileName;
      link.click();

      showToast(`Poster HD berhasil diunduh (${fileName})!`);
    } catch (err) {
      console.error("Gagal membuat gambar poster:", err);
      showToast("Gagal mengunduh poster. Silakan coba lagi.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Handler: Share via WhatsApp
  const handleShareWhatsApp = async () => {
    const clinicName = branding?.name || "Lala Dentist";
    const textMessage = encodeURIComponent(
      `🦷 *JADWAL DOKTER GIGI ${clinicName.toUpperCase()}*\n📅 *${formattedDateDetails.fullDateLabel}*\n\nSilakan cek jadwal dokter gigi kami hari ini di cabang terdekat Anda!`
    );

    await handleDownloadPoster();

    const waUrl = `https://wa.me/?text=${textMessage}`;
    window.open(waUrl, "_blank");
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 text-white rounded-3xl border border-slate-800 max-w-6xl w-full my-auto shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="px-6 py-4 bg-slate-800/90 border-b border-slate-700/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/15 text-amber-300 rounded-2xl border border-amber-500/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                Studio Poster Jadwal Dokter (100% Foto Asli)
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/30">
                  Ultra-HD Ready
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Ganti tanggal, nama dokter, dan jam praktek langsung. Format estetik persis brosur resmi Lala Dentist!
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Controls + Canvas Preview */}
        <div className="p-4 sm:p-6 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Control Panel */}
          <div className="lg:col-span-5 space-y-4">
            
            {/* AI Fidelity Guarantee Box */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-950/80 to-slate-900 border border-emerald-500/40 rounded-2xl text-xs space-y-1.5 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Garansi 100% Foto Asli Dokter Terjaga</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Aplikasi menggunakan <strong>Dynamic Canvas Rendering</strong> beresolusi tinggi. Foto dokter asli dari database dijamin <strong>tidak akan berubah, terdistorsi, atau berhalusinasi</strong> seperti AI generator murni.
              </p>
            </div>

            {/* General Settings Card */}
            <div className="bg-slate-800/70 border border-slate-700/70 rounded-2xl p-4 space-y-3.5">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                Pengaturan Jadwal &amp; Tanggal
              </h3>

              {/* Date Input */}
              <div>
                <label className="block text-xs text-slate-300 mb-1 font-semibold">
                  Pilih Hari &amp; Tanggal Poster *
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={posterDate}
                    onChange={(e) => setPosterDate(e.target.value)}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setPosterDate(getTodayDateString())}
                    className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosterDate(getTomorrowDateString())}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0"
                  >
                    Besok
                  </button>
                </div>
              </div>

              {/* Branch Filter */}
              <div>
                <label className="block text-xs text-slate-300 mb-1 font-semibold">
                  Cabang Klinik yang Ditampilkan
                </label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  <option value="ALL">✨ SEMUA CABANG (Multi-Cabang Persis Brosur)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      Cabang {b.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Theme Selector */}
              <div>
                <label className="block text-xs text-slate-300 mb-1.5 font-semibold flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-amber-400" />
                  Tema Estetika Poster
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPosterTheme("lala-aesthetic-cream")}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border text-left transition-all flex items-center gap-2 cursor-pointer ${
                      posterTheme === "lala-aesthetic-cream"
                        ? "bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-[#fcf8f2] border-2 border-[#be7d6a] shrink-0" />
                    <span>Lala Aesthetic Cream (Brosur Asli)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPosterTheme("dark-emerald")}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border text-left transition-all flex items-center gap-2 cursor-pointer ${
                      posterTheme === "dark-emerald"
                        ? "bg-emerald-500/20 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-slate-950 border-2 border-emerald-400 shrink-0" />
                    <span>Dark Emerald Premium</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPosterTheme("clean-white")}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border text-left transition-all flex items-center gap-2 cursor-pointer ${
                      posterTheme === "clean-white"
                        ? "bg-emerald-500/20 border-emerald-400 text-emerald-200 ring-1 ring-emerald-400"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-white border-2 border-slate-300 shrink-0" />
                    <span>Clinic White</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPosterTheme("gold-velvet")}
                    className={`py-2 px-2.5 rounded-xl text-[11px] font-bold border text-left transition-all flex items-center gap-2 cursor-pointer ${
                      posterTheme === "gold-velvet"
                        ? "bg-amber-500/20 border-amber-400 text-amber-200 ring-1 ring-amber-400"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    <span className="w-4 h-4 rounded-full bg-stone-900 border-2 border-amber-400 shrink-0" />
                    <span>Gold Velvet</span>
                  </button>
                </div>
              </div>

              {/* Aspect Ratio */}
              <div>
                <label className="block text-xs text-slate-300 mb-1.5 font-semibold">
                  Ukuran &amp; Format Media Sosial
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setAspectRatio("4:5")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                      aspectRatio === "4:5"
                        ? "bg-amber-500/20 border-amber-400 text-amber-300"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    Feed 4:5 (Brosur)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio("9:16")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                      aspectRatio === "9:16"
                        ? "bg-amber-500/20 border-amber-400 text-amber-300"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    Story / WA 9:16
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio("1:1")}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border text-center transition-all cursor-pointer ${
                      aspectRatio === "1:1"
                        ? "bg-amber-500/20 border-amber-400 text-amber-300"
                        : "bg-slate-900 border-slate-700 text-slate-400 hover:text-white"
                    }`}
                  >
                    Square 1:1
                  </button>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleDownloadPoster}
                disabled={isDownloading}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-extrabold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 transition-all cursor-pointer disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                {isDownloading ? "Mengekspor Poster HD..." : "Download Poster Jadi (PNG Ultra-HD)"}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleShareWhatsApp}
                  className="py-2.5 px-3 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-600/40 text-emerald-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Bagikan WhatsApp
                </button>

                <button
                  onClick={() => setShowAiPromptModal(true)}
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Bot className="w-3.5 h-3.5 text-amber-400" />
                  Salin Prompt AI
                </button>
              </div>
            </div>

            {/* Caption Preview Box */}
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-3.5 text-xs text-slate-300 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                <span>Caption Media Sosial Otomatis:</span>
                <button
                  onClick={handleCopyCaption}
                  className="text-amber-400 hover:text-amber-300 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                >
                  {copiedCaption ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedCaption ? "Tersalin!" : "Salin Caption"}</span>
                </button>
              </div>
              <pre className="text-[10.5px] text-slate-300 font-sans whitespace-pre-wrap leading-relaxed bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 max-h-24 overflow-y-auto">
                {generatedCaption}
              </pre>
            </div>

            {toastMessage && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{toastMessage}</span>
              </div>
            )}
          </div>

          {/* Right Column: Poster Canvas Preview */}
          <div className="lg:col-span-7 flex flex-col items-center justify-center">
            
            <div className="text-center mb-2">
              <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold flex items-center justify-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-amber-400" />
                Pratinjau Poster Siap Publikasi
              </span>
            </div>

            {/* Target Container to Convert to Image */}
            <div
              ref={posterRef}
              className={`w-full max-w-[480px] rounded-3xl p-5 sm:p-6 border flex flex-col justify-between transition-all overflow-hidden relative shadow-2xl ${
                aspectRatio === "4:5"
                  ? "aspect-[4/5]"
                  : aspectRatio === "9:16"
                  ? "aspect-[9/16]"
                  : "aspect-square"
              } ${
                posterTheme === "lala-aesthetic-cream"
                  ? "bg-[#fcf8f2] text-slate-800 border-[#e8ded1]"
                  : posterTheme === "clean-white"
                  ? "bg-white text-slate-900 border-slate-200"
                  : posterTheme === "gold-velvet"
                  ? "bg-gradient-to-b from-stone-950 via-stone-900 to-amber-950 text-white border-amber-900/50"
                  : "bg-gradient-to-b from-slate-950 via-teal-950 to-slate-950 text-white border-slate-800"
              }`}
              style={{
                fontFamily: "'Playfair Display', 'Plus Jakarta Sans', Georgia, serif"
              }}
            >
              {/* Decorative Background Leaves (for Aesthetic Cream Theme) */}
              {posterTheme === "lala-aesthetic-cream" && (
                <>
                  <div className="absolute top-2 left-2 w-16 h-16 opacity-30 pointer-events-none text-[#a67c52]">
                    🌿
                  </div>
                  <div className="absolute bottom-2 right-2 w-16 h-16 opacity-30 pointer-events-none text-[#a67c52]">
                    🍃
                  </div>
                </>
              )}

              {/* POSTER TOP HEADER */}
              <div className="relative text-center pb-2">
                {/* Logo Top Left & Right */}
                <div className="flex items-center justify-between pb-1">
                  <div className="flex items-center gap-1.5">
                    <LalaLogo src={branding?.logoUrl} className="w-6 h-6 text-[#be7d6a]" />
                    <div className="text-left font-sans">
                      <div className="text-[11px] font-black tracking-tight text-slate-800 leading-none">
                        laladentist
                      </div>
                      <div className="text-[7px] text-slate-500 font-semibold tracking-wide mt-0.5">
                        Healthy Smile, Brighter Future
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <LalaLogo src={branding?.logoUrl} className="w-5 h-5 text-[#be7d6a]" />
                    <span className="text-[10px] font-black tracking-tight text-slate-800 font-sans">
                      laladentist
                    </span>
                  </div>
                </div>

                {/* Main Heading */}
                <div className="mt-1">
                  <div
                    className="text-2xl sm:text-3xl italic font-normal text-[#8c654d] leading-none"
                    style={{ fontFamily: "'Dancing Script', 'Brush Script MT', cursive, serif" }}
                  >
                    Jadwal
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black tracking-wider uppercase text-slate-900 leading-tight mt-0.5 font-serif">
                    DOKTER GIGI
                  </h1>
                  <div className="flex items-center justify-center gap-2 text-[9px] font-bold uppercase tracking-[0.25em] text-slate-600 font-sans mt-0.5">
                    <span className="w-6 h-[1px] bg-slate-300" />
                    <span>L A L A D E N T I S T</span>
                    <span className="w-6 h-[1px] bg-slate-300" />
                  </div>
                </div>

                {/* Date Pill & Handwritten Tagline */}
                <div className="mt-2 flex items-center justify-center relative font-sans">
                  <div className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-[10.5px] font-extrabold bg-[#be7d6a] text-white shadow-xs">
                    <Calendar className="w-3 h-3 text-amber-200" />
                    <span>{formattedDateDetails.fullDateLabel}</span>
                  </div>

                  <div
                    className="absolute right-0 text-[9px] italic text-slate-500 hidden sm:block rotate-[-6deg]"
                    style={{ fontFamily: "cursive" }}
                  >
                    Your Smile Our Priority ♡
                  </div>
                </div>
              </div>

              {/* POSTER BODY: BRANCH CARDS */}
              <div className="my-2 flex-1 overflow-y-auto pr-0.5 font-sans">
                <div
                  className={`grid gap-2.5 ${
                    activeBranches.length === 1
                      ? "grid-cols-1"
                      : "grid-cols-2"
                  }`}
                >
                  {activeBranches.map((branch) => {
                    const scheds = schedulesByBranch.get(branch.id) || [];

                    return (
                      <div
                        key={branch.id}
                        className={`rounded-2xl p-2.5 flex flex-col justify-between border transition-all ${
                          posterTheme === "lala-aesthetic-cream"
                            ? "bg-white/85 border-[#ebdcd0] shadow-xs"
                            : posterTheme === "clean-white"
                            ? "bg-slate-50 border-slate-200"
                            : "bg-slate-900/90 border-slate-800"
                        }`}
                      >
                        {/* Branch Title Badge */}
                        <div>
                          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-[#be7d6a] text-white mb-2 shadow-xs">
                            <MapPin className="w-2.5 h-2.5" />
                            <span>Cabang {branch.name}</span>
                          </div>

                          {/* Doctor List */}
                          {scheds.length === 0 ? (
                            <div className="py-3 text-center text-[9px] text-slate-400 italic">
                              Jadwal konfirmasi cabang
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {scheds.map((s) => {
                                const doc = doctorMap.get(s.doctorId);
                                const docName = doc?.name || "drg. Dokter";
                                const photoUrl = doc?.image;

                                return (
                                  <div
                                    key={s.id}
                                    className="flex items-center gap-2 p-1.5 rounded-xl bg-[#faf6f0]/90 border border-[#f0e4d7] hover:border-[#be7d6a]/50 transition-colors"
                                  >
                                    {/* Real Doctor Portrait Photo (100% Unaltered) */}
                                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-200 overflow-hidden shrink-0 border-2 border-white shadow-xs">
                                      {photoUrl ? (
                                        <img
                                          src={photoUrl}
                                          alt={docName}
                                          crossOrigin="anonymous"
                                          className="w-full h-full object-cover object-top"
                                        />
                                      ) : (
                                        <div className="w-full h-full bg-[#be7d6a] text-white flex items-center justify-center font-bold text-[10px]">
                                          {docName.replace(/^drg\.\s*/i, "").charAt(0)}
                                        </div>
                                      )}
                                    </div>

                                    {/* Name & Time */}
                                    <div className="min-w-0 flex-1">
                                      <div className="font-bold text-[11px] sm:text-[11.5px] text-slate-900 truncate leading-tight font-serif">
                                        {docName}
                                      </div>
                                      <div className="text-[9px] font-mono text-slate-600 flex items-center gap-1 mt-0.5 font-semibold">
                                        <Clock className="w-2.5 h-2.5 text-[#be7d6a] shrink-0" />
                                        <span>
                                          {s.startTime.replace(":", ".")} - {s.endTime.replace(":", ".")} WIB
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* POSTER FOOTER */}
              <div className="pt-2 border-t border-[#e8ded1] flex items-center justify-between text-[8px] sm:text-[9px] text-slate-600 font-sans">
                {/* 3 Value Badges */}
                <div className="flex items-center gap-2 text-slate-700 font-semibold">
                  <span className="flex items-center gap-0.5">
                    <span>🦷</span> Pelayanan Profesional
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-0.5">
                    <span>🪑</span> Peralatan Modern
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-0.5">
                    <span>♡</span> Ramah &amp; Nyaman
                  </span>
                </div>

                {/* Signature */}
                <div
                  className="text-[#8c654d] font-bold italic text-[9px] sm:text-[10px]"
                  style={{ fontFamily: "cursive" }}
                >
                  Jaga Kesehatan Gigi Bersama Laladentist ♡
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>

      {/* AI PROMPT MODAL */}
      {showAiPromptModal && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white rounded-2xl border border-slate-700 max-w-lg w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm text-white">Prompt AI Siap Pakai</h3>
              </div>
              <button
                onClick={() => setShowAiPromptModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Prompt di bawah ini telah otomatis disesuaikan dengan tanggal, daftar dokter, cabang, dan jam praktek aktif. Salin prompt ini jika ingin menggunakannya di platform AI seperti ChatGPT, Midjourney, Canva Magic Studio, atau Figma AI.
            </p>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl max-h-48 overflow-y-auto">
              <pre className="text-[11px] font-mono text-amber-200 whitespace-pre-wrap leading-relaxed">
                {generatedAiPrompt}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAiPromptModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleCopyPrompt}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                {copiedPrompt ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedPrompt ? "Prompt Tersalin!" : "Salin Prompt AI"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
