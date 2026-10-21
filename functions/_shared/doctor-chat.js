const CHAT_GROUP_SLUG = "all-doctors";
const CHAT_BUCKET = "doctor-group-chat-files";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 400_000;
const MAX_MESSAGE_LENGTH = 5000;

const ALLOWED_ATTACHMENTS = new Map([
  [".jpg", ["image/jpeg"]],
  [".jpeg", ["image/jpeg"]],
  [".png", ["image/png"]],
  [".webp", ["image/webp"]],
  [".gif", ["image/gif"]],
  [".pdf", ["application/pdf"]],
  [".doc", ["application/msword"]],
  [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]]
]);

const getSupabaseHeaders = (apiKey, accessToken, extraHeaders = {}) => ({
  apikey: apiKey,
  ...(accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : apiKey.startsWith("eyJ")
      ? { Authorization: `Bearer ${apiKey}` }
      : {}),
  Accept: "application/json",
  ...extraHeaders
});

export class ChatApiError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function getConfiguration(env) {
  const clinicUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const clinicSecret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  const clinicApiKey = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || clinicSecret;
  const chatUrl = env.CHAT_SUPABASE_URL;
  const chatSecret = env.CHAT_SUPABASE_SECRET_KEY || env.CHAT_SUPABASE_SERVICE_ROLE_KEY;

  if (!clinicUrl || !clinicSecret || !clinicApiKey || !chatUrl || !chatSecret) {
    console.error("[pages-function] Doctor chat is missing server-side project configuration.");
    throw new ChatApiError("Layanan chat belum dikonfigurasi di server.", 503);
  }

  return {
    clinicUrl: clinicUrl.replace(/\/+$/, ""),
    clinicSecret,
    clinicApiKey,
    chatUrl: chatUrl.replace(/\/+$/, ""),
    chatSecret
  };
}

async function supabaseRequest({ url, apiKey, accessToken, path, method = "GET", body, headers = {} }) {
  let response;
  try {
    response = await fetch(`${url}${path}`, {
      method,
      headers: {
        ...getSupabaseHeaders(apiKey, accessToken, headers),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    console.error("[pages-function] Doctor chat Supabase request failed:", error);
    throw new ChatApiError("Tidak dapat terhubung ke layanan chat.", 502);
  }

  if (!response.ok) {
    const responseBody = await response.json().catch(() => null);
    const message = responseBody?.message || responseBody?.msg || responseBody?.hint;
    console.error("[pages-function] Doctor chat Supabase returned HTTP", response.status);
    throw new ChatApiError(
      response.status >= 500 ? "Layanan chat sedang mengalami gangguan." : message || "Permintaan chat ditolak.",
      response.status >= 500 ? 502 : response.status
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

export async function authenticateDoctor(request, env) {
  const config = getConfiguration(env);
  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!accessToken) throw new ChatApiError("Sesi login tidak ditemukan. Silakan masuk kembali.", 401);

  let authUser;
  try {
    authUser = await supabaseRequest({
      url: config.clinicUrl,
      apiKey: config.clinicApiKey,
      accessToken,
      path: "/auth/v1/user"
    });
  } catch (error) {
    if (error instanceof ChatApiError && (error.status === 401 || error.status === 403)) {
      throw new ChatApiError("Sesi login tidak valid atau telah berakhir.", 401);
    }
    throw error;
  }

  if (!authUser?.id) throw new ChatApiError("Sesi login tidak valid.", 401);

  const accountQuery = new URLSearchParams({
    select: "id,name,role,active,doctor_id,auth_user_id",
    auth_user_id: `eq.${authUser.id}`,
    limit: "2"
  });
  const accounts = await supabaseRequest({
    url: config.clinicUrl,
    apiKey: config.clinicSecret,
    path: `/rest/v1/user_accounts?${accountQuery}`
  });

  if (!Array.isArray(accounts) || accounts.length !== 1) {
    throw new ChatApiError("Akun klinik aktif tidak ditemukan untuk sesi ini.", 403);
  }

  const account = accounts[0];
  if (account.active !== true || account.role !== "DOCTOR" || !account.doctor_id) {
    throw new ChatApiError("Menu chat grup hanya tersedia untuk akun Dokter aktif.", 403);
  }

  const doctorQuery = new URLSearchParams({
    select: "id,name,active",
    id: `eq.${account.doctor_id}`,
    limit: "2"
  });
  const doctors = await supabaseRequest({
    url: config.clinicUrl,
    apiKey: config.clinicSecret,
    path: `/rest/v1/dental_doctors?${doctorQuery}`
  });
  if (!Array.isArray(doctors) || doctors.length !== 1 || doctors[0].active !== true) {
    throw new ChatApiError("Profil dokter aktif tidak ditemukan.", 403);
  }

  const groups = await supabaseRequest({
    url: config.chatUrl,
    apiKey: config.chatSecret,
    path: `/rest/v1/chat_groups?${new URLSearchParams({
      select: "id,slug,name",
      slug: `eq.${CHAT_GROUP_SLUG}`,
      limit: "2"
    })}`
  });
  if (!Array.isArray(groups) || groups.length !== 1) {
    console.error("[pages-function] Doctor chat group is missing or duplicated.");
    throw new ChatApiError("Grup chat belum disiapkan pada database chat.", 503);
  }

  return {
    config,
    group: groups[0],
    actor: {
      clinicUserId: account.id,
      doctorId: account.doctor_id,
      name: String(doctors[0].name || account.name || "Dokter").slice(0, 150)
    }
  };
}

export async function listMessages(context) {
  const { config, group } = await authenticateDoctor(context.request, context.env);
  const requestUrl = new URL(context.request.url);
  const beforeCreatedAt = requestUrl.searchParams.get("before") || "";
  const beforeId = requestUrl.searchParams.get("beforeId") || "";
  if (beforeCreatedAt || beforeId) {
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(beforeCreatedAt) ||
      Number.isNaN(Date.parse(beforeCreatedAt)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(beforeId)
    ) {
      throw new ChatApiError("Penanda riwayat chat tidak valid.", 400);
    }
  }
  const query = new URLSearchParams({
    select: "id,group_id,sender_clinic_user_id,sender_name_snapshot,message_text,attachment_path,attachment_file_name,attachment_content_type,attachment_size_bytes,created_at",
    group_id: `eq.${group.id}`,
    order: "created_at.desc,id.desc",
    limit: "101"
  });
  if (beforeCreatedAt) {
    query.set(
      "or",
      `(created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId}))`
    );
  }
  const rows = await supabaseRequest({
    url: config.chatUrl,
    apiKey: config.chatSecret,
    path: `/rest/v1/group_chat_messages?${query}`
  });
  const page = Array.isArray(rows) ? rows : [];
  const hasMore = page.length > 100;
  if (hasMore) page.pop();

  return jsonResponse({
    group: { id: group.id, name: group.name },
    hasMore,
    messages: page.reverse().map((row) => ({
      id: row.id,
      senderClinicUserId: row.sender_clinic_user_id,
      senderName: row.sender_name_snapshot,
      messageText: row.message_text,
      attachmentFileName: row.attachment_file_name || undefined,
      attachmentContentType: row.attachment_content_type || undefined,
      attachmentSizeBytes: row.attachment_size_bytes ? Number(row.attachment_size_bytes) : undefined,
      createdAt: row.created_at
    }))
  });
}

function validateAttachment(file) {
  if (!(file instanceof File) || file.size <= 0) {
    throw new ChatApiError("Pilih file yang tidak kosong.", 400);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new ChatApiError("Ukuran lampiran maksimal 10 MB.", 413);
  }

  const fileName = file.name.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  const mimeTypes = ALLOWED_ATTACHMENTS.get(extension);
  if (!fileName || fileName.length > 180 || !mimeTypes || !mimeTypes.includes(file.type)) {
    throw new ChatApiError("Format lampiran harus JPG, PNG, WEBP, GIF, PDF, DOC, atau DOCX.", 415);
  }
  if (file.type.startsWith("image/") && file.size > MAX_IMAGE_BYTES) {
    throw new ChatApiError("Ukuran gambar maksimal 400 KB setelah dikompres.", 413);
  }

  return { fileName, contentType: file.type };
}

async function cleanupUploadedAttachment(config, objectPath) {
  try {
    const response = await fetch(
      `${config.chatUrl}/storage/v1/object/${CHAT_BUCKET}/${objectPath}`,
      {
        method: "DELETE",
        headers: getSupabaseHeaders(config.chatSecret, null)
      }
    );
    if (!response.ok) console.error("[pages-function] Failed to clean up orphaned chat attachment.");
  } catch (error) {
    console.error("[pages-function] Failed to clean up orphaned chat attachment:", error);
  }
}

export async function sendMessage(context) {
  const { request, env } = context;
  const { config, group, actor } = await authenticateDoctor(request, env);

  let form;
  try {
    form = await request.formData();
  } catch {
    throw new ChatApiError("Format pesan tidak valid.", 400);
  }

  const messageText = String(form.get("messageText") || "").trim();
  if (messageText.length > MAX_MESSAGE_LENGTH) {
    throw new ChatApiError("Pesan maksimal 5.000 karakter.", 400);
  }

  const fileEntry = form.get("file");
  const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
  if (!messageText && !file) throw new ChatApiError("Isi pesan atau lampiran wajib diisi.", 400);

  let attachment;
  if (file) {
    const { fileName, contentType } = validateAttachment(file);
    const objectPath = `${group.id}/${actor.clinicUserId}/${crypto.randomUUID()}`;
    let uploadResponse;
    try {
      uploadResponse = await fetch(
        `${config.chatUrl}/storage/v1/object/${CHAT_BUCKET}/${objectPath}`,
        {
          method: "POST",
          headers: {
            ...getSupabaseHeaders(config.chatSecret, null),
            "Content-Type": contentType,
            "x-upsert": "false"
          },
          body: await file.arrayBuffer()
        }
      );
    } catch (error) {
      console.error("[pages-function] Doctor chat attachment upload failed:", error);
      throw new ChatApiError("Gagal mengunggah lampiran ke penyimpanan chat.", 502);
    }

    if (!uploadResponse.ok) {
      console.error("[pages-function] Doctor chat storage returned HTTP", uploadResponse.status);
      throw new ChatApiError("Gagal mengunggah lampiran.", 502);
    }
    attachment = { objectPath, fileName, contentType, sizeBytes: file.size };
  }

  const insertQuery = new URLSearchParams({
    select: "id,sender_clinic_user_id,sender_name_snapshot,message_text,attachment_file_name,attachment_content_type,attachment_size_bytes,created_at"
  });
  let inserted;
  try {
    inserted = await supabaseRequest({
      url: config.chatUrl,
      apiKey: config.chatSecret,
      path: `/rest/v1/group_chat_messages?${insertQuery}`,
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: {
        group_id: group.id,
        sender_clinic_user_id: actor.clinicUserId,
        sender_name_snapshot: actor.name,
        message_text: messageText,
        attachment_path: attachment?.objectPath || null,
        attachment_file_name: attachment?.fileName || null,
        attachment_content_type: attachment?.contentType || null,
        attachment_size_bytes: attachment?.sizeBytes || null
      }
    });
  } catch (error) {
    if (attachment) await cleanupUploadedAttachment(config, attachment.objectPath);
    throw error;
  }

  const row = Array.isArray(inserted) ? inserted[0] : null;
  if (!row) {
    if (attachment) await cleanupUploadedAttachment(config, attachment.objectPath);
    throw new ChatApiError("Pesan tersimpan tetapi respons server tidak valid.", 502);
  }

  return jsonResponse({
    message: {
      id: row.id,
      senderClinicUserId: row.sender_clinic_user_id,
      senderName: row.sender_name_snapshot,
      messageText: row.message_text,
      attachmentFileName: row.attachment_file_name || undefined,
      attachmentContentType: row.attachment_content_type || undefined,
      attachmentSizeBytes: row.attachment_size_bytes ? Number(row.attachment_size_bytes) : undefined,
      createdAt: row.created_at
    }
  }, 201);
}

export async function downloadAttachment(context) {
  const { request, env, params } = context;
  const { config, group } = await authenticateDoctor(request, env);
  const messageId = String(params?.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    throw new ChatApiError("ID pesan tidak valid.", 400);
  }

  const query = new URLSearchParams({
    select: "attachment_path,attachment_file_name,attachment_content_type",
    id: `eq.${messageId}`,
    group_id: `eq.${group.id}`,
    limit: "1"
  });
  const rows = await supabaseRequest({
    url: config.chatUrl,
    apiKey: config.chatSecret,
    path: `/rest/v1/group_chat_messages?${query}`
  });
  const message = Array.isArray(rows) ? rows[0] : null;
  if (!message?.attachment_path) throw new ChatApiError("Lampiran tidak ditemukan.", 404);

  let response;
  try {
    response = await fetch(
      `${config.chatUrl}/storage/v1/object/${CHAT_BUCKET}/${message.attachment_path}`,
      {
        headers: {
          ...getSupabaseHeaders(config.chatSecret, null)
        }
      }
    );
  } catch (error) {
    console.error("[pages-function] Doctor chat attachment download failed:", error);
    throw new ChatApiError("Gagal mengunduh lampiran.", 502);
  }
  if (!response.ok) throw new ChatApiError("Gagal mengunduh lampiran dari penyimpanan chat.", 502);

  const safeName = String(message.attachment_file_name || "lampiran")
    .replace(/[\r\n"]/g, "_")
    .slice(0, 180);
  const headers = new Headers({
    "Content-Type": message.attachment_content_type || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeName}"`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, no-store"
  });
  const contentLength = response.headers.get("Content-Length");
  if (contentLength) headers.set("Content-Length", contentLength);
  return new Response(response.body, { status: 200, headers });
}

export function handleChatError(error) {
  if (error instanceof ChatApiError) return jsonResponse({ message: error.message }, error.status);
  console.error("[pages-function] Unexpected doctor chat error:", error);
  return jsonResponse({ message: "Terjadi kesalahan saat memproses chat." }, 500);
}
