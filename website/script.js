const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

if (navToggle && navLinks) {
  navToggle.addEventListener("click", () => {
    const isOpen = navToggle.getAttribute("aria-expanded") === "true";
    navToggle.setAttribute("aria-expanded", String(!isOpen));
    navToggle.setAttribute("aria-label", isOpen ? "Buka navigasi" : "Tutup navigasi");
    navLinks.classList.toggle("is-open", !isOpen);
  });

  navLinks.addEventListener("click", (event) => {
    if (event.target instanceof HTMLAnchorElement) {
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Buka navigasi");
      navLinks.classList.remove("is-open");
    }
  });
}

const year = document.querySelector("#year");
if (year) year.textContent = String(new Date().getFullYear());

const safePublicUrl = (value) => {
  if (!value) return "";
  try {
    const url = new URL(value, window.location.origin);
    return ["https:", "http:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const websiteMediaUrl = (value) => {
  const url = safePublicUrl(value);
  if (!url) return "";
  const match = new URL(url).pathname.match(
    /^\/storage\/v1\/object\/public\/clinic-public-media\/(website\/(?:hero|promotions|articles)\/[A-Za-z0-9-]+\.(?:jpg|png|webp))$/
  );
  return match ? `/api/site-media?path=${encodeURIComponent(match[1])}` : url;
};

const makeElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

const loadWebsiteContent = async () => {
  const articleSlug = window.location.pathname.match(/^\/artikel\/([^/]+)\/?$/)?.[1];
  try {
    const response = await fetch(`/api/site-content${articleSlug ? `?slug=${encodeURIComponent(articleSlug)}` : ""}`);
    if (!response.ok) throw new Error(`Permintaan konten gagal (${response.status}).`);
    const content = await response.json();
    if (articleSlug) {
      renderArticlePage(content.articles?.[0]);
      return;
    }
    applyHero(content.settings);
    renderPromotions(content.promotions || []);
    renderArticles(content.articles || []);
  } catch (error) {
    console.error("Konten website dinamis gagal dimuat; konten bawaan tetap ditampilkan.", error);
    if (articleSlug) renderArticlePage(null);
  }
};

const applyHero = (settings) => {
  if (!settings) return;
  const title = document.querySelector("#hero-title");
  const description = document.querySelector("#hero-description");
  const button = document.querySelector("#hero-button");
  if (title && settings.hero_title) title.textContent = settings.hero_title;
  if (description && typeof settings.hero_description === "string") description.textContent = settings.hero_description;
  if (button) {
    button.firstChild.textContent = settings.hero_button_text || "Unduh aplikasi ";
    button.href = "https://pasien.laladentist.id/patient-install.html";
  }
  const imageUrl = websiteMediaUrl(settings.hero_image_url);
  if (imageUrl) {
    document.querySelector(".hero").style.backgroundImage =
      `linear-gradient(90deg, rgba(251,250,247,.94) 0%, rgba(251,250,247,.86) 40%, rgba(251,250,247,.12) 75%), url("${imageUrl}")`;
  }
};

const renderPromotions = (promotions) => {
  const section = document.querySelector("#promosi");
  const list = document.querySelector("#website-promotion-list");
  if (!section || !list || promotions.length === 0) return;
  section.hidden = false;
  list.replaceChildren(...promotions.map((promotion) => {
    const card = makeElement("article", "website-promotion-card");
    const imageUrl = websiteMediaUrl(promotion.image_url);
    if (imageUrl) {
      const image = makeElement("img", "website-promotion-card__image");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      card.append(image);
    }
    const copy = makeElement("div", "website-promotion-card__copy");
    copy.append(
      makeElement("span", "website-article-card__category", "Promo"),
      makeElement("h3", "", promotion.title),
      makeElement("p", "", promotion.description)
    );
    if (promotion.ends_at) {
      copy.append(makeElement("small", "", `Berlaku sampai ${new Date(promotion.ends_at).toLocaleDateString("id-ID")}`));
    }
    card.append(copy);
    return card;
  }));
};

const renderArticles = (articles) => {
  const list = document.querySelector("#website-article-list");
  if (!list || articles.length === 0) return;
  list.replaceChildren(...articles.map((article) => {
    const card = makeElement("article", "website-article-card");
    const imageUrl = websiteMediaUrl(article.cover_image_url);
    if (imageUrl) {
      const image = makeElement("img", "website-article-card__image");
      image.src = imageUrl;
      image.alt = "";
      image.loading = "lazy";
      card.append(image);
    }
    card.append(
      makeElement("span", "website-article-card__category", article.category || "Artikel"),
      makeElement("h3", "", article.title),
      makeElement("p", "", article.excerpt)
    );
    const link = makeElement("a", "", "Baca artikel ");
    link.href = `/artikel/${encodeURIComponent(article.slug)}`;
    link.append(makeElement("span", "", "↗"));
    card.append(link);
    return card;
  }));
};

const renderArticlePage = (article) => {
  const main = document.querySelector("#main");
  if (!main) return;
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.href = `/${link.getAttribute("href")}`;
  });
  const page = makeElement("section", "article-detail section-pad");
  const container = makeElement("article", "container article-detail__inner");
  const back = makeElement("a", "article-detail__back", "← Kembali ke artikel");
  back.href = "/#artikel";
  container.append(back);
  if (article) {
    const imageUrl = websiteMediaUrl(article.cover_image_url);
    if (imageUrl) {
      const image = makeElement("img", "article-detail__cover");
      image.src = imageUrl;
      image.alt = "";
      container.append(image);
    }
    container.append(
      makeElement("span", "website-article-card__category", article.category || "Artikel"),
      makeElement("h1", "", article.title),
      makeElement("p", "article-detail__excerpt", article.excerpt)
    );
    const content = makeElement("div", "article-detail__content");
    article.content.split(/\n{2,}/).filter(Boolean).forEach((paragraph) => {
      content.append(makeElement("p", "", paragraph));
    });
    container.append(content);
    document.title = `${article.title} | Lala Dentist`;
  } else {
    container.append(makeElement("h1", "", "Artikel tidak ditemukan"), makeElement("p", "", "Artikel ini tidak tersedia atau belum diterbitkan."));
    document.title = "Artikel tidak ditemukan | Lala Dentist";
  }
  page.append(container);
  main.replaceChildren(page);
};

void loadWebsiteContent();
