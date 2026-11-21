-- ==============================================================================
-- Analytiikka: suodattimet (lahde, laite, sivu, kampanja, julkaisu)
-- ==============================================================================
-- Aja Supabasen SQL Editorissa. Vaatii 2026-11-23_analytics_insights.sql. Turvallinen ajaa uudelleen.
-- 1) site_events ja leads saavat laitteen ja seurantatiedot (uusi data suodattuu kaikilla tavoilla).
-- 2) analytics_report_data / analytics_report ottavat suodattimet (jsonb): source, device, path, campaign, content.
--    Kaynnin lahde, kampanja ja julkaisu periytyvat istunnon ensimmaiselta sivulta (kun istuntotunniste on).
-- ==============================================================================

ALTER TABLE public.site_events ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE public.site_events ADD COLUMN IF NOT EXISTS referrer text;
ALTER TABLE public.site_events ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.site_events ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.site_events ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE public.site_events DROP CONSTRAINT IF EXISTS site_events_meta_valid;
ALTER TABLE public.site_events ADD CONSTRAINT site_events_meta_valid CHECK (
    (device_type IS NULL OR char_length(device_type) <= 20) AND (referrer IS NULL OR char_length(referrer) <= 300)
    AND (utm_source IS NULL OR char_length(utm_source) <= 100) AND (utm_campaign IS NULL OR char_length(utm_campaign) <= 100)
    AND (utm_content IS NULL OR char_length(utm_content) <= 100));

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_source text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_campaign text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS utm_content text;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_meta_valid;
ALTER TABLE public.leads ADD CONSTRAINT leads_meta_valid CHECK (
    (device_type IS NULL OR char_length(device_type) <= 20) AND (utm_source IS NULL OR char_length(utm_source) <= 100)
    AND (utm_campaign IS NULL OR char_length(utm_campaign) <= 100) AND (utm_content IS NULL OR char_length(utm_content) <= 100));

-- Jakson tunnusluvut suodattimin
DROP FUNCTION IF EXISTS public.analytics_period(timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.analytics_period(p_from timestamptz, p_to timestamptz, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    r jsonb;
    f_src text := NULLIF(p_filters ->> 'source', ''); f_dev text := NULLIF(p_filters ->> 'device', '');
    f_path text := NULLIF(p_filters ->> 'path', ''); f_camp text := NULLIF(p_filters ->> 'campaign', '');
    f_cont text := NULLIF(p_filters ->> 'content', '');
BEGIN
    WITH base AS (
        SELECT p.*, public.analytics_path(p.path) AS npath,
               CASE WHEN coalesce(p.referrer, '') <> U&'Sis\00e4inen' THEN public.analytics_source(p.utm_source, p.referrer) END AS own_src
        FROM public.page_views p WHERE p.created_at >= p_from AND p.created_at < p_to),
    sess AS (SELECT DISTINCT ON (session_id) session_id, own_src AS s_src, utm_campaign AS s_camp, utm_content AS s_cont
             FROM base WHERE session_id IS NOT NULL AND own_src IS NOT NULL ORDER BY session_id, created_at),
    pv AS (SELECT b.*, coalesce(s.s_src, b.own_src) AS src FROM base b LEFT JOIN sess s ON s.session_id = b.session_id
           WHERE (f_src IS NULL OR coalesce(s.s_src, b.own_src) = f_src) AND (f_dev IS NULL OR b.device_type = f_dev)
             AND (f_path IS NULL OR b.npath = f_path) AND (f_camp IS NULL OR coalesce(s.s_camp, b.utm_campaign) = f_camp)
             AND (f_cont IS NULL OR coalesce(s.s_cont, b.utm_content) = f_cont)),
    ent AS (SELECT * FROM pv WHERE own_src IS NOT NULL),
    ev AS (SELECT e.* FROM public.site_events e LEFT JOIN sess s ON s.session_id = e.session_id
           WHERE e.created_at >= p_from AND e.created_at < p_to
             AND (f_src IS NULL OR coalesce(s.s_src, CASE WHEN coalesce(e.referrer, '') NOT IN ('', U&'Sis\00e4inen') OR e.utm_source IS NOT NULL THEN public.analytics_source(e.utm_source, e.referrer) END) = f_src)
             AND (f_dev IS NULL OR e.device_type = f_dev) AND (f_path IS NULL OR public.analytics_path(e.path) = f_path)
             AND (f_camp IS NULL OR coalesce(s.s_camp, e.utm_campaign) = f_camp) AND (f_cont IS NULL OR coalesce(s.s_cont, e.utm_content) = f_cont)),
    eng AS (SELECT * FROM ev WHERE event = 'engagement'),
    ld AS (SELECT l.* FROM public.leads l
           WHERE l.created_at >= p_from AND l.created_at < p_to
             AND (f_src IS NULL OR coalesce(CASE WHEN l.utm_source IS NOT NULL THEN public.analytics_source(l.utm_source, NULL) END,
                       CASE WHEN l.message ~* E'Kampanja:\\s*instagram' THEN 'Instagram' WHEN l.message ~* E'Kampanja:\\s*(facebook|fb)' THEN 'Facebook' WHEN l.message ~* E'Kampanja:' THEN 'Muu kampanja' END) = f_src)
             AND (f_dev IS NULL OR l.device_type = f_dev)
             AND (f_camp IS NULL OR coalesce(l.utm_campaign, lower(btrim(split_part(substring(l.message FROM E'Kampanja:\\s*([^\\n]+)'), '/', 3)))) = f_camp)
             AND (f_cont IS NULL OR l.utm_content = f_cont)
             AND f_path IS NULL),
    pm AS (SELECT * FROM public.social_page_metrics WHERE day >= (p_from AT TIME ZONE 'Europe/Helsinki')::date AND day < (p_to AT TIME ZONE 'Europe/Helsinki')::date)
    SELECT jsonb_build_object(
        'pageviews', (SELECT count(*) FROM pv),
        'visits', (SELECT count(*) FROM ent),
        'sessions', (SELECT count(DISTINCT session_id) FROM pv WHERE session_id IS NOT NULL),
        'social_visits', (SELECT count(*) FROM ent WHERE src IN ('Facebook', 'Instagram')),
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
REVOKE ALL ON FUNCTION public.analytics_period(timestamptz, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;

-- Raportti suodattimin (korvaa 2-parametrisen version; kutsu ilman suodattimia toimii kuten ennen)
DROP FUNCTION IF EXISTS public.analytics_report(date, date);
DROP FUNCTION IF EXISTS public.analytics_report_data(date, date);
CREATE OR REPLACE FUNCTION public.analytics_report_data(p_from date, p_to date, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    f timestamptz; t timestamptz; pf timestamptz; ndays int; r jsonb;
    fl jsonb := coalesce(p_filters, '{}'::jsonb);
    f_src text := NULLIF(fl ->> 'source', ''); f_dev text := NULLIF(fl ->> 'device', '');
    f_path text := NULLIF(fl ->> 'path', ''); f_camp text := NULLIF(fl ->> 'campaign', '');
    f_cont text := NULLIF(fl ->> 'content', '');
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
        RAISE EXCEPTION 'virheellinen aikavali' USING ERRCODE = '22023';
    END IF;
    ndays := p_to - p_from + 1;
    f := (p_from::timestamp AT TIME ZONE 'Europe/Helsinki');
    t := ((p_to + 1)::timestamp AT TIME ZONE 'Europe/Helsinki');
    pf := ((p_from - ndays)::timestamp AT TIME ZONE 'Europe/Helsinki');

    WITH base AS (
        SELECT p.*, (p.created_at AT TIME ZONE 'Europe/Helsinki')::date AS d, public.analytics_path(p.path) AS npath,
               CASE WHEN coalesce(p.referrer, '') <> U&'Sis\00e4inen' THEN public.analytics_source(p.utm_source, p.referrer) END AS own_src
        FROM public.page_views p WHERE p.created_at >= f AND p.created_at < t),
    sess AS (SELECT DISTINCT ON (session_id) session_id, own_src AS s_src, utm_campaign AS s_camp, utm_content AS s_cont
             FROM base WHERE session_id IS NOT NULL AND own_src IS NOT NULL ORDER BY session_id, created_at),
    pv AS (SELECT b.*, coalesce(s.s_src, b.own_src) AS src, coalesce(s.s_camp, b.utm_campaign) AS camp FROM base b LEFT JOIN sess s ON s.session_id = b.session_id
           WHERE (f_src IS NULL OR coalesce(s.s_src, b.own_src) = f_src) AND (f_dev IS NULL OR b.device_type = f_dev)
             AND (f_path IS NULL OR b.npath = f_path) AND (f_camp IS NULL OR coalesce(s.s_camp, b.utm_campaign) = f_camp)
             AND (f_cont IS NULL OR coalesce(s.s_cont, b.utm_content) = f_cont)),
    ent AS (SELECT * FROM pv WHERE own_src IS NOT NULL),
    ev AS (SELECT e.*, (e.created_at AT TIME ZONE 'Europe/Helsinki')::date AS d, public.analytics_path(e.path) AS npath
           FROM public.site_events e LEFT JOIN sess s ON s.session_id = e.session_id
           WHERE e.created_at >= f AND e.created_at < t
             AND (f_src IS NULL OR coalesce(s.s_src, CASE WHEN coalesce(e.referrer, '') NOT IN ('', U&'Sis\00e4inen') OR e.utm_source IS NOT NULL THEN public.analytics_source(e.utm_source, e.referrer) END) = f_src)
             AND (f_dev IS NULL OR e.device_type = f_dev) AND (f_path IS NULL OR public.analytics_path(e.path) = f_path)
             AND (f_camp IS NULL OR coalesce(s.s_camp, e.utm_campaign) = f_camp) AND (f_cont IS NULL OR coalesce(s.s_cont, e.utm_content) = f_cont)),
    ld0 AS (SELECT l.*, (l.created_at AT TIME ZONE 'Europe/Helsinki')::date AS d,
                   coalesce(NULLIF(btrim(substring(l.message FROM E'^L.HDE:\\s*([^\\n.]+)')), ''), 'Muu yhteydenotto') AS ltype,
                   coalesce(CASE WHEN l.utm_source IS NOT NULL THEN public.analytics_source(l.utm_source, NULL) END,
                       CASE WHEN l.message ~* E'Kampanja:\\s*instagram' THEN 'Instagram' WHEN l.message ~* E'Kampanja:\\s*(facebook|fb)' THEN 'Facebook'
                            WHEN l.message ~* E'Kampanja:' THEN 'Muu kampanja' END, 'Ei seurantatunnistetta') AS lchan,
                   coalesce(l.utm_campaign, lower(btrim(split_part(substring(l.message FROM E'Kampanja:\\s*([^\\n]+)'), '/', 3)))) AS lcamp
            FROM public.leads l WHERE l.created_at >= f AND l.created_at < t),
    ld AS (SELECT * FROM ld0 WHERE (f_src IS NULL OR lchan = f_src) AND (f_dev IS NULL OR device_type = f_dev)
             AND (f_camp IS NULL OR lcamp = f_camp) AND (f_cont IS NULL OR utm_content = f_cont) AND f_path IS NULL),
    days AS (SELECT generate_series(p_from, p_to, interval '1 day')::date AS d),
    pm AS (SELECT * FROM public.social_page_metrics WHERE day BETWEEN p_from AND p_to),
    pages AS (
        SELECT pv.npath AS path, count(*) AS views,
               (SELECT round(avg(e.seconds)) FROM ev e WHERE e.event = 'engagement' AND e.npath = pv.npath) AS avg_seconds,
               (SELECT round(avg(e.scroll_pct)) FROM ev e WHERE e.event = 'engagement' AND e.npath = pv.npath) AS avg_scroll,
               (SELECT count(*) FROM ev e WHERE e.event IN ('cta_phone', 'cta_email', 'brochure', 'form_start') AND e.npath = pv.npath) AS actions
        FROM pv GROUP BY pv.npath ORDER BY count(*) DESC LIMIT 15
    ),
    spc AS (SELECT sp.*, substring(sp.link_url FROM 'utm_content=([^&]+)') AS ucont, c.slug AS camp_slug
            FROM public.social_posts sp LEFT JOIN public.social_campaigns c ON c.id = sp.campaign_id),
    fbp AS (
        SELECT f2.fb_post_id, f2.created_time, left(coalesce(f2.message, ''), 140) AS message, f2.permalink, spc.title, spc.ucont AS utm_content, spc.camp_slug AS campaign,
               m.views, m.unique_views, m.clicks, m.reactions,
               (SELECT count(*) FROM base WHERE base.own_src IS NOT NULL AND base.utm_content IS NOT NULL AND base.utm_content = spc.ucont) AS site_visits
        FROM public.social_fb_posts f2
        LEFT JOIN spc ON spc.fb_post_id = f2.fb_post_id
        LEFT JOIN LATERAL (SELECT * FROM public.social_post_metrics x WHERE x.fb_post_id = f2.fb_post_id ORDER BY x.day DESC LIMIT 1) m ON true
        WHERE f2.created_time >= f AND f2.created_time < t
          AND (f_src IS NULL OR f_src = 'Facebook') AND (f_cont IS NULL OR spc.ucont = f_cont) AND (f_camp IS NULL OR spc.camp_slug = f_camp)
          AND f_dev IS NULL AND f_path IS NULL
    ),
    igp AS (
        SELECT g.ig_media_id, g.posted_at, left(coalesce(g.caption, ''), 140) AS caption, g.permalink, g.media_type, spc.title, spc.ucont AS utm_content, spc.camp_slug AS campaign,
               g.views, g.reach, g.likes, g.comments, g.saves, g.shares
        FROM public.social_ig_media g LEFT JOIN spc ON spc.ig_media_id = g.ig_media_id
        WHERE g.posted_at >= f AND g.posted_at < t
          AND (f_src IS NULL OR f_src = 'Instagram') AND (f_cont IS NULL OR spc.ucont = f_cont) AND (f_camp IS NULL OR spc.camp_slug = f_camp)
          AND f_dev IS NULL AND f_path IS NULL
    )
    SELECT jsonb_build_object(
        'from', p_from, 'to', p_to, 'days', ndays, 'filters', fl,
        'generated_at', now(),
        'social_synced_at', (SELECT max(fetched_at) FROM public.social_page_metrics),
        'cur', public.analytics_period(f, t, fl),
        'prev', public.analytics_period(pf, f, fl),
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
        'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object('campaign', c, 'source', s2, 'visits', n,
                    'leads', (SELECT count(*) FROM ld WHERE ld.lcamp = lower(x.c))) ORDER BY n DESC)
                  FROM (SELECT camp AS c, src AS s2, count(*) AS n FROM ent WHERE camp IS NOT NULL GROUP BY 1, 2) x), '[]'::jsonb),
        'fb_posts', coalesce((SELECT jsonb_agg(to_jsonb(fbp) ORDER BY fbp.created_time DESC) FROM fbp), '[]'::jsonb),
        'ig_posts', coalesce((SELECT jsonb_agg(to_jsonb(igp) ORDER BY igp.posted_at DESC) FROM igp), '[]'::jsonb)
    ) INTO r;
    RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.analytics_report_data(date, date, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.analytics_report(p_from date, p_to date, p_filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'vain yllapitaja' USING ERRCODE = '42501'; END IF;
    RETURN public.analytics_report_data(p_from, p_to, p_filters);
END; $$;
REVOKE ALL ON FUNCTION public.analytics_report(date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_report(date, date, jsonb) TO authenticated;

-- ROLLBACK: aja 2026-11-23_analytics_insights.sql uudelleen (palauttaa 2-parametriset funktiot) ja
--   DROP FUNCTION public.analytics_report(date, date, jsonb), public.analytics_report_data(date, date, jsonb), public.analytics_period(timestamptz, timestamptz, jsonb);
--   ALTER TABLE public.site_events / public.leads DROP COLUMN device_type, utm_source, utm_campaign, utm_content (+ site_events.referrer).
