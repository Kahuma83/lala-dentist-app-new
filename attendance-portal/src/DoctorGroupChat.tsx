import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Camera, Download, FileText, Image, Images, LoaderCircle, MessageCircle, Paperclip, Pin, PinOff, Reply, Search, Send, Smile, X } from "lucide-react";
import {
  doctorChatStickers,
  getDoctorChatMessagePreview,
  getDoctorChatSticker,
  getDoctorChatStickerUrl
} from "./doctorChatStickers";
import {
  DoctorChatMessage,
  DoctorChatRealtimeStatus,
  downloadDoctorChatAttachment,
  getDoctorChatMessages,
  setDoctorChatMessagePinned,
  sendDoctorChatMessage,
  subscribeToDoctorChat
} from "./doctorChatService";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 400_000;
const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;

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

function ChatAvatar({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageUrl]);
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "D";
  return (
    <span className="chat-avatar" aria-label={`Foto profil ${name}`}>
      {imageUrl && !failed
        ? <img src={imageUrl} alt="" loading="lazy" onError={() => setFailed(true)} />
        : <span>{initials}</span>}
    </span>
  );
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

function ChatImagePreview({ message }: { message: DoctorChatMessage }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    let active = true;
    let objectUrl: string | null = null;

    const loadPreview = async () => {
      try {
        const blob = await downloadDoctorChatAttachment(message.id);
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      } catch {
        if (active) setPreviewError(true);
      }
    };

    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          void loadPreview();
        }
      }, { rootMargin: "160px" });
      observer.observe(element);
      return () => {
        active = false;
        observer.disconnect();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
    }

    void loadPreview();
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [message.id]);

  return (
    <div ref={previewRef} className="chat-image-preview">
      {previewUrl
        ? <img src={previewUrl} alt={message.attachmentFileName || "Gambar lampiran chat"} />
        : <span>{previewError ? "Gambar gagal dimuat" : <><LoaderCircle className="spin" /> Memuat gambar...</>}</span>}
    </div>
  );
}

export function DoctorGroupChat({ currentUserId, onBack }: { currentUserId: string; onBack: () => void }) {
  const [messages, setMessages] = useState<DoctorChatMessage[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [groupName, setGroupName] = useState("Grup Dokter");
  const [pinnedMessage, setPinnedMessage] = useState<DoctorChatMessage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState<DoctorChatMessage | null>(null);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [preparingFile, setPreparingFile] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [realtimeStatus, setRealtimeStatus] = useState<DoctorChatRealtimeStatus>("connecting");
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);
  const searchRef = useRef("");
  const searchInitializedRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const scrollToBottomRef = useRef(true);
  const restoreScrollRef = useRef<{ height: number; top: number } | null>(null);

  const loadMessages = useCallback(async (showSpinner = false, requestedSearch = searchRef.current) => {
    const requestId = ++loadRequestIdRef.current;
    if (showSpinner) setLoading(true);
    try {
      const list = listRef.current;
      scrollToBottomRef.current = showSpinner ||
        !list ||
        list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      const page = await getDoctorChatMessages(undefined, requestedSearch);
      if (!mountedRef.current || requestId !== loadRequestIdRef.current) return;
      setGroupName(page.group.name);
      setHasOlderMessages(page.hasMore);
      if (!requestedSearch) setPinnedMessage(page.pinnedMessage);
      setMessages((previous) => mergeMessages(previous, page.messages));
      setError(null);
    } catch (loadError) {
      if (mountedRef.current && requestId === loadRequestIdRef.current) {
        setError(loadError instanceof Error ? loadError.message : "Gagal memuat chat.");
      }
    } finally {
      if (requestId === loadRequestIdRef.current && showSpinner && mountedRef.current) setLoading(false);
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

  useEffect(() => {
    if (!searchInitializedRef.current) {
      searchInitializedRef.current = true;
      return;
    }
    const timeoutId = window.setTimeout(() => {
      const searchTerm = searchInput.trim();
      searchRef.current = searchTerm;
      setMessages([]);
      setHasOlderMessages(false);
      restoreScrollRef.current = null;
      scrollToBottomRef.current = true;
      void loadMessages(true, searchTerm);
    }, 300);
    return () => window.clearTimeout(timeoutId);
  }, [loadMessages, searchInput]);

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
      const page = await getDoctorChatMessages(messages[0], searchRef.current);
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

  const handlePinMessage = async (message: DoctorChatMessage) => {
    const shouldPin = pinnedMessage?.id !== message.id;
    setPinningId(message.id);
    setError(null);
    try {
      await setDoctorChatMessagePinned(message.id, shouldPin);
      searchRef.current = "";
      setSearchInput("");
      setMessages([]);
      setHasOlderMessages(false);
      await loadMessages(true, "");
    } catch (pinError) {
      setError(pinError instanceof Error ? pinError.message : "Gagal mengubah pesan yang disematkan.");
    } finally {
      setPinningId(null);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    event.target.value = "";
    setFileError(null);
    setSelectedFile(null);
    if (file && file.type.startsWith("image/") && file.size > MAX_SOURCE_IMAGE_BYTES) {
      setFileError("Ukuran foto sebelum diproses maksimal 25 MB.");
      return;
    }
    if (file && !file.type.startsWith("image/") && file.size > MAX_FILE_BYTES) {
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
      const replySnapshot = replyTo ? {
        id: replyTo.id,
        senderName: replyTo.senderName,
        messageText: replyTo.messageText,
        attachmentFileName: replyTo.attachmentFileName,
        attachmentContentType: replyTo.attachmentContentType
      } : undefined;
      const message = await sendDoctorChatMessage(text, selectedFile, replyTo?.id);
      scrollToBottomRef.current = true;
      setMessages((previous) => mergeMessages(previous, [{ ...message, replyTo: message.replyTo || replySnapshot }]));
      setMessageText("");
      setSelectedFile(null);
      setFileError(null);
      setReplyTo(null);
      await loadMessages();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Gagal mengirim pesan.");
    } finally {
      setSending(false);
    }
  };

  const handleSendSticker = async (stickerId: string) => {
    const sticker = doctorChatStickers.find((item) => item.id === stickerId);
    if (!sticker || sending || preparingFile) return;

    setSending(true);
    setError(null);
    try {
      const message = await sendDoctorChatMessage(`sticker:${sticker.id}`);
      scrollToBottomRef.current = true;
      setMessages((previous) => mergeMessages(previous, [message]));
      setReplyTo(null);
      setStickerPickerOpen(false);
      await loadMessages();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Gagal mengirim stiker.");
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
        <button type="button" className="chat-back-button" onClick={onBack} aria-label="Kembali ke portal">
          <ArrowLeft />
        </button>
        <span className="chat-title-icon"><MessageCircle /></span>
        <div className="chat-title">
          <strong>{groupName}</strong>
          <span>Percakapan bersama dokter · pesan diterima langsung</span>
        </div>
        <span className={`chat-online${isOnline && realtimeStatus === "connected" ? " online" : ""}`}>
          {!isOnline ? "Offline" : realtimeStatus === "connected" ? "Realtime" : realtimeStatus === "connecting" ? "Menghubungkan" : "Terputus"}
        </span>
      </header>

      <div className="chat-tools">
        <div className="chat-search">
          <Search />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Cari pesan, dokter, atau lampiran"
            aria-label="Cari pesan chat"
            maxLength={100}
          />
          {searchInput && (
            <button type="button" onClick={() => setSearchInput("")} aria-label="Hapus pencarian"><X /></button>
          )}
        </div>
        {searchInput && !loading && (
          <span className="chat-search-count">{messages.length} pesan</span>
        )}
      </div>

      {pinnedMessage && (
        <div className="chat-pinned-banner">
          <span className="chat-pinned-icon"><Pin /></span>
          <span className="chat-pinned-text">
            <strong>Disematkan · {pinnedMessage.senderName}</strong>
            <small>{getDoctorChatMessagePreview(pinnedMessage.messageText) || (pinnedMessage.attachmentFileName ? `Lampiran: ${pinnedMessage.attachmentFileName}` : "Pesan")}</small>
          </span>
        </div>
      )}

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
            <strong>{searchRef.current ? "Pesan tidak ditemukan" : "Belum ada pesan"}</strong>
            <span>{searchRef.current ? "Coba kata kunci lain." : "Mulai percakapan dengan dokter lainnya."}</span>
          </div>
        ) : messages.map((message) => {
          const ownMessage = message.senderClinicUserId === currentUserId;
          const imageAttachment = message.attachmentContentType?.startsWith("image/");
          const sticker = getDoctorChatSticker(message.messageText);
          return (
            <article key={message.id} data-message-id={message.id} className={`chat-message-row${ownMessage ? " own" : ""}`}>
              <ChatAvatar name={message.senderName} imageUrl={message.avatarUrl} />
              <div className={`chat-message${ownMessage ? " own" : ""}${sticker && !message.attachmentFileName ? " sticker-only" : ""}`}>
                <div className="chat-message-meta">
                  <strong>{ownMessage ? "Anda" : message.senderName}</strong>
                  <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
                </div>
                {message.replyTo && !sticker && (
                  <div className="chat-reply-quote">
                    <strong>{message.replyTo.senderName}</strong>
                    <span>
                      {getDoctorChatMessagePreview(message.replyTo.messageText) ||
                        (message.replyTo.attachmentFileName
                          ? `Lampiran: ${message.replyTo.attachmentFileName}`
                          : "Pesan")}
                    </span>
                  </div>
                )}
                {sticker && !message.attachmentFileName ? (
                  <img
                    className="chat-sticker-message"
                    src={getDoctorChatStickerUrl(sticker)}
                    alt={sticker.label}
                    loading="lazy"
                    decoding="async"
                  />
                ) : message.messageText && <p>{message.messageText}</p>}
                {message.attachmentFileName && (
                  <>
                    {imageAttachment && <ChatImagePreview message={message} />}
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
                  </>
                )}
                <div className="chat-message-actions">
                  <button
                    type="button"
                    className="chat-reply-button"
                    onClick={() => {
                      setReplyTo(message);
                      document.querySelector<HTMLTextAreaElement>(".chat-compose-row textarea")?.focus();
                    }}
                    aria-label={`Balas pesan dari ${ownMessage ? "Anda" : message.senderName}`}
                    title="Balas pesan"
                  >
                    <Reply />
                    <span>Balas</span>
                  </button>
                  <button
                    type="button"
                    className="chat-reply-button"
                    onClick={() => void handlePinMessage(message)}
                    disabled={pinningId === message.id}
                    aria-label={pinnedMessage?.id === message.id ? "Lepas sematan pesan" : "Sematkan pesan"}
                    title={pinnedMessage?.id === message.id ? "Lepas sematan" : "Sematkan"}
                  >
                    {pinningId === message.id ? <LoaderCircle className="spin" /> : pinnedMessage?.id === message.id ? <PinOff /> : <Pin />}
                    <span>{pinnedMessage?.id === message.id ? "Lepas pin" : "Sematkan"}</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <form className="chat-compose" onSubmit={(event) => void handleSend(event)}>
        {replyTo && (
          <div className="chat-reply-composer">
            <span className="chat-reply-composer-icon"><Reply /></span>
            <span className="chat-reply-composer-text">
              <strong>Membalas {replyTo.senderName}</strong>
              <small>{getDoctorChatMessagePreview(replyTo.messageText) || (replyTo.attachmentFileName ? `Lampiran: ${replyTo.attachmentFileName}` : "Pesan")}</small>
            </span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Batalkan balasan"><X /></button>
          </div>
        )}
        {stickerPickerOpen && (
          <div className="chat-sticker-picker" role="group" aria-label="Pilih stiker bawaan">
            <div className="chat-sticker-picker-heading">
              <strong>Stiker dokter</strong>
              <span>Gambar bawaan · tanpa unggah ke Supabase</span>
            </div>
            <div className="chat-sticker-grid">
              {doctorChatStickers.map((sticker) => (
                <button
                  key={sticker.id}
                  type="button"
                  className="chat-sticker-option"
                  onClick={() => void handleSendSticker(sticker.id)}
                  disabled={sending || preparingFile}
                  aria-label={`Kirim stiker ${sticker.label}`}
                  title={sticker.label}
                >
                  <img src={getDoctorChatStickerUrl(sticker)} alt="" loading="lazy" decoding="async" />
                  <span>{sticker.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
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
            accept="application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFile}
            aria-label="Pilih dokumen"
          />
          <input
            ref={galleryInputRef}
            type="file"
            className="visually-hidden"
            accept="image/*"
            onChange={handleFile}
            aria-label="Pilih foto dari galeri"
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
            className={`chat-icon-button${stickerPickerOpen ? " active" : ""}`}
            onClick={() => setStickerPickerOpen((open) => !open)}
            disabled={sending || preparingFile}
            title="Pilih stiker bawaan"
            aria-label="Pilih stiker"
            aria-expanded={stickerPickerOpen}
          >
            <Smile />
          </button>
          <button
            type="button"
            className="chat-icon-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || preparingFile}
            title="Lampirkan PDF atau dokumen Word (maks. 10 MB)"
            aria-label="Lampirkan dokumen"
          >
            <Paperclip />
          </button>
          <button
            type="button"
            className="chat-icon-button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={sending || preparingFile}
            title="Pilih foto dari Galeri / Terbaru"
            aria-label="Pilih foto dari galeri"
          >
            <Images />
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
          <span>Foto dari Galeri/Kamera maks. 400 KB · PDF/Word maks. 10 MB</span>
          <span>{messageText.length}/5000</span>
        </div>
      </form>
    </section>
  );
}
