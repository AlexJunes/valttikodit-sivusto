-- ==============================================================================
-- Referenssit: taulu reference_cases (ylläpidosta hallittavat referenssitarinat)
-- Ajetaan KÄSIN Supabase SQL Editorissa (ensin paikalliseen testiin, sitten tuotantoon).
-- Vaatii: funktio public.is_site_admin() (migraatio 2026-10-10_secure_rls.sql).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.reference_cases (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at           timestamptz NOT NULL DEFAULT now(),
    slug                 text NOT NULL UNIQUE,
    title                text NOT NULL,
    location             text,
    year                 text,
    summary              text,                      -- lyhyt kuvaus listakorttiin
    tagline              text,                      -- heron ingressi
    meta_description     text,                      -- hakukonekuvaus (jos tyhjä, käytetään tagline)
    hero_image           text,                      -- päänosto/hero + listakortin kuva
    facts                jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{"value":"2 / 2","label":"kotia myyty"}] (max 4)
    story_title          text,
    story_text           text,                      -- kappaleet tyhjällä rivillä erotettuna
    story_image          text,
    quote_text           text,
    quote_author         text,
    gallery              jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{"url":"...","alt":"...","caption":"..."}]
    features             jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{"icon":"sun","title":"...","text":"..."}] (max 6)
    location_title       text,
    location_text        text,
    location_image       text,
    specs                jsonb NOT NULL DEFAULT '[]'::jsonb,     -- [{"label":"Energialuokka","value":"A (2018)"}]
    related_project_slug text,                      -- valinnainen: linkki myytävän kohteen sivulle
    published            boolean NOT NULL DEFAULT false,
    sort_order           integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_reference_cases_published ON public.reference_cases (published, sort_order);

ALTER TABLE public.reference_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reference_cases_public_read_published" ON public.reference_cases;
DROP POLICY IF EXISTS "reference_cases_admin_all" ON public.reference_cases;

-- Julkinen näkee vain julkaistut; ylläpito (admin_users) näkee ja hallitsee kaiken
CREATE POLICY "reference_cases_public_read_published" ON public.reference_cases
    FOR SELECT TO anon, authenticated
    USING (published = true);

CREATE POLICY "reference_cases_admin_all" ON public.reference_cases
    FOR ALL TO authenticated
    USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.reference_cases;
