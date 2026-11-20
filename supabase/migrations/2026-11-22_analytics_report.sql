-- ==============================================================================
-- Analytiikka, vaihe 2: yhteinen raporttifunktio (verkkosivut + some + liidit)
-- ==============================================================================
-- Aja Supabasen SQL Editorissa. Vaatii 2026-11-22_analytics_data.sql ja some-migraatiot. Turvallinen ajaa uudelleen.
-- analytics_report(p_from, p_to): paivat Suomen aikaa (molemmat mukaan). Palauttaa valitun jakson (cur),
-- edellisen samanpituisen jakson (prev) seka erittelyt. Vain yllapito.
-- Kaynti = sivukatselu, joka ei tule sivuston sisalta (referrer <> 'Sisainen'); lahde paatellaan siita.
-- ==============================================================================

-- Kaynnin lahde: seurantatunniste ensin, sitten referrer
CREATE OR REPLACE FUNCTION public.analytics_source(p_utm text, p_ref text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT CASE
        WHEN lower(coalesce(p_utm, '')) LIKE '%instagram%' THEN 'Instagram'
        WHEN lower(coalesce(p_utm, '')) LIKE '%facebook%' OR lower(coalesce(p_utm, '')) = 'fb' THEN 'Facebook'
        WHEN lower(coalesce(p_ref, '')) LIKE '%instagram%' THEN 'Instagram'
        WHEN lower(coalesce(p_ref, '')) LIKE '%facebook%' OR lower(coalesce(p_ref, '')) LIKE '%fb.%' THEN 'Facebook'
        WHEN lower(coalesce(p_ref, '')) ~ '(google|bing|duckduckgo|yahoo|ecosia)' THEN 'Haku'
        WHEN coalesce(p_utm, '') <> '' THEN 'Muu kampanja'
        WHEN lower(coalesce(p_ref, '')) IN ('', 'suora') THEN 'Suora'
        ELSE 'Muut sivustot'
    END;
$$;

-- Sivun osoite yhteen muotoon: /yhteys.html ja /yhteys ovat sama sivu, /index.html = /
CREATE OR REPLACE FUNCTION public.analytics_path(p text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
    SELECT CASE WHEN coalesce(p, '') IN ('', '/', '/index', '/index.html') THEN '/'
                ELSE regexp_replace(p, '\.html(\?|$)', '\1') END;
$$;

-- Yhden jakson tunnusluvut [p_from, p_to)
CREATE OR REPLACE FUNCTION public.analytics_period(p_from timestamptz, p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE r jsonb;
BEGIN
    WITH pv AS (SELECT * FROM public.page_views WHERE created_at >= p_from AND created_at < p_to),
    ent AS (SELECT * FROM pv WHERE coalesce(referrer, '') <> U&'Sis\00e4inen'),
    ev AS (SELECT * FROM public.site_events WHERE created_at >= p_from AND created_at < p_to),
    eng AS (SELECT * FROM ev WHERE event = 'engagement'),
    ld AS (SELECT * FROM public.leads WHERE created_at >= p_from AND created_at < p_to),
    pm AS (SELECT * FROM public.social_page_metrics WHERE day >= (p_from AT TIME ZONE 'Europe/Helsinki')::date AND day < (p_to AT TIME ZONE 'Europe/Helsinki')::date)
    SELECT jsonb_build_object(
        'pageviews', (SELECT count(*) FROM pv),
        'visits', (SELECT count(*) FROM ent),
        'sessions', (SELECT count(DISTINCT session_id) FROM pv WHERE session_id IS NOT NULL),
        'social_visits', (SELECT count(*) FROM ent WHERE public.analytics_source(utm_source, referrer) IN ('Facebook', 'Instagram')),
        'avg_seconds', (SELECT round(avg(seconds)) FROM eng),
        'avg_scroll', (SELECT round(avg(scroll_pct)) FROM eng),
        'engaged_share', (SELECT round(100.0 * count(*) FILTER (WHERE seconds >= 30) / NULLIF(count(*), 0)) FROM eng),
        'engagement_samples', (SELECT count(*) FROM eng),
        'cta_phone', (SELECT count(*) FROM ev WHERE event = 'cta_phone'),
        'cta_email', (SELECT count(*) FROM ev WHERE event = 'cta_email'),
        'brochure', (SELECT count(*) FROM ev WHERE event = 'brochure'),
        'form_start', (SELECT count(*) FROM ev WHERE event = 'form_start'),
        'leads', (SELECT count(*) FROM ld),
        'leads_won', (SELECT count(*) FROM ld WHERE outcome = 'KAUPPA'),
        'leads_lost', (SELECT count(*) FROM ld WHERE outcome = 'EI_KAUPPAA'),
        'fb_views', (SELECT sum(views) FROM pm),
        'fb_engagements', (SELECT sum(engagements) FROM pm),
        'fb_followers', (SELECT followers FROM pm WHERE followers IS NOT NULL ORDER BY day DESC LIMIT 1),
        'ig_reach', (SELECT sum(ig_reach) FROM pm),
        'ig_profile_views', (SELECT sum(ig_profile_views) FROM pm),
        'ig_website_clicks', (SELECT sum(ig_website_clicks) FROM pm),
        'ig_followers', (SELECT ig_followers FROM pm WHERE ig_followers IS NOT NULL ORDER BY day DESC LIMIT 1),
        'fb_posts', (SELECT count(*) FROM public.social_fb_posts WHERE created_time >= p_from AND created_time < p_to),
        'ig_posts', (SELECT count(*) FROM public.social_ig_media WHERE posted_at >= p_from AND posted_at < p_to)
    ) INTO r;
    RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.analytics_period(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.analytics_report(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    f timestamptz; t timestamptz; pf timestamptz; ndays int; r jsonb;
BEGIN
    IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'vain yllapitaja' USING ERRCODE = '42501'; END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
        RAISE EXCEPTION 'virheellinen aikavali' USING ERRCODE = '22023';
    END IF;
    ndays := p_to - p_from + 1;
    f := (p_from::timestamp AT TIME ZONE 'Europe/Helsinki');
    t := ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Helsinki');
    pf := ((p_from - ndays)::timestamp AT TIME ZONE 'Europe/Helsinki');

    WITH pv AS (SELECT *, (created_at AT TIME ZONE 'Europe/Helsinki')::date AS d, public.analytics_path(path) AS npath FROM public.page_views WHERE created_at >= f AND created_at < t),
    ent AS (SELECT *, public.analytics_source(utm_source, referrer) AS src FROM pv WHERE coalesce(referrer, '') <> U&'Sis\00e4inen'),
    ev AS (SELECT *, (created_at AT TIME ZONE 'Europe/Helsinki')::date AS d, public.analytics_path(path) AS npath FROM public.site_events WHERE created_at >= f AND created_at < t),
    ld AS (SELECT *, (created_at AT TIME ZONE 'Europe/Helsinki')::date AS d,
                  coalesce(NULLIF(btrim(substring(message FROM E'^L.HDE:\\s*([^\\n.]+)')), ''), 'Muu yhteydenotto') AS ltype,
                  CASE WHEN message ~* E'Kampanja:\\s*instagram' THEN 'Instagram' WHEN message ~* E'Kampanja:\\s*(facebook|fb)' THEN 'Facebook'
                       WHEN message ~* E'Kampanja:' THEN 'Muu kampanja' ELSE 'Ei seurantatunnistetta' END AS lchan
           FROM public.leads WHERE created_at >= f AND created_at < t),
    days AS (SELECT generate_series(p_from, p_to, interval '1 day')::date AS d),
    pm AS (SELECT * FROM public.social_page_metrics WHERE day BETWEEN p_from AND p_to),
    pages AS (
        SELECT pv.npath AS path, count(*) AS views,
               (SELECT round(avg(e.seconds)) FROM ev e WHERE e.event = 'engagement' AND e.npath = pv.npath) AS avg_seconds,
               (SELECT round(avg(e.scroll_pct)) FROM ev e WHERE e.event = 'engagement' AND e.npath = pv.npath) AS avg_scroll,
               (SELECT count(*) FROM ev e WHERE e.event IN ('cta_phone', 'cta_email', 'brochure', 'form_start') AND e.npath = pv.npath) AS actions
        FROM pv GROUP BY pv.npath ORDER BY count(*) DESC LIMIT 15
    ),
    fbp AS (
        SELECT f2.fb_post_id, f2.created_time, left(coalesce(f2.message, ''), 140) AS message, f2.permalink, sp.title,
               m.views, m.unique_views, m.clicks, m.reactions,
               (SELECT count(*) FROM ent WHERE ent.utm_content IS NOT NULL AND ent.utm_content = substring(sp.link_url FROM 'utm_content=([^&]+)')) AS site_visits
        FROM public.social_fb_posts f2
        LEFT JOIN public.social_posts sp ON sp.fb_post_id = f2.fb_post_id
        LEFT JOIN LATERAL (SELECT * FROM public.social_post_metrics x WHERE x.fb_post_id = f2.fb_post_id ORDER BY x.day DESC LIMIT 1) m ON true
        WHERE f2.created_time >= f AND f2.created_time < t
    ),
    igp AS (
        SELECT g.ig_media_id, g.posted_at, left(coalesce(g.caption, ''), 140) AS caption, g.permalink, g.media_type, sp.title,
               g.views, g.reach, g.likes, g.comments, g.saves, g.shares
        FROM public.social_ig_media g LEFT JOIN public.social_posts sp ON sp.ig_media_id = g.ig_media_id
        WHERE g.posted_at >= f AND g.posted_at < t
    )
    SELECT jsonb_build_object(
        'from', p_from, 'to', p_to, 'days', ndays,
        'generated_at', now(),
        'social_synced_at', (SELECT max(fetched_at) FROM public.social_page_metrics),
        'cur', public.analytics_period(f, t),
        'prev', public.analytics_period(pf, f),
        'daily', (SELECT jsonb_agg(jsonb_build_object(
                    'd', days.d,
                    'pageviews', (SELECT count(*) FROM pv WHERE pv.d = days.d),
                    'visits', (SELECT count(*) FROM ent WHERE ent.d = days.d),
                    'fb_visits', (SELECT count(*) FROM ent WHERE ent.d = days.d AND ent.src = 'Facebook'),
                    'ig_visits', (SELECT count(*) FROM ent WHERE ent.d = days.d AND ent.src = 'Instagram'),
                    'leads', (SELECT count(*) FROM ld WHERE ld.d = days.d),
                    'actions', (SELECT count(*) FROM ev WHERE ev.d = days.d AND ev.event <> 'engagement'),
                    'fb_views', (SELECT views FROM pm WHERE pm.day = days.d),
                    'ig_reach', (SELECT ig_reach FROM pm WHERE pm.day = days.d),
                    'fb_followers', (SELECT followers FROM pm WHERE pm.day = days.d),
                    'ig_followers', (SELECT ig_followers FROM pm WHERE pm.day = days.d)
                 ) ORDER BY days.d) FROM days),
        'sources', coalesce((SELECT jsonb_agg(jsonb_build_object('source', src, 'visits', n,
                    'leads', (SELECT count(*) FROM ld WHERE ld.lchan = s.src)) ORDER BY n DESC)
                  FROM (SELECT src, count(*) AS n FROM ent GROUP BY src) s), '[]'::jsonb),
        'devices', coalesce((SELECT jsonb_agg(jsonb_build_object('device', coalesce(device_type, 'Tuntematon'), 'views', n) ORDER BY n DESC)
                  FROM (SELECT device_type, count(*) AS n FROM pv GROUP BY device_type) x), '[]'::jsonb),
        'pages', coalesce((SELECT jsonb_agg(to_jsonb(pages)) FROM pages), '[]'::jsonb),
        'lead_types', coalesce((SELECT jsonb_agg(jsonb_build_object('type', ltype, 'leads', n, 'won', w) ORDER BY n DESC)
                  FROM (SELECT ltype, count(*) AS n, count(*) FILTER (WHERE outcome = 'KAUPPA') AS w FROM ld GROUP BY ltype) x), '[]'::jsonb),
        'lead_channels', coalesce((SELECT jsonb_agg(jsonb_build_object('channel', lchan, 'leads', n, 'won', w) ORDER BY n DESC)
                  FROM (SELECT lchan, count(*) AS n, count(*) FILTER (WHERE outcome = 'KAUPPA') AS w FROM ld GROUP BY lchan) x), '[]'::jsonb),
        'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object('campaign', c, 'source', s2, 'visits', n) ORDER BY n DESC)
                  FROM (SELECT utm_campaign AS c, src AS s2, count(*) AS n FROM ent WHERE utm_campaign IS NOT NULL GROUP BY 1, 2) x), '[]'::jsonb),
        'fb_posts', coalesce((SELECT jsonb_agg(to_jsonb(fbp) ORDER BY fbp.created_time DESC) FROM fbp), '[]'::jsonb),
        'ig_posts', coalesce((SELECT jsonb_agg(to_jsonb(igp) ORDER BY igp.posted_at DESC) FROM igp), '[]'::jsonb)
    ) INTO r;
    RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.analytics_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_report(date, date) TO authenticated;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.analytics_report(date, date);
--   DROP FUNCTION IF EXISTS public.analytics_period(timestamptz, timestamptz);
--   DROP FUNCTION IF EXISTS public.analytics_source(text, text);
--   DROP FUNCTION IF EXISTS public.analytics_path(text);
