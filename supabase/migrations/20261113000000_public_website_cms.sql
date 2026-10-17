CREATE TABLE IF NOT EXISTS public.website_settings (
  id TEXT PRIMARY KEY CHECK (id = 'main'),
  hero_title TEXT NOT NULL DEFAULT 'Urus kunjungan, lebih mudah dari HP.',
  hero_description TEXT NOT NULL DEFAULT '',
  hero_image_url TEXT,
  hero_button_text TEXT NOT NULL DEFAULT 'Unduh aplikasi',
  hero_button_url TEXT NOT NULL DEFAULT 'https://pasien.laladentist.id/?install=1',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users (id)
);

CREATE TABLE IF NOT EXISTS public.website_promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT website_promotions_valid_dates CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.website_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  excerpt TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'Artikel',
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_website_promotions_publication
  ON public.website_promotions (status, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_website_articles_publication
  ON public.website_articles (status, published_at DESC);

ALTER TABLE public.website_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read website settings" ON public.website_settings;
CREATE POLICY "Public can read website settings"
  ON public.website_settings FOR SELECT TO anon, authenticated
  USING (true);
DROP POLICY IF EXISTS "Super admins manage website settings" ON public.website_settings;
CREATE POLICY "Super admins manage website settings"
  ON public.website_settings FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Public can read active website promotions" ON public.website_promotions;
CREATE POLICY "Public can read active website promotions"
  ON public.website_promotions FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND starts_at <= now()
    AND (ends_at IS NULL OR ends_at > now())
  );
DROP POLICY IF EXISTS "Super admins manage website promotions" ON public.website_promotions;
CREATE POLICY "Super admins manage website promotions"
  ON public.website_promotions FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Public can read published website articles" ON public.website_articles;
CREATE POLICY "Public can read published website articles"
  ON public.website_articles FOR SELECT TO anon, authenticated
  USING (
    status = 'published'
    AND published_at IS NOT NULL
    AND published_at <= now()
  );
DROP POLICY IF EXISTS "Super admins manage website articles" ON public.website_articles;
CREATE POLICY "Super admins manage website articles"
  ON public.website_articles FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

GRANT SELECT ON public.website_settings, public.website_promotions, public.website_articles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.website_settings, public.website_promotions, public.website_articles TO authenticated;
