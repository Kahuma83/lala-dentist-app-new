import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, Camera, Download, FileText, Image, LoaderCircle, MessageCircle, Paperclip, Send, X } from "lucide-react";
import {
  DoctorChatMessage,
  DoctorChatRealtimeStatus,
  downloadDoctorChatAttachment,
  getDoctorChatMessages,
  sendDoctorChatMessage,
  subscribeToDoctorChat
} from "./doctorChatService";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 400_000;

function formatMessageTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mergeMessages(current: DoctorChatMessage[], incoming: DoctorChatMessage[]) {
  const uniqueMessages = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => uniqueMessages.set(message.id, message));
  return Array.from(uniqueMessages.values())
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
}

async function compressChatImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= MAX_IMAGE_BYTES) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Gambar tidak dapat dibaca. Pilih atau ambil ulang gambar.");
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Browser tidak dapat menyiapkan kompresi gambar.");

    let width = bitmap.width;
    let height = bitmap.height;
    let quality = 0.82;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#fff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => result ? resolve(result) : reject(new Error("Gambar gagal dikompres.")),
          "image/jpeg",
          quality
        );
      });
      if (blob.size <= MAX_IMAGE_BYTES) {
        const jpegName = `${file.name.replace(/\.[^.]+$/, "") || "gambar"}.jpg`;
        return new File([blob], jpegName, { type: "image/jpeg", lastModified: Date.now() });
      }

      if (quality > 0.5) {
        quality = Math.max(0.5, quality - 0.1);
      } else {
        width = Math.max(1, Math.floor(width * 0.8));
        height = Math.max(1, Math.floor(height * 0.8));
        quality = 0.82;
      }
    }
    throw new Error("Gambar tidak dapat dikompres hingga maksimal 400 KB.");
  } finally {
    bitmap.close();
  }
}

export function DoctorGroupChat({ currentUserId }: { currentUserId: string }) {
  const [messages, setMessages] = useState<DoctorChatMessage[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [groupName, setGroupName] = useState("Grup Dokter");
  const [messageText, setMessageText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [preparingFile, setPreparingFile] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [realtimeStatus, setRealtimeStatus] = useState<DoctorChatRealtimeStatus>("connecting");
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);
  const fetchingRef = useRef(false);
  const scrollToBottomRef = useRef(true);
  const restoreScrollRef = useRef<{ height: number; top: number } | null>(null);

  const loadMessages = useCallback(async (showSpinner = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (showSpinner) setLoading(true);
    try {
      const list = listRef.current;
      scrollToBottomRef.current = showSpinner ||
        !list ||
        list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      const page = await getDoctorChatMessages();
      if (!mountedRef.current) return;
      setGroupName(page.group.name);
      setHasOlderMessages(page.hasMore);
      setMessages((previous) => mergeMessages(previous, page.messages));
      setError(null);
    } catch (loadError) {
      if (mountedRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Gagal memuat chat.");
      }
    } finally {
      fetchingRef.current = false;
      if (showSpinner && mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribe = () => {};
    void loadMessages(true).then(() => {
      if (!mountedRef.current) return;
      unsubscribe = subscribeToDoctorChat(
        () => void loadMessages(),
        (status) => {
          if (!mountedRef.current) return;
          setRealtimeStatus(status);
          if (status === "connected") {
            setError(null);
            void loadMessages();
          } else if (status === "configuration_error") {
            setError("Realtime belum dikonfigurasi. Tambahkan URL dan publishable key project chat pada variabel VITE_CHAT_SUPABASE_URL dan VITE_CHAT_SUPABASE_ANON_KEY.");
          } else if (status === "disconnected") {
            setError("Koneksi realtime terputus. Chat akan tersambung kembali otomatis.");
          }
        }
      );
    });
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      mountedRef.current = false;
      unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [loadMessages]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (restoreScrollRef.current) {
      list.scrollTop = restoreScrollRef.current.top + list.scrollHeight - restoreScrollRef.current.height;
      restoreScrollRef.current = null;
    } else if (scrollToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
      scrollToBottomRef.current = false;
    }
  }, [messages]);

  const loadOlderMessages = async () => {
    if (loadingOlder || !hasOlderMessages || messages.length === 0) return;
    const list = listRef.current;
    if (!list) return;
    setLoadingOlder(true);
    setError(null);
    restoreScrollRef.current = { height: list.scrollHeight, top: list.scrollTop };
    try {
      const page = await getDoctorChatMessages(messages[0]);
      if (!mountedRef.current) return;
      setMessages((previous) => mergeMessages(previous, page.messages));
      setHasOlderMessages(page.hasMore);
    } catch (loadError) {
      restoreScrollRef.current = null;
      setError(loadError instanceof Error ? loadError.message : "Gagal memuat riwayat chat.");
    } finally {
      if (mountedRef.current) setLoadingOlder(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    setFileError(null);
    setSelectedFile(null);
    if (file && file.size > MAX_FILE_BYTES) {
      setFileError("Ukuran lampiran maksimal 10 MB.");
      return;
    }
    if (!file) return;

    setPreparingFile(true);
    try {
      const preparedFile = await compressChatImage(file);
      setSelectedFile(preparedFile);
    } catch (compressionError) {
      setFileError(compressionError instanceof Error ? compressionError.message : "Gagal menyiapkan lampiran.");
    } finally {
      setPreparingFile(false);
    }
  };

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    const text = messageText.trim();
    if ((!text && !selectedFile) || sending || preparingFile) return;
    if (text.length > 5000) {
      setError("Pesan maksimal 5.000 karakter.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const message = await sendDoctorChatMessage(text, selectedFile);
      scrollToBottomRef.current = true;
      setMessages((previous) => mergeMessages(previous, [message]));
      setMessageText("");
      setSelectedFile(null);
      setFileError(null);
      await loadMessages();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Gagal mengirim pesan.");
    } finally {
      setSending(false);
    }
  };

  const handleDownload = async (message: DoctorChatMessage) => {
    setDownloadingId(message.id);
    setError(null);
    try {
      const blob = await downloadDoctorChatAttachment(message.id);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = message.attachmentFileName || "lampiran-chat";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Gagal mengunduh lampiran.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className="chat-panel" aria-label="Chat grup dokter">
      <header className="chat-header">
        <span className="chat-title-icon"><MessageCircle /></span>
        <div className="chat-title">
          <strong>{groupName}</strong>
          <span>Percakapan bersama dokter · pesan diterima langsung</span>
        </div>
        <span className={`chat-online${isOnline && realtimeStatus === "connected" ? " online" : ""}`}>
          {!isOnline ? "Offline" : realtimeStatus === "connected" ? "Realtime" : realtimeStatus === "connecting" ? "Menghubungkan" : "Terputus"}
        </span>
      </header>

      {error && (
        <div className="chat-error" role="alert">
          <AlertCircle />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Tutup pesan kesalahan"><X /></button>
        </div>
      )}

      <div ref={listRef} className="chat-messages">
        {hasOlderMessages && !loading && (
          <div className="chat-load-older">
            <button type="button" onClick={() => void loadOlderMessages()} disabled={loadingOlder}>
              {loadingOlder ? "Memuat riwayat..." : "Muat pesan sebelumnya"}
            </button>
          </div>
        )}
        {loading ? (
          <div className="chat-loading"><LoaderCircle className="spin" /> Memuat percakapan...</div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <MessageCircle />
            <strong>Belum ada pesan</strong>
            <span>Mulai percakapan dengan dokter lainnya.</span>
          </div>
        ) : messages.map((message) => {
          const ownMessage = message.senderClinicUserId === currentUserId;
          const imageAttachment = message.attachmentContentType?.startsWith("image/");
          return (
            <article key={message.id} className={`chat-message-row${ownMessage ? " own" : ""}`}>
              <div className={`chat-message${ownMessage ? " own" : ""}`}>
                <div className="chat-message-meta">
                  <strong>{ownMessage ? "Anda" : message.senderName}</strong>
                  <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                </div>
                {message.messageText && <p>{message.messageText}</p>}
                {message.attachmentFileName && (
                  <button
                    type="button"
                    className="chat-attachment"
                    onClick={() => void handleDownload(message)}
                    disabled={downloadingId === message.id}
                  >
                    <span className="chat-attachment-icon">{imageAttachment ? <Image /> : <FileText />}</span>
                    <span className="chat-attachment-details">
                      <strong>{message.attachmentFileName}</strong>
                      <small>{formatFileSize(message.attachmentSizeBytes)}</small>
                    </span>
                    {downloadingId === message.id ? <LoaderCircle className="spin" /> : <Download />}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <form className="chat-compose" onSubmit={(event) => void handleSend(event)}>
        {fileError && <p className="chat-file-error" role="alert">{fileError}</p>}
        {preparingFile && <p className="chat-file-error" role="status">Mengompres gambar hingga maksimal 400 KB...</p>}
        {selectedFile && (
          <div className="chat-selected-file">
            <Paperclip />
            <span>{selectedFile.name} · {formatFileSize(selectedFile.size)}</span>
            <button type="button" onClick={() => setSelectedFile(null)} aria-label="Hapus lampiran"><X /></button>
          </div>
        )}
        <div className="chat-compose-row">
          <input
            ref={fileInputRef}
            type="file"
            className="visually-hidden"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFile}
            aria-label="Pilih lampiran"
          />
          <input
            ref={cameraInputRef}
            type="file"
            className="visually-hidden"
            accept="image/*"
            capture="environment"
            onChange={handleFile}
            aria-label="Ambil foto dengan kamera"
          />
          <div className="chat-actions">
          <button
            type="button"
            className="chat-icon-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || preparingFile}
            title="Lampirkan gambar, PDF, DOC, atau DOCX (maks. 10 MB)"
            aria-label="Lampirkan file"
          >
            <Paperclip />
          </button>
          <button
            type="button"
            className="chat-icon-button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={sending || preparingFile}
            title="Ambil foto dengan kamera"
            aria-label="Ambil foto dengan kamera"
          >
            <Camera />
          </button>
          </div>
          <textarea
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            maxLength={5000}
            rows={1}
            placeholder="Tulis pesan... (Enter untuk kirim)"
            aria-label="Tulis pesan"
          />
          <button type="submit" className="chat-send-button" disabled={sending || preparingFile || (!messageText.trim() && !selectedFile)}>
            {sending || preparingFile ? <LoaderCircle className="spin" /> : <Send />}
            <span>{preparingFile ? "Proses" : sending ? "Mengirim" : "Kirim"}</span>
          </button>
        </div>
        <div className="chat-compose-hint">
          <span>Gambar maks. 400 KB · PDF/Word maks. 10 MB</span>
          <span>{messageText.length}/5000</span>
        </div>
      </form>
    </section>
  );
}
