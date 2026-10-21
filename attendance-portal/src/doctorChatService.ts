import { createClient, RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../../src/lib/supabase";

export interface DoctorChatMessage {
  id: string;
  senderClinicUserId: string;
  senderName: string;
  messageText: string;
  attachmentFileName?: string;
  attachmentContentType?: string;
  attachmentSizeBytes?: number;
  createdAt: string;
}

export interface DoctorChatPage {
  group: { id: string; name: string };
  messages: DoctorChatMessage[];
  hasMore: boolean;
}

export type DoctorChatRealtimeStatus = "connecting" | "connected" | "disconnected" | "configuration_error";

const chatRealtimeTopic = "doctor-group-chat";

export function subscribeToDoctorChat(
  onNewMessage: () => void,
  onStatusChange: (status: DoctorChatRealtimeStatus) => void
): () => void {
  const chatUrl = import.meta.env.VITE_CHAT_SUPABASE_URL;
  const chatAnonKey = import.meta.env.VITE_CHAT_SUPABASE_ANON_KEY;
  if (!chatUrl || !chatAnonKey) {
    onStatusChange("configuration_error");
    return () => {};
  }

  const chatClient = createClient(chatUrl, chatAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
  const channel: RealtimeChannel = chatClient
    .channel(chatRealtimeTopic)
    .on("broadcast", { event: "new_message" }, onNewMessage)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") onStatusChange("connected");
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onStatusChange("disconnected");
      } else {
        onStatusChange("connecting");
      }
    });

  return () => {
    void chatClient.removeChannel(channel);
  };
}

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(`Gagal memeriksa sesi login: ${error.message}`);
  if (!data.session?.access_token) throw new Error("Sesi login berakhir. Silakan masuk kembali.");
  return data.session.access_token;
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(path, { ...init, headers, cache: "no-store" });
  if (!response.ok) {
    let message = `Permintaan chat gagal (${response.status}).`;
    try {
      const result = await response.json();
      if (typeof result?.message === "string") message = result.message;
    } catch {
      console.error("Respons kesalahan API chat bukan JSON.");
    }
    throw new Error(message);
  }
  return response;
}

export async function getDoctorChatMessages(beforeMessage?: DoctorChatMessage): Promise<DoctorChatPage> {
  const query = beforeMessage
    ? `?${new URLSearchParams({ before: beforeMessage.createdAt, beforeId: beforeMessage.id })}`
    : "";
  const response = await authorizedFetch(`/api/chat/messages${query}`);
  const result = await response.json();
  if (!result?.group || !Array.isArray(result.messages) || typeof result.hasMore !== "boolean") {
    throw new Error("Respons daftar pesan chat tidak valid.");
  }
  return result as DoctorChatPage;
}

export async function sendDoctorChatMessage(messageText: string, file?: File | null): Promise<DoctorChatMessage> {
  const body = new FormData();
  body.set("messageText", messageText);
  if (file) body.set("file", file);
  const response = await authorizedFetch("/api/chat/messages", { method: "POST", body });
  const result = await response.json();
  if (!result?.message?.id) throw new Error("Respons pesan chat tidak valid.");
  return result.message as DoctorChatMessage;
}

export async function downloadDoctorChatAttachment(messageId: string): Promise<Blob> {
  const response = await authorizedFetch(`/api/chat/files/${encodeURIComponent(messageId)}`);
  return response.blob();
}
