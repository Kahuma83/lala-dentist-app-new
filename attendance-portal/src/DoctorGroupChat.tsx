import { FormEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Bell, BellOff, Camera, Check, Download, FileText, Image, Images, LoaderCircle, MessageCircle, Paperclip, Pin, PinOff, Plus, Reply, Search, Send, Smile, Trash2, X } from "lucide-react";
import {
  doctorChatStickers,
  getDoctorChatMessagePreview,
  getDoctorChatSticker,
  getDoctorChatStickerUrl
} from "./doctorChatStickers";
import {
  DoctorChatMessage,
  DoctorChatRealtimeStatus,
  deleteDoctorChatMessage,
  disableDoctorChatPushNotifications,
  downloadDoctorChatAttachment,
  enableDoctorChatPushNotifications,
  getDoctorChatPushSubscription,
  getDoctorChatMessages,
  setDoctorChatMessagePinned,
  sendDoctorChatMessage,
  subscribeToDoctorChat,
  updateDoctorChatGroupSubtitle
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
  const [groupSubtitle, setGroupSubtitle] = useState("Percakapan bersama dokter · pesan diterima langsung");
  const [editingGroupSubtitle, setEditingGroupSubtitle] = useState(false);
  const [groupSubtitleDraft, setGroupSubtitleDraft] = useState("");
  const [savingGroupSubtitle, setSavingGroupSubtitle] = useState(false);
  const [pinnedMessage, setPinnedMessage] = useState<DoctorChatMessage | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState<DoctorChatMessage | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [preparingFile, setPreparingFile] = useState(false);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [realtimeStatus, setRealtimeStatus] = useState<DoctorChatRealtimeStatus>("connecting");
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStateReady, setPushStateReady] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(false);
  const searchRef = useRef("");
  const searchInitializedRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const scrollToBottomRef = useRef(true);
  const restoreScrollRef = useRef<{ height: number; top: number } | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const subtitleLongPressTimerRef = useRef<number | null>(null);
  const subtitlePointerTypeRef = useRef("");

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearSubtitleLongPressTimer = () => {
    if (subtitleLongPressTimerRef.current !== null) {
      window.clearTimeout(subtitleLongPressTimerRef.current);
      subtitleLongPressTimerRef.current = null;
    }
  };

  const startGroupSubtitleEditing = () => {
    clearSubtitleLongPressTimer();
    setGroupSubtitleDraft(groupSubtitle);
    setEditingGroupSubtitle(true);
  };

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
      setGroupSubtitle(page.group.subtitle || "");
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
    void getDoctorChatPushSubscription()
      .then((subscription) => {
        if (mountedRef.current) setPushEnabled(Boolean(subscription));
      })
      .catch((pushError) => {
        if (mountedRef.current) {
          setError(pushError instanceof Error ? pushError.message : "Gagal memeriksa status notifikasi.");
        }
      })
      .finally(() => {
        if (mountedRef.current) setPushStateReady(true);
      });
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
            setError("Server chat belum dikonfigurasi. Silakan hubungi administrator.");
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
      clearLongPressTimer();
      clearSubtitleLongPressTimer();
      unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [loadMessages]);

  const handleTogglePushNotifications = async () => {
    setPushBusy(true);
    setError(null);
    try {
      if (pushEnabled) {
        await disableDoctorChatPushNotifications();
        setPushEnabled(false);
      } else {
        await enableDoctorChatPushNotifications();
        setPushEnabled(true);
      }
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : "Gagal mengubah pengaturan notifikasi.");
    } finally {
      setPushBusy(false);
    }
  };

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
      setSelectedMessageId(null);
    } catch (pinError) {
      setError(pinError instanceof Error ? pinError.message : "Gagal mengubah pesan yang disematkan.");
    } finally {
      setPinningId(null);
    }
  };

  const handleDeleteMessage = async (message: DoctorChatMessage) => {
    setSelectedMessageId(null);
    if (!window.confirm("Hapus pesan ini untuk semua anggota grup? Pesan yang dihapus tidak dapat dipulihkan.")) return;

    setDeletingId(message.id);
    setError(null);
    try {
      const result = await deleteDoctorChatMessage(message.id);
      setMessages((previous) => previous.filter((item) => item.id !== message.id));
      if (pinnedMessage?.id === message.id) setPinnedMessage(null);
      if (replyTo?.id === message.id) setReplyTo(null);
      if (!result.attachmentDeleted) {
        setError(result.warning || "Pesan terhapus, tetapi lampirannya gagal dihapus dari penyimpanan.");
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Gagal menghapus pesan.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveGroupSubtitle = async (event: FormEvent) => {
    event.preventDefault();
    setSavingGroupSubtitle(true);
    setError(null);
    try {
      const subtitle = await updateDoctorChatGroupSubtitle(groupSubtitleDraft);
      setGroupSubtitle(subtitle);
      setEditingGroupSubtitle(false);
    } catch (subtitleError) {
      setError(subtitleError instanceof Error ? subtitleError.message : "Gagal menyimpan subjudul grup.");
    } finally {
      setSavingGroupSubtitle(false);
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
      setAttachmentMenuOpen(false);
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

  const selectedMessage = messages.find((message) => message.id === selectedMessageId);
  const selectedMessageIsOwn = selectedMessage?.senderClinicUserId === currentUserId;
  const selectedMessageIsPinned = selectedMessage ? pinnedMessage?.id === selectedMessage.id : false;

  return (
    <section className="chat-panel" aria-label="Chat grup dokter">
      <header className="chat-header">
        <button type="button" className="chat-back-button" onClick={onBack} aria-label="Kembali ke portal">
          <ArrowLeft />
        </button>
        <span className="chat-title-icon"><MessageCircle /></span>
        <div className="chat-title">
          <strong>{groupName}</strong>
          {editingGroupSubtitle ? (
            <form className="chat-subtitle-editor" onSubmit={(event) => void handleSaveGroupSubtitle(event)}>
              <input
                autoFocus
                value={groupSubtitleDraft}
                onChange={(event) => setGroupSubtitleDraft(event.target.value)}
                maxLength={120}
                aria-label="Subjudul grup chat"
                placeholder="Tulis subjudul grup"
              />
              <button type="submit" disabled={savingGroupSubtitle} aria-label="Simpan subjudul">
                {savingGroupSubtitle ? <LoaderCircle className="spin" /> : <Check />}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearSubtitleLongPressTimer();
                  setEditingGroupSubtitle(false);
                }}
                disabled={savingGroupSubtitle}
                aria-label="Batalkan perubahan subjudul"
              >
                <X />
              </button>
            </form>
          ) : (
            <button
              type="button"
              className="chat-subtitle-line"
              onPointerDown={(event) => {
                subtitlePointerTypeRef.current = event.pointerType;
                if (event.pointerType === "mouse") return;
                clearSubtitleLongPressTimer();
                subtitleLongPressTimerRef.current = window.setTimeout(startGroupSubtitleEditing, 550);
              }}
              onPointerUp={clearSubtitleLongPressTimer}
              onPointerLeave={clearSubtitleLongPressTimer}
              onPointerCancel={clearSubtitleLongPressTimer}
              onContextMenu={(event) => {
                event.preventDefault();
                startGroupSubtitleEditing();
              }}
              onClick={(event) => {
                if (subtitlePointerTypeRef.current === "mouse" || event.detail === 0) {
                  startGroupSubtitleEditing();
                }
              }}
              aria-label="Tahan subjudul untuk mengeditnya bagi semua dokter"
              title="Tahan lama untuk mengedit subjudul grup"
            >
              <span>{groupSubtitle || " "}</span>
            </button>
          )}
        </div>
        <span className={`chat-online${isOnline && realtimeStatus === "connected" ? " online" : ""}`}>
          {!isOnline ? "Offline" : realtimeStatus === "connected" ? "Realtime" : realtimeStatus === "connecting" ? "Menghubungkan" : "Terputus"}
        </span>
        <button
          type="button"
          className="chat-notification-button"
          onClick={() => void handleTogglePushNotifications()}
          disabled={pushBusy || !pushStateReady}
          title={pushEnabled ? "Matikan notifikasi pesan" : "Aktifkan notifikasi saat aplikasi ditutup"}
          aria-label={pushEnabled ? "Matikan notifikasi pesan" : "Aktifkan notifikasi pesan"}
        >
          {pushBusy
            ? <LoaderCircle className="spin" />
            : pushEnabled ? <Bell /> : <BellOff />}
        </button>
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

      {selectedMessage && (
        <div className="chat-selection-toolbar" role="toolbar" aria-label="Aksi pesan terpilih">
          <span className="chat-selection-summary">Pesan dipilih</span>
          <button
            type="button"
            onClick={() => {
              setReplyTo(selectedMessage);
              setSelectedMessageId(null);
              document.querySelector<HTMLTextAreaElement>(".chat-compose-row textarea")?.focus();
            }}
            aria-label="Balas pesan"
          >
            <Reply />
            <span>Balas</span>
          </button>
          <button
            type="button"
            onClick={() => void handlePinMessage(selectedMessage)}
            disabled={pinningId === selectedMessage.id}
            aria-label={selectedMessageIsPinned ? "Lepas sematan pesan" : "Sematkan pesan"}
          >
            {pinningId === selectedMessage.id ? <LoaderCircle className="spin" /> : selectedMessageIsPinned ? <PinOff /> : <Pin />}
            <span>{selectedMessageIsPinned ? "Lepas sematan" : "Sematkan"}</span>
          </button>
          {selectedMessageIsOwn && (
            <button
              type="button"
              className="chat-selection-delete"
              onClick={() => void handleDeleteMessage(selectedMessage)}
              disabled={deletingId === selectedMessage.id}
              aria-label="Hapus pesan"
            >
              {deletingId === selectedMessage.id ? <LoaderCircle className="spin" /> : <Trash2 />}
              <span>Hapus</span>
            </button>
          )}
          <button
            type="button"
            className="chat-selection-close"
            onClick={() => setSelectedMessageId(null)}
            aria-label="Tutup aksi pesan"
          >
            <X />
          </button>
        </div>
      )}

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
          const replyPreview = message.replyTo
            ? getDoctorChatMessagePreview(message.replyTo.messageText) ||
              (message.replyTo.attachmentFileName ? `Lampiran: ${message.replyTo.attachmentFileName}` : "")
            : "";
          return (
            <article
              key={message.id}
              data-message-id={message.id}
              className={`chat-message-row${ownMessage ? " own" : ""}${selectedMessageId === message.id ? " selected" : ""}`}
              onPointerDown={(event) => {
                if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
                clearLongPressTimer();
                longPressTimerRef.current = window.setTimeout(() => {
                  setSelectedMessageId(message.id);
                  longPressTimerRef.current = null;
                }, 550);
              }}
              onPointerUp={clearLongPressTimer}
              onPointerLeave={clearLongPressTimer}
              onPointerCancel={clearLongPressTimer}
              onClick={(event) => {
                if (event.target instanceof HTMLElement && event.target.closest("button")) return;
                setSelectedMessageId(message.id);
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedMessageId(message.id);
                }
              }}
              tabIndex={0}
              aria-label={`Pesan dari ${ownMessage ? "Anda" : message.senderName}. Ketuk untuk memilih aksi.`}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelectedMessageId(message.id);
              }}
            >
              <ChatAvatar name={message.senderName} imageUrl={message.avatarUrl} />
              <div className={`chat-message${ownMessage ? " own" : ""}${sticker && !message.attachmentFileName ? " sticker-only" : ""}`}>
                <div className="chat-message-meta">
                  <strong>{ownMessage ? "Anda" : message.senderName}</strong>
                </div>
                {message.replyTo && !sticker && replyPreview && (
                  <div className="chat-reply-quote">
                    <strong>{message.replyTo.senderName}</strong>
                    <span>{replyPreview}</span>
                  </div>
                )}
                {sticker && !message.attachmentFileName ? (
                  <img
                    className="chat-sticker-message"
                    src={getDoctorChatStickerUrl(sticker)}
                    alt={sticker.label}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    onContextMenu={(event) => event.preventDefault()}
                    onDragStart={(event) => event.preventDefault()}
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
                <time className="chat-message-time" dateTime={message.createdAt}>
                  {formatMessageTime(message.createdAt)}
                </time>
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
        {attachmentMenuOpen && (
          <div className="chat-attachment-menu" role="group" aria-label="Tambah ke chat">
            <button
              type="button"
              onClick={() => {
                setAttachmentMenuOpen(false);
                setStickerPickerOpen((open) => !open);
              }}
            >
              <Smile /> Stiker
            </button>
            <button
              type="button"
              onClick={() => {
                setAttachmentMenuOpen(false);
                fileInputRef.current?.click();
              }}
            >
              <Images /> Gambar atau dokumen
            </button>
            <button
              type="button"
              onClick={() => {
                setAttachmentMenuOpen(false);
                cameraInputRef.current?.click();
              }}
            >
              <Camera /> Ambil foto
            </button>
          </div>
        )}
        {stickerPickerOpen && (
          <div className="chat-sticker-picker" role="group" aria-label="Pilih stiker bawaan">
            <div className="chat-sticker-picker-heading">
              <strong>Stiker dokter</strong>
              <span>Gambar bawaan yang tersedia di aplikasi</span>
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
            accept="image/*,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={handleFile}
            aria-label="Pilih gambar atau dokumen"
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
          <button
            type="button"
            className={`chat-icon-button${attachmentMenuOpen || stickerPickerOpen ? " active" : ""}`}
            onClick={() => {
              setAttachmentMenuOpen((open) => !open);
              setStickerPickerOpen(false);
            }}
            disabled={sending || preparingFile}
            title="Tambah stiker, gambar, atau dokumen"
            aria-label="Tambah ke chat"
            aria-expanded={attachmentMenuOpen || stickerPickerOpen}
          >
            <Plus />
          </button>
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
