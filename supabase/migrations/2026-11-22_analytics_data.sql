-- ==============================================================================
-- Analytiikka, vaihe 1: lisadatan keruu
-- ==============================================================================
-- Aja Supabasen SQL Editorissa. Turvallinen ajaa uudelleen.
-- 1) site_events: sivuston painallukset (soita, sahkoposti, esite, lomakkeen aloitus) ja lukuaika/vieritys.
--    Ei henkilotietoja: session_id tallennetaan vain, jos kavija on sallinut analytiikan (kuten page_views).
-- 2) leads.outcome: liidin lopputulos (kauppa / ei kauppaa), yllapito merkitsee.
-- 3) social_page_metrics: Instagramin tilitason paivaluvut.
-- ==============================================================================

-- 1) Sivuston tapahtumat
CREATE TABLE IF NOT EXISTS public.site_events (
    id         bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    session_id text,
    path       text NOT NULL,
    event      text NOT NULL,
    label      text,
    seconds    integer,
    scroll_pct integer
);
ALTER TABLE public.site_events DROP CONSTRAINT IF EXISTS site_events_valid;
ALTER TABLE public.site_events ADD CONSTRAINT site_events_valid CHECK (
    char_length(path) BETWEEN 1 AND 500
    AND event IN ('cta_phone', 'cta_email', 'brochure', 'form_start', 'engagement')
    AND (label IS NULL OR char_length(label) <= 200)
    AND (session_id IS NULL OR char_length(session_id) <= 40)
    AND (seconds IS NULL OR seconds BETWEEN 0 AND 7200)
    AND (scroll_pct IS NULL OR scroll_pct BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS idx_site_events_created ON public.site_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_events_event ON public.site_events (event, created_at);
ALTER TABLE public.site_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_events_public_insert" ON public.site_events;
CREATE POLICY "site_events_public_insert" ON public.site_events
    FOR INSERT TO anon, authenticated WITH CHECK (true);   -- rajat CHECK-ehdossa; vain lisays
DROP POLICY IF EXISTS "site_events_admin_read" ON public.site_events;
CREATE POLICY "site_events_admin_read" ON public.site_events
    FOR SELECT TO authenticated USING (public.is_site_admin());
GRANT INSERT ON public.site_events TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.site_events_id_seq TO anon, authenticated;
-- Palvelin asettaa ajan (selain ei voi vaaristaa)
CREATE OR REPLACE FUNCTION public.site_events_stamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.created_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS site_events_stamp ON public.site_events;
CREATE TRIGGER site_events_stamp BEFORE INSERT ON public.site_events FOR EACH ROW EXECUTE FUNCTION public.site_events_stamp();

-- 2) Liidin lopputulos
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS outcome text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS outcome_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS outcome_by text;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_outcome_valid;
ALTER TABLE public.leads ADD CONSTRAINT leads_outcome_valid CHECK (outcome IS NULL OR outcome IN ('KAUPPA', 'EI_KAUPPAA'));
-- Vain yllapito voi asettaa lopputuloksen; aika ja merkitsija asetetaan palvelimella
CREATE OR REPLACE FUNCTION public.leads_outcome_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT public.is_site_admin() THEN NEW.outcome := NULL; NEW.outcome_at := NULL; NEW.outcome_by := NULL; END IF;
        RETURN NEW;
    END IF;
    IF NEW.outcome IS DISTINCT FROM OLD.outcome THEN
        NEW.outcome_at := CASE WHEN NEW.outcome IS NULL THEN NULL ELSE now() END;
        NEW.outcome_by := CASE WHEN NEW.outcome IS NULL THEN NULL ELSE COALESCE(auth.jwt() ->> 'email', 'system') END;
    ELSE
        NEW.outcome_at := OLD.outcome_at; NEW.outcome_by := OLD.outcome_by;
    END IF;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS leads_outcome_guard ON public.leads;
CREATE TRIGGER leads_outcome_guard BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.leads_outcome_guard();

-- 3) Instagramin tilitason paivaluvut
ALTER TABLE public.social_page_metrics ADD COLUMN IF NOT EXISTS ig_reach integer;
ALTER TABLE public.social_page_metrics ADD COLUMN IF NOT EXISTS ig_profile_views integer;
ALTER TABLE public.social_page_metrics ADD COLUMN IF NOT EXISTS ig_website_clicks integer;
ALTER TABLE public.social_page_metrics ADD COLUMN IF NOT EXISTS ig_accounts_engaged integer;

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.site_events; DROP FUNCTION IF EXISTS public.site_events_stamp();
--   DROP TRIGGER IF EXISTS leads_outcome_guard ON public.leads; DROP FUNCTION IF EXISTS public.leads_outcome_guard();
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS outcome, DROP COLUMN IF EXISTS outcome_at, DROP COLUMN IF EXISTS outcome_by;
--   ALTER TABLE public.social_page_metrics DROP COLUMN IF EXISTS ig_reach, DROP COLUMN IF EXISTS ig_profile_views,
--     DROP COLUMN IF EXISTS ig_website_clicks, DROP COLUMN IF EXISTS ig_accounts_engaged;
