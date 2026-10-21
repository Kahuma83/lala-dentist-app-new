const CHAT_GROUP_SLUG = "all-doctors";
const CHAT_BUCKET = "doctor-group-chat-files";
const STAFF_PHOTO_BUCKET = "staff-profile-photos";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BYTES = 400_000;
const MAX_MESSAGE_LENGTH = 5000;
const MAX_SEARCH_LENGTH = 100;

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
    select: "id,name,role,active,doctor_id,staff_id,auth_user_id",
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
    select: "id,name,active,staff_id,avatar_url",
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
      select: "id,slug,name,subtitle",
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
      staffId: account.staff_id || doctors[0].staff_id || null,
      avatarUrl: doctors[0].avatar_url || null,
      name: String(doctors[0].name || account.name || "Dokter").slice(0, 150)
    }
  };
}

export async function updateGroupSubtitle({ request, env }) {
  const { config, group } = await authenticateDoctor(request, env);
  let body;
  try {
    body = await request.json();
  } catch {
    throw new ChatApiError("Isi subjudul tidak valid.", 400);
  }

  if (typeof body?.subtitle !== "string") {
    throw new ChatApiError("Subjudul wajib berupa teks.", 400);
  }
  const subtitle = body.subtitle.trim();
  if (subtitle.length > 120) {
    throw new ChatApiError("Subjudul maksimal 120 karakter.", 400);
  }

  const rows = await supabaseRequest({
    url: config.chatUrl,
    apiKey: config.chatSecret,
    path: `/rest/v1/chat_groups?${new URLSearchParams({
      id: `eq.${group.id}`,
      select: "subtitle"
    })}`,
    method: "PATCH",
    body: { subtitle },
    headers: { Prefer: "return=representation" }
  });
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new ChatApiError("Subjudul grup chat gagal disimpan.", 500);
  }
  return jsonResponse({ subtitle: rows[0].subtitle });
}

async function createStaffPhotoUrls(config, paths) {
  const uniquePaths = Array.from(new Set(paths.filter((path) =>
    typeof path === "string" &&
    path.startsWith("staff-profile/") &&
    !path.includes("..") &&
    path.length <= 500
  )));
  if (!uniquePaths.length) return new Map();

  const signedRows = await supabaseRequest({
    url: config.clinicUrl,
    apiKey: config.clinicSecret,
    path: `/storage/v1/object/sign/${STAFF_PHOTO_BUCKET}`,
    method: "POST",
    body: { expiresIn: 3600, paths: uniquePaths }
  });
  const urls = new Map();
  if (!Array.isArray(signedRows)) return urls;
  for (const row of signedRows) {
    if (!row?.path || !row?.signedURL) continue;
    const signedUrl = String(row.signedURL);
    urls.set(row.path, signedUrl.startsWith("/") ? `${config.clinicUrl}${signedUrl}` : signedUrl);
  }
  return urls;
}

async function getSenderAvatars(config, senderClinicUserIds) {
  const userIds = Array.from(new Set(senderClinicUserIds.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "")
  )));
  if (!userIds.length) return new Map();

  const accounts = await supabaseRequest({
    url: config.clinicUrl,
    apiKey: config.clinicSecret,
    path: `/rest/v1/user_accounts?${new URLSearchParams({
      select: "id,doctor_id,staff_id",
      id: `in.(${userIds.join(",")})`
    })}`
  });
  const accountRows = Array.isArray(accounts) ? accounts : [];
  const doctorIds = Array.from(new Set(accountRows.map((account) => account.doctor_id).filter(Boolean)));
  const doctors = doctorIds.length
    ? await supabaseRequest({
        url: config.clinicUrl,
        apiKey: config.clinicSecret,
        path: `/rest/v1/dental_doctors?${new URLSearchParams({
          select: "id,staff_id,avatar_url",
          id: `in.(${doctorIds.join(",")})`
        })}`
      })
    : [];
  const doctorRows = Array.isArray(doctors) ? doctors : [];
  const staffIds = Array.from(new Set([
    ...accountRows.map((account) => account.staff_id),
    ...doctorRows.map((doctor) => doctor.staff_id)
  ].filter(Boolean)));
  const staffFilters = [
    staffIds.length ? `id.in.(${staffIds.join(",")})` : "",
    userIds.length ? `user_account_id.in.(${userIds.join(",")})` : ""
  ].filter(Boolean);
  const staff = staffFilters.length
    ? await supabaseRequest({
        url: config.clinicUrl,
        apiKey: config.clinicSecret,
        path: `/rest/v1/staff?${new URLSearchParams({
          select: "id,user_account_id,profile_photo_path",
          or: `(${staffFilters.join(",")})`
        })}`
      })
    : [];
  const staffRows = Array.isArray(staff) ? staff : [];
  const doctorById = new Map(doctorRows.map((doctor) => [doctor.id, doctor]));
  const staffById = new Map(staffRows.map((row) => [row.id, row]));
  const staffByAccountId = new Map(staffRows
    .filter((row) => row.user_account_id)
    .map((row) => [row.user_account_id, row]));
  const staffBySenderAccount = new Map(accountRows.map((account) => {
    const doctorStaffId = doctorById.get(account.doctor_id)?.staff_id;
    const candidates = [
      staffByAccountId.get(account.id),
      staffById.get(account.staff_id),
      staffById.get(doctorStaffId)
    ].filter(Boolean);
    return [account.id, candidates.find((row) => row.profile_photo_path) || candidates[0]];
  }));
  const photoPaths = accountRows.map((account) =>
    staffBySenderAccount.get(account.id)?.profile_photo_path
  );
  const signedPhotoUrls = await createStaffPhotoUrls(config, photoPaths);
  const avatars = new Map();
  for (const account of accountRows) {
    const doctor = doctorById.get(account.doctor_id);
    const photoPath = staffBySenderAccount.get(account.id)?.profile_photo_path;
    const publicAvatar = doctor?.avatar_url;
    const safePublicAvatar = typeof publicAvatar === "string" &&
      publicAvatar.length <= 2048 &&
      publicAvatar.startsWith("https://")
      ? publicAvatar
      : null;
    avatars.set(
      account.id,
      (photoPath && signedPhotoUrls.get(photoPath)) || safePublicAvatar
    );
  }
  return avatars;
}

export async function listMessages(context) {
  const { config, group } = await authenticateDoctor(context.request, context.env);
  const requestUrl = new URL(context.request.url);
  const searchTerm = (requestUrl.searchParams.get("search") || "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEARCH_LENGTH);
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
    select: "id,group_id,sender_clinic_user_id,sender_name_snapshot,message_text,reply_to_message_id,reply_to:group_chat_messages!reply_to_message_id(id,sender_name_snapshot,message_text,attachment_file_name,attachment_content_type),attachment_path,attachment_file_name,attachment_content_type,attachment_size_bytes,pinned_at,created_at",
    group_id: `eq.${group.id}`,
    order: "created_at.desc,id.desc",
    limit: "101"
  });
  const disjunctions = [];
  if (beforeCreatedAt) {
    disjunctions.push(`(created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId}))`);
  }
  if (searchTerm) {
    const pattern = `*${searchTerm}*`;
    disjunctions.push(`(message_text.ilike.${pattern},sender_name_snapshot.ilike.${pattern},attachment_file_name.ilike.${pattern})`);
  }
  if (disjunctions.length === 1) query.set("or", disjunctions[0]);
  if (disjunctions.length > 1) query.set("and", `(${disjunctions.join(",")})`);
  const rows = await supabaseRequest({
    url: config.chatUrl,
    apiKey: config.chatSecret,
    path: `/rest/v1/group_chat_messages?${query}`
  });
  const page = Array.isArray(rows) ? rows : [];
  const hasMore = page.length > 100;
  if (hasMore) page.pop();
  const pinnedRows = searchTerm
    ? []
    : await supabaseRequest({
        url: config.chatUrl,
        apiKey: config.chatSecret,
        path: `/rest/v1/group_chat_messages?${new URLSearchParams({
          select: "id,sender_clinic_user_id,sender_name_snapshot,message_text,attachment_file_name,attachment_content_type,created_at,pinned_at",
          group_id: `eq.${group.id}`,
          pinned_at: "not.is.null",
          limit: "1"
        })}`
      });
  const pinnedMessage = Array.isArray(pinnedRows) ? pinnedRows[0] : null;
  const avatars = await getSenderAvatars(config, [
    ...page.map((row) => row.sender_clinic_user_id),
    ...(pinnedMessage ? [pinnedMessage.sender_clinic_user_id] : [])
  ]);

  return jsonResponse({
    group: { id: group.id, name: group.name, subtitle: group.subtitle || "" },
    hasMore,
    pinnedMessage: pinnedMessage ? {
      id: pinnedMessage.id,
      senderClinicUserId: pinnedMessage.sender_clinic_user_id,
      senderName: pinnedMessage.sender_name_snapshot,
      messageText: pinnedMessage.message_text,
      attachmentFileName: pinnedMessage.attachment_file_name || undefined,
      attachmentContentType: pinnedMessage.attachment_content_type || undefined,
      createdAt: pinnedMessage.created_at,
      pinnedAt: pinnedMessage.pinned_at,
      avatarUrl: avatars.get(pinnedMessage.sender_clinic_user_id) || undefined
    } : null,
    searchTerm: searchTerm || undefined,
    messages: page.reverse().map((row) => ({
      id: row.id,
      senderClinicUserId: row.sender_clinic_user_id,
      senderName: row.sender_name_snapshot,
      avatarUrl: avatars.get(row.sender_clinic_user_id) || undefined,
      messageText: row.message_text,
      replyToMessageId: row.reply_to_message_id || undefined,
      replyTo: row.reply_to ? {
        id: row.reply_to.id,
        senderName: row.reply_to.sender_name_snapshot,
        messageText: row.reply_to.message_text,
        attachmentFileName: row.reply_to.attachment_file_name || undefined,
        attachmentContentType: row.reply_to.attachment_content_type || undefined
      } : undefined,
      attachmentFileName: row.attachment_file_name || undefined,
      attachmentContentType: row.attachment_content_type || undefined,
      attachmentSizeBytes: row.attachment_size_bytes ? Number(row.attachment_size_bytes) : undefined,
      pinnedAt: row.pinned_at || undefined,
      createdAt: row.created_at
    }))
  });
}

export async function setPinnedMessage(context) {
  const { config, group } = await authenticateDoctor(context.request, context.env);
  const messageId = String(context.params?.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    throw new ChatApiError("ID pesan tidak valid.", 400);
  }
  const pinMessageId = context.request.method === "DELETE" ? null : messageId;
  await supabaseRequest({
    url: config.chatUrl,
    apiKey: config.chatSecret,
    path: "/rest/v1/rpc/set_pinned_doctor_chat_message",
    method: "POST",
    body: {
      p_group_id: group.id,
      p_message_id: pinMessageId,
      p_expected_message_id: context.request.method === "DELETE" ? messageId : null
    }
  });
  return jsonResponse({ pinnedMessageId: pinMessageId });
}

export async function deleteMessage(context) {
  const { request, env, params } = context;
  const { config, group, actor } = await authenticateDoctor(request, env);
  const messageId = String(params?.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(messageId)) {
    throw new ChatApiError("ID pesan tidak valid.", 400);
  }

  const messageQuery = new URLSearchParams({
    select: "id,attachment_path",
    id: `eq.${messageId}`,
    group_id: `eq.${group.id}`,
    sender_clinic_user_id: `eq.${actor.clinicUserId}`,
    limit: "1"
  });
  const messages = await supabaseRequest({
    url: config.chatUrl,
    apiKey: config.chatSecret,
    path: `/rest/v1/group_chat_messages?${messageQuery}`
  });
  const message = Array.isArray(messages) ? messages[0] : null;
  if (!message) throw new ChatApiError("Pesan tidak ditemukan atau bukan milik Anda.", 404);

  const deleteQuery = new URLSearchParams({
    id: `eq.${messageId}`,
    group_id: `eq.${group.id}`,
    sender_clinic_user_id: `eq.${actor.clinicUserId}`
  });
  const deletedMessages = await supabaseRequest({
    url: config.chatUrl,
    apiKey: config.chatSecret,
    path: `/rest/v1/group_chat_messages?${deleteQuery}`,
    method: "DELETE",
    headers: { Prefer: "return=representation" }
  });
  if (!Array.isArray(deletedMessages) || deletedMessages.length !== 1) {
    throw new ChatApiError("Pesan tidak ditemukan atau sudah dihapus.", 404);
  }

  let attachmentDeleted = true;
  if (message.attachment_path) {
    try {
      const response = await fetch(
        `${config.chatUrl}/storage/v1/object/${CHAT_BUCKET}/${message.attachment_path}`,
        {
          method: "DELETE",
          headers: getSupabaseHeaders(config.chatSecret, null)
        }
      );
      attachmentDeleted = response.ok;
      if (!response.ok) {
        console.error("[pages-function] Failed to delete doctor chat attachment. HTTP", response.status);
      }
    } catch (error) {
      attachmentDeleted = false;
      console.error("[pages-function] Failed to delete doctor chat attachment:", error);
    }
  }

  return jsonResponse({
    deleted: true,
    attachmentDeleted,
    ...(attachmentDeleted ? {} : {
      warning: "Pesan terhapus, tetapi lampirannya gagal dihapus dari penyimpanan."
    })
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
  const replyToMessageId = String(form.get("replyToMessageId") || "").trim();
  if (!messageText && !file) throw new ChatApiError("Isi pesan atau lampiran wajib diisi.", 400);
  if (replyToMessageId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(replyToMessageId)) {
    throw new ChatApiError("Pesan yang dibalas tidak valid.", 400);
  }

  if (replyToMessageId) {
    const replyQuery = new URLSearchParams({
      select: "id",
      id: `eq.${replyToMessageId}`,
      group_id: `eq.${group.id}`,
      limit: "1"
    });
    const replyRows = await supabaseRequest({
      url: config.chatUrl,
      apiKey: config.chatSecret,
      path: `/rest/v1/group_chat_messages?${replyQuery}`
    });
    if (!Array.isArray(replyRows) || replyRows.length !== 1) {
      throw new ChatApiError("Pesan yang akan dibalas tidak ditemukan di grup ini.", 404);
    }
  }

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
    select: "id,sender_clinic_user_id,sender_name_snapshot,message_text,reply_to_message_id,reply_to:group_chat_messages!reply_to_message_id(id,sender_name_snapshot,message_text,attachment_file_name,attachment_content_type),attachment_file_name,attachment_content_type,attachment_size_bytes,created_at"
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
        reply_to_message_id: replyToMessageId || null,
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
      replyToMessageId: row.reply_to_message_id || undefined,
      replyTo: row.reply_to ? {
        id: row.reply_to.id,
        senderName: row.reply_to.sender_name_snapshot,
        messageText: row.reply_to.message_text,
        attachmentFileName: row.reply_to.attachment_file_name || undefined,
        attachmentContentType: row.reply_to.attachment_content_type || undefined
      } : undefined,
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
