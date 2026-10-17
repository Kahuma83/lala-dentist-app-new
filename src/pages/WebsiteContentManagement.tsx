import React, { useEffect, useState } from "react";
import {
  CalendarClock,
  ImagePlus,
  LoaderCircle,
  Newspaper,
  PanelsTopLeft,
  Pencil,
  Save,
  Trash2,
  X
} from "lucide-react";
import { supabase } from "../lib/supabase";

type ContentStatus = "draft" | "published";
type ContentTab = "hero" | "promotions" | "articles";

interface WebsiteSettings {
  id: string;
  hero_title: string;
  hero_description: string;
  hero_image_url: string | null;
  hero_button_text: string;
  hero_button_url: string;
}

interface WebsitePromotion {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  status: ContentStatus;
  starts_at: string;
  ends_at: string | null;
}

interface WebsiteArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  category: string;
  cover_image_url: string | null;
  status: ContentStatus;
  published_at: string | null;
}

interface ContentPreview {
  title: string;
  description: string;
  imageUrl: string;
  category: string;
  isArticle: boolean;
}

const defaultSettings: WebsiteSettings = {
  id: "main",
  hero_title: "Urus kunjungan, lebih mudah dari HP.",
  hero_description: "",
  hero_image_url: "",
  hero_button_text: "Unduh aplikasi",
  hero_button_url: "https://pasien.laladentist.id/?install=1"
};

const emptyPromotion = {
  title: "",
  description: "",
  image_url: "",
  status: "draft" as ContentStatus,
  starts_at: toLocalDateTime(new Date()),
  ends_at: ""
};

const emptyArticle = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "Artikel",
  cover_image_url: "",
  status: "draft" as ContentStatus,
  published_at: toLocalDateTime(new Date())
};

function toLocalDateTime(value: Date) {
  const date = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return date.toISOString().slice(0, 16);
}

function toInputDateTime(value: string | null | undefined) {
  if (!value) return "";
  return toLocalDateTime(new Date(value));
}

function createSlug(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const WebsiteContentManagement: React.FC = () => {
  const [tab, setTab] = useState<ContentTab>("hero");
  const [settings, setSettings] = useState<WebsiteSettings>(defaultSettings);
  const [promotions, setPromotions] = useState<WebsitePromotion[]>([]);
  const [articles, setArticles] = useState<WebsiteArticle[]>([]);
  const [promotionForm, setPromotionForm] = useState({ ...emptyPromotion });
  const [articleForm, setArticleForm] = useState({ ...emptyArticle });
  const [editingPromotionId, setEditingPromotionId] = useState<string | null>(null);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContentPreview | null>(null);

  const loadContent = async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsResult, promotionsResult, articlesResult] = await Promise.all([
        supabase.from("website_settings").select("*").eq("id", "main").maybeSingle(),
        supabase.from("website_promotions").select("*").order("starts_at", { ascending: false }),
        supabase.from("website_articles").select("*").order("created_at", { ascending: false })
      ]);
      const loadError = settingsResult.error || promotionsResult.error || articlesResult.error;
      if (loadError) {
        setError(`Gagal memuat konten website: ${loadError.message}`);
      } else {
        setSettings({ ...defaultSettings, ...(settingsResult.data || {}) });
        setPromotions((promotionsResult.data || []) as WebsitePromotion[]);
        setArticles((articlesResult.data || []) as WebsiteArticle[]);
      }
    } catch (loadError) {
      setError(`Gagal memuat konten website: ${loadError instanceof Error ? loadError.message : "Kesalahan tidak diketahui."}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadContent();
  }, []);

  const runSave = async (action: () => PromiseLike<{ error: { message: string } | null }>, successMessage: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      if (result.error) throw new Error(result.error.message);
      setNotice(successMessage);
      await loadContent();
      return true;
    } catch (saveError) {
      setError(`Gagal menyimpan konten: ${saveError instanceof Error ? saveError.message : "Kesalahan tidak diketahui."}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file: File, folder: "hero" | "promotions" | "articles") => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Pilih gambar JPG, PNG, atau WebP.");
      return null;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran gambar maksimal 5 MB.");
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `website/${folder}/${crypto.randomUUID()}.${extension}`;
      const { data, error: uploadError } = await supabase.storage
        .from("clinic-public-media")
        .upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      return supabase.storage.from("clinic-public-media").getPublicUrl(data.path).data.publicUrl;
    } catch (uploadError) {
      setError(`Gagal mengunggah gambar: ${uploadError instanceof Error ? uploadError.message : "Kesalahan tidak diketahui."}`);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = () =>
    runSave(
      () => supabase.from("website_settings").upsert({ ...settings, updated_at: new Date().toISOString() }),
      "Pengaturan hero berhasil disimpan."
    );

  const savePromotion = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      ...promotionForm,
      image_url: promotionForm.image_url || null,
      starts_at: new Date(promotionForm.starts_at).toISOString(),
      ends_at: promotionForm.ends_at ? new Date(promotionForm.ends_at).toISOString() : null
    };
    const result = await runSave(
      () => editingPromotionId
        ? supabase.from("website_promotions").update(payload).eq("id", editingPromotionId)
        : supabase.from("website_promotions").insert(payload),
      editingPromotionId ? "Promosi berhasil diperbarui." : "Promosi berhasil ditambahkan."
    );
    if (result) resetPromotionForm();
  };

  const saveArticle = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      ...articleForm,
      slug: createSlug(articleForm.slug || articleForm.title),
      cover_image_url: articleForm.cover_image_url || null,
      published_at: articleForm.status === "published" && articleForm.published_at
        ? new Date(articleForm.published_at).toISOString()
        : null
    };
    if (!payload.slug) {
      setError("Slug artikel wajib diisi.");
      return;
    }
    const result = await runSave(
      () => editingArticleId
        ? supabase.from("website_articles").update(payload).eq("id", editingArticleId)
        : supabase.from("website_articles").insert(payload),
      editingArticleId ? "Artikel berhasil diperbarui." : "Artikel berhasil ditambahkan."
    );
    if (result) resetArticleForm();
  };

  const resetPromotionForm = () => {
    setPromotionForm({ ...emptyPromotion, starts_at: toLocalDateTime(new Date()) });
    setEditingPromotionId(null);
  };

  const resetArticleForm = () => {
    setArticleForm({ ...emptyArticle, published_at: toLocalDateTime(new Date()) });
    setEditingArticleId(null);
  };

  const removeItem = async (table: "website_promotions" | "website_articles", id: string, name: string) => {
    if (!window.confirm(`Hapus ${name} ini? Tindakan ini tidak dapat dibatalkan.`)) return;
    await runSave(() => supabase.from(table).delete().eq("id", id), `${name} berhasil dihapus.`);
  };

  const uploadControl = (folder: "hero" | "promotions" | "articles", onUploaded: (url: string) => void) => (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
      {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
      Unggah gambar
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const url = await uploadImage(file, folder);
          if (url) onUploaded(url);
          event.target.value = "";
        }}
      />
    </label>
  );

  const inputClass = "mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100";
  const labelClass = "block text-xs font-semibold text-slate-600";

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-amber-700">
            <PanelsTopLeft className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-[0.16em]">Website publik</span>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Kelola Website</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Ubah hero, atur promosi, dan terbitkan artikel tanpa mengubah kode website.</p>
        </div>
        <a href="https://laladentist.id" target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          Lihat website publik ↗
        </a>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-100 bg-white p-2 shadow-sm">
        {([
          ["hero", "Hero", PanelsTopLeft],
          ["promotions", "Promosi", CalendarClock],
          ["articles", "Artikel", Newspaper]
        ] as const).map(([key, title, Icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setError(null); setNotice(null); }}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tab === key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            <Icon className="h-4 w-4" />{title}
          </button>
        ))}
      </div>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}
      {loading ? (
        <div className="flex items-center gap-2 rounded-xl bg-white p-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Memuat konten website...</div>
      ) : (
        <>
          {tab === "hero" && (
            <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
              <form onSubmit={(event) => { event.preventDefault(); void saveSettings(); }} className="space-y-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="text-base font-bold text-slate-900">Konten hero</h2>
                <label className={labelClass}>Judul
                  <input className={inputClass} value={settings.hero_title} onChange={(event) => setSettings({ ...settings, hero_title: event.target.value })} required maxLength={140} />
                </label>
                <label className={labelClass}>Deskripsi
                  <textarea className={inputClass} value={settings.hero_description} onChange={(event) => setSettings({ ...settings, hero_description: event.target.value })} rows={5} maxLength={1000} />
                </label>
                <label className={labelClass}>URL gambar latar
                  <input className={inputClass} type="url" value={settings.hero_image_url || ""} onChange={(event) => setSettings({ ...settings, hero_image_url: event.target.value })} placeholder="https://..." />
                </label>
                {uploadControl("hero", (url) => setSettings({ ...settings, hero_image_url: url }))}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>Teks tombol
                    <input className={inputClass} value={settings.hero_button_text} onChange={(event) => setSettings({ ...settings, hero_button_text: event.target.value })} maxLength={40} required />
                  </label>
                  <label className={labelClass}>Tautan tombol
                    <input className={inputClass} type="url" value={settings.hero_button_url} onChange={(event) => setSettings({ ...settings, hero_button_url: event.target.value })} required />
                  </label>
                </div>
                <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60"><Save className="h-4 w-4" />Simpan hero</button>
              </form>
              <aside className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="mb-3 text-base font-bold text-slate-900">Pratinjau</h2>
                <div className="flex min-h-72 items-center overflow-hidden rounded-xl bg-slate-100 bg-cover bg-center p-6" style={settings.hero_image_url ? { backgroundImage: `linear-gradient(90deg, rgba(255,255,255,.96), rgba(255,255,255,.72)), url("${settings.hero_image_url}")` } : undefined}>
                  <div className="max-w-md">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-amber-700">Lala Dentist</p>
                    <h3 className="text-2xl font-extrabold leading-tight text-slate-900">{settings.hero_title || "Judul hero"}</h3>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{settings.hero_description || "Deskripsi hero akan tampil di sini."}</p>
                    <span className="mt-4 inline-flex rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950">{settings.hero_button_text}</span>
                  </div>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Perubahan tampil kepada pengunjung setelah disimpan dan situs berhasil memuat konten terbaru.</p>
              </aside>
            </div>
          )}

          {tab === "promotions" && (
            <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
              <form onSubmit={(event) => { void savePromotion(event); }} className="space-y-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">{editingPromotionId ? "Ubah promosi" : "Tambah promosi"}</h2>
                  {editingPromotionId && <button type="button" onClick={resetPromotionForm} className="text-slate-500 hover:text-slate-900" aria-label="Batal mengubah promosi"><X className="h-4 w-4" /></button>}
                </div>
                <label className={labelClass}>Judul promosi
                  <input className={inputClass} value={promotionForm.title} onChange={(event) => setPromotionForm({ ...promotionForm, title: event.target.value })} required maxLength={120} />
                </label>
                <label className={labelClass}>Deskripsi
                  <textarea className={inputClass} rows={3} value={promotionForm.description} onChange={(event) => setPromotionForm({ ...promotionForm, description: event.target.value })} maxLength={600} />
                </label>
                <label className={labelClass}>URL gambar
                  <input className={inputClass} type="url" value={promotionForm.image_url} onChange={(event) => setPromotionForm({ ...promotionForm, image_url: event.target.value })} placeholder="https://..." />
                </label>
                {uploadControl("promotions", (url) => setPromotionForm({ ...promotionForm, image_url: url }))}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>Mulai tayang
                    <input className={inputClass} type="datetime-local" value={promotionForm.starts_at} onChange={(event) => setPromotionForm({ ...promotionForm, starts_at: event.target.value })} required />
                  </label>
                  <label className={labelClass}>Akhir tayang (opsional)
                    <input className={inputClass} type="datetime-local" value={promotionForm.ends_at} onChange={(event) => setPromotionForm({ ...promotionForm, ends_at: event.target.value })} min={promotionForm.starts_at} />
                  </label>
                </div>
                <label className={labelClass}>Status
                  <select className={inputClass} value={promotionForm.status} onChange={(event) => setPromotionForm({ ...promotionForm, status: event.target.value as ContentStatus })}>
                    <option value="draft">Draft</option><option value="published">Terbit (mengikuti jadwal)</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setPreview({ title: promotionForm.title, description: promotionForm.description, imageUrl: promotionForm.image_url, category: "Promo", isArticle: false })} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Pratinjau</button>
                  <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60"><Save className="h-4 w-4" />Simpan promosi</button>
                </div>
              </form>
              <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-base font-bold text-slate-900">Daftar promosi <span className="font-normal text-slate-400">({promotions.length})</span></h2>
                <div className="space-y-3">
                  {promotions.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Belum ada promosi website.</p>}
                  {promotions.map((promotion) => (
                    <article key={promotion.id} className="flex gap-3 rounded-lg border border-slate-100 p-3">
                      {promotion.image_url && <img src={promotion.image_url} alt="" className="h-16 w-20 rounded-md bg-slate-100 object-cover" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-800">{promotion.title}</h3>
                          <StatusBadge status={promotion.status} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">{new Date(promotion.starts_at).toLocaleString("id-ID")} – {promotion.ends_at ? new Date(promotion.ends_at).toLocaleString("id-ID") : "tanpa batas akhir"}</p>
                        <div className="mt-2 flex gap-3">
                          <button type="button" onClick={() => { setPromotionForm({ title: promotion.title, description: promotion.description, image_url: promotion.image_url || "", status: promotion.status, starts_at: toInputDateTime(promotion.starts_at), ends_at: toInputDateTime(promotion.ends_at) }); setEditingPromotionId(promotion.id); }} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-amber-700"><Pencil className="h-3.5 w-3.5" />Ubah</button>
                          <button type="button" onClick={() => void removeItem("website_promotions", promotion.id, "Promosi")} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" />Hapus</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === "articles" && (
            <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
              <form onSubmit={(event) => { void saveArticle(event); }} className="space-y-4 rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">{editingArticleId ? "Ubah artikel" : "Tambah artikel"}</h2>
                  {editingArticleId && <button type="button" onClick={resetArticleForm} className="text-slate-500 hover:text-slate-900" aria-label="Batal mengubah artikel"><X className="h-4 w-4" /></button>}
                </div>
                <label className={labelClass}>Judul artikel
                  <input className={inputClass} value={articleForm.title} onChange={(event) => setArticleForm({ ...articleForm, title: event.target.value, slug: editingArticleId ? articleForm.slug : createSlug(event.target.value) })} required maxLength={160} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>Slug URL
                    <input className={inputClass} value={articleForm.slug} onChange={(event) => setArticleForm({ ...articleForm, slug: createSlug(event.target.value) })} required maxLength={160} />
                  </label>
                  <label className={labelClass}>Kategori
                    <input className={inputClass} value={articleForm.category} onChange={(event) => setArticleForm({ ...articleForm, category: event.target.value })} maxLength={60} required />
                  </label>
                </div>
                <label className={labelClass}>Ringkasan
                  <textarea className={inputClass} rows={2} value={articleForm.excerpt} onChange={(event) => setArticleForm({ ...articleForm, excerpt: event.target.value })} maxLength={300} />
                </label>
                <label className={labelClass}>Isi artikel
                  <textarea className={inputClass} rows={8} value={articleForm.content} onChange={(event) => setArticleForm({ ...articleForm, content: event.target.value })} required maxLength={20000} placeholder="Tulis isi artikel. Pisahkan paragraf dengan baris kosong." />
                </label>
                <label className={labelClass}>URL gambar sampul
                  <input className={inputClass} type="url" value={articleForm.cover_image_url} onChange={(event) => setArticleForm({ ...articleForm, cover_image_url: event.target.value })} placeholder="https://..." />
                </label>
                {uploadControl("articles", (url) => setArticleForm({ ...articleForm, cover_image_url: url }))}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>Status
                    <select className={inputClass} value={articleForm.status} onChange={(event) => setArticleForm({ ...articleForm, status: event.target.value as ContentStatus })}>
                      <option value="draft">Draft</option><option value="published">Terbit / terjadwal</option>
                    </select>
                  </label>
                  <label className={labelClass}>Waktu terbit
                    <input className={inputClass} type="datetime-local" value={articleForm.published_at} onChange={(event) => setArticleForm({ ...articleForm, published_at: event.target.value })} disabled={articleForm.status !== "published"} required={articleForm.status === "published"} />
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setPreview({ title: articleForm.title, description: articleForm.content || articleForm.excerpt, imageUrl: articleForm.cover_image_url, category: articleForm.category, isArticle: true })} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Pratinjau</button>
                  <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:opacity-60"><Save className="h-4 w-4" />Simpan artikel</button>
                </div>
              </form>
              <section className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm">
                <h2 className="mb-4 text-base font-bold text-slate-900">Daftar artikel <span className="font-normal text-slate-400">({articles.length})</span></h2>
                <div className="space-y-3">
                  {articles.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">Belum ada artikel website.</p>}
                  {articles.map((article) => (
                    <article key={article.id} className="flex gap-3 rounded-lg border border-slate-100 p-3">
                      {article.cover_image_url && <img src={article.cover_image_url} alt="" className="h-16 w-20 rounded-md bg-slate-100 object-cover" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-slate-800">{article.title}</h3><StatusBadge status={article.status} />
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-500">/{article.slug} · {article.category}{article.published_at ? ` · ${new Date(article.published_at).toLocaleString("id-ID")}` : ""}</p>
                        <div className="mt-2 flex gap-3">
                          <button type="button" onClick={() => { setArticleForm({ title: article.title, slug: article.slug, excerpt: article.excerpt, content: article.content, category: article.category, cover_image_url: article.cover_image_url || "", status: article.status, published_at: toInputDateTime(article.published_at) }); setEditingArticleId(article.id); }} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-amber-700"><Pencil className="h-3.5 w-3.5" />Ubah</button>
                          <button type="button" onClick={() => void removeItem("website_articles", article.id, "Artikel")} className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700"><Trash2 className="h-3.5 w-3.5" />Hapus</button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </>
      )}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}>
          <section role="dialog" aria-modal="true" aria-label="Pratinjau konten website" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><span className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Pratinjau {preview.isArticle ? "artikel" : "promosi"}</span><h2 className="mt-1 text-xl font-bold text-slate-900">{preview.title || "Judul konten"}</h2></div>
              <button type="button" onClick={() => setPreview(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Tutup pratinjau"><X className="h-5 w-5" /></button>
            </div>
            {preview.imageUrl && <img src={preview.imageUrl} alt="" className="mb-4 max-h-72 w-full rounded-xl bg-slate-100 object-cover" />}
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{preview.category || (preview.isArticle ? "Artikel" : "Promo")}</span>
            <p className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-600">{preview.description || "Tambahkan deskripsi atau isi konten untuk melihat pratinjau."}</p>
          </section>
        </div>
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ status: ContentStatus }> = ({ status }) => (
  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
    {status === "published" ? "TERBIT" : "DRAFT"}
  </span>
);
