-- ==============================================================================
-- Paivaraportin yhteenvetofunktio (vain aggregaatit, EI henkilotietoja)
-- ==============================================================================
-- Ajetaan KASIN Supabase SQL Editorissa. Vaatii: taulu report_tokens ja funktio
-- report_weekly (migraatio 2026-10-10_report_weekly.sql) - kayttaa SAMAA avainta
-- (REPORT_TOKEN), uutta avainta ei tarvita. Ei muuta olemassa olevia tauluja.
-- Paivat lasketaan Suomen ajassa (Europe/Helsinki).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.report_daily(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    ok BOOLEAN;
    today DATE := (NOW() AT TIME ZONE 'Europe/Helsinki')::date;
    result JSONB;
BEGIN
    SELECT (token_hash = encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex'))
      INTO ok FROM public.report_tokens WHERE id = 1;

    IF ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
    END IF;

    WITH pv AS (
        SELECT (created_at AT TIME ZONE 'Europe/Helsinki')::date AS d,
               session_id, device_type, referrer,
               CASE WHEN path ~ '\?(kohde|r)=' THEN regexp_replace(path, '\.html', '')
                    ELSE regexp_replace(regexp_replace(split_part(path, '?', 1), '\.html$', ''), '^/index$', '/') END AS p
        FROM public.page_views
        WHERE created_at >= (today - 28)::timestamp AT TIME ZONE 'Europe/Helsinki'
    ),
    ld AS (
        SELECT (created_at AT TIME ZONE 'Europe/Helsinki')::date AS d, status,
               COALESCE(NULLIF(btrim(regexp_replace(substring(message FROM E'^L\\u00c4HDE:\\s*([^\\n]+)'), E'\\s*\\(.*$|\\.\\s*$', '')), ''), 'Tuntematon') AS src
        FROM public.leads
        WHERE created_at >= (today - 28)::timestamp AT TIME ZONE 'Europe/Helsinki'
    )
    SELECT jsonb_build_object(
        'generated_at', NOW(),
        'report_date', today - 1,
        'timezone', 'Europe/Helsinki',

        'daily', COALESCE((
            SELECT jsonb_agg(t ORDER BY t.date) FROM (
                SELECT g::date AS date,
                       (SELECT COUNT(*) FROM pv WHERE pv.d = g::date) AS views,
                       (SELECT COUNT(DISTINCT session_id) FROM pv WHERE pv.d = g::date AND session_id IS NOT NULL) AS sessions,
                       (SELECT COUNT(*) FROM ld WHERE ld.d = g::date) AS leads
                FROM generate_series(today - 14, today - 1, INTERVAL '1 day') g
            ) t), '[]'::jsonb),

        'avg_views_per_day_28d', (SELECT ROUND(COUNT(*)::numeric / 28, 1) FROM pv WHERE d < today),
        'leads_28d', (SELECT COUNT(*) FROM ld WHERE d < today),
        'views_28d', (SELECT COUNT(*) FROM pv WHERE d < today),

        'yesterday_top_pages', COALESCE((
            SELECT jsonb_agg(t) FROM (SELECT p AS path, COUNT(*) AS views FROM pv WHERE d = today - 1 GROUP BY p ORDER BY views DESC LIMIT 10) t), '[]'::jsonb),
        'top_pages_7d', COALESCE((
            SELECT jsonb_agg(t) FROM (SELECT p AS path, COUNT(*) AS views FROM pv WHERE d >= today - 7 AND d < today GROUP BY p ORDER BY views DESC LIMIT 15) t), '[]'::jsonb),
        'yesterday_devices', COALESCE((
            SELECT jsonb_agg(t) FROM (SELECT COALESCE(device_type, 'tuntematon') AS device, COUNT(*) AS views FROM pv WHERE d = today - 1 GROUP BY 1 ORDER BY views DESC) t), '[]'::jsonb),
        'referrers_7d', COALESCE((
            SELECT jsonb_agg(t) FROM (SELECT COALESCE(referrer, 'tuntematon') AS referrer, COUNT(*) AS views FROM pv WHERE d >= today - 7 AND d < today GROUP BY 1 ORDER BY views DESC LIMIT 10) t), '[]'::jsonb),

        'leads_yesterday_by_source', COALESCE((
            SELECT jsonb_agg(t) FROM (SELECT src AS source, COUNT(*) AS n FROM ld WHERE d = today - 1 GROUP BY src ORDER BY n DESC) t), '[]'::jsonb),
        'leads_today_so_far', (SELECT COUNT(*) FROM ld WHERE d = today),
        'leads_7d_by_source', COALESCE((
            SELECT jsonb_agg(t) FROM (SELECT src AS source, COUNT(*) AS n FROM ld WHERE d >= today - 7 AND d < today GROUP BY src ORDER BY n DESC) t), '[]'::jsonb),
        'leads_28d_by_source', COALESCE((
            SELECT jsonb_agg(t) FROM (SELECT src AS source, COUNT(*) AS n FROM ld WHERE d < today GROUP BY src ORDER BY n DESC) t), '[]'::jsonb),
        'leads_new_status', (SELECT COUNT(*) FROM public.leads WHERE status = 'UUSI'),
        'oldest_new_lead_age_hours', (SELECT ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) / 3600) FROM public.leads WHERE status = 'UUSI'),
        'leads_total', (SELECT COUNT(*) FROM public.leads),

        'projects_by_status', COALESCE((
            SELECT jsonb_agg(t) FROM (SELECT status, COUNT(*) AS n FROM public.projects WHERE published = true GROUP BY status) t), '[]'::jsonb)
    ) INTO result;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.report_daily(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_daily(TEXT) TO anon;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.report_daily(TEXT);
