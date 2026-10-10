-- ==============================================================================
-- Viikkoraportin yhteenvetofunktio (vain aggregaatit, EI henkilötietoja)
-- ==============================================================================
-- Ajetaan KÄSIN Supabase SQL Editorissa (Dashboard -> SQL Editor). Ei kosketa
-- olemassa oleviin tauluihin. Palautettavissa: ks. ROLLBACK-osio tiedoston lopussa.
--
-- Tarvitsee sarakkeet (käsikirjan skeeman mukaan, tarkista tuotannosta):
--   leads(created_at, status)            page_views(created_at, path, session_id,
--   projects(status, published)                      device_type, referrer)
-- Jos ajo antaa virheen puuttuvasta sarakkeesta, kerro virhe Claudelle.
--
-- OHJE:
-- 1. Luo avain Terminalissa:   openssl rand -hex 24
-- 2. Korvaa alla kohta  <AVAIN>  luomallasi avaimella (EI committiin, vain SQL Editoriin).
-- 3. Aja koko skripti. Tallenna avain turvallisesti (salasanahallinta); sama avain
--    annetaan myöhemmin raportointiagentin ympäristömuuttujaksi REPORT_TOKEN.
-- ==============================================================================

-- 1. Avaimen tiiviste (itse avainta ei tallenneta)
CREATE TABLE IF NOT EXISTS public.report_tokens (
    id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS päälle ILMAN käytäntöjä: kukaan (anon/authenticated) ei näe taulua suoraan
ALTER TABLE public.report_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.report_tokens (id, token_hash)
VALUES (1, encode(sha256(convert_to('<AVAIN>', 'UTF8')), 'hex'))
ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = NOW();

-- 2. Funktio: palauttaa vain lukumääriä
CREATE OR REPLACE FUNCTION public.report_weekly(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    ok BOOLEAN;
    result JSONB;
BEGIN
    SELECT (token_hash = encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex'))
      INTO ok FROM public.report_tokens WHERE id = 1;

    IF ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
    END IF;

    SELECT jsonb_build_object(
        'generated_at', NOW(),
        'period_days', 7,

        'views_7d',      (SELECT COUNT(*) FROM public.page_views WHERE created_at >= NOW() - INTERVAL '7 days'),
        'views_prev_7d', (SELECT COUNT(*) FROM public.page_views WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days'),
        'sessions_7d',   (SELECT COUNT(DISTINCT session_id) FROM public.page_views WHERE created_at >= NOW() - INTERVAL '7 days' AND session_id IS NOT NULL),
        'sessions_prev_7d', (SELECT COUNT(DISTINCT session_id) FROM public.page_views WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days' AND session_id IS NOT NULL),

        'top_pages_7d', COALESCE((
            SELECT jsonb_agg(t) FROM (
                SELECT path, COUNT(*) AS views
                FROM public.page_views
                WHERE created_at >= NOW() - INTERVAL '7 days'
                GROUP BY path ORDER BY views DESC LIMIT 10
            ) t), '[]'::jsonb),

        'devices_7d', COALESCE((
            SELECT jsonb_agg(t) FROM (
                SELECT COALESCE(device_type, 'tuntematon') AS device, COUNT(*) AS views
                FROM public.page_views
                WHERE created_at >= NOW() - INTERVAL '7 days'
                GROUP BY 1 ORDER BY views DESC
            ) t), '[]'::jsonb),

        'referrers_7d', COALESCE((
            SELECT jsonb_agg(t) FROM (
                SELECT COALESCE(referrer, 'tuntematon') AS referrer, COUNT(*) AS views
                FROM public.page_views
                WHERE created_at >= NOW() - INTERVAL '7 days'
                GROUP BY 1 ORDER BY views DESC LIMIT 10
            ) t), '[]'::jsonb),

        'leads_7d',      (SELECT COUNT(*) FROM public.leads WHERE created_at >= NOW() - INTERVAL '7 days'),
        'leads_prev_7d', (SELECT COUNT(*) FROM public.leads WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days'),
        'leads_new_status', (SELECT COUNT(*) FROM public.leads WHERE status = 'UUSI'),
        'oldest_new_lead_age_hours', (SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 3600) FROM public.leads WHERE status = 'UUSI'),
        'leads_total', (SELECT COUNT(*) FROM public.leads),

        'projects_by_status', COALESCE((
            SELECT jsonb_agg(t) FROM (
                SELECT status, COUNT(*) AS n
                FROM public.projects WHERE published = true
                GROUP BY status
            ) t), '[]'::jsonb)
    ) INTO result;

    RETURN result;
END;
$$;

-- 3. Oikeudet: vain anon/authenticated saa kutsua; EI muille. (Avain suojaa silti.)
REVOKE ALL ON FUNCTION public.report_weekly(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_weekly(TEXT) TO anon;

-- ==============================================================================
-- TESTI (aja erikseen; korvaa <AVAIN>):
--   SELECT public.report_weekly('<AVAIN>');
-- Väärällä avaimella pitää tulla virhe 'unauthorized':
--   SELECT public.report_weekly('väärä');
-- ==============================================================================

-- ROLLBACK (jos halutaan poistaa kokonaan):
--   DROP FUNCTION IF EXISTS public.report_weekly(TEXT);
--   DROP TABLE IF EXISTS public.report_tokens;
