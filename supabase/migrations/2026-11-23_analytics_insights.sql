-- ==============================================================================
-- Analytiikka: tekoalyn vinkit (pilviagentti) + raporttifunktion jako
-- ==============================================================================
-- Aja Supabasen SQL Editorissa. Vaatii 2026-11-22_analytics_report.sql. Turvallinen ajaa uudelleen.
-- Korvaa <AVAIN> agentin avaimella (openssl rand -hex 24; sama arvo pilviymparistoon INSIGHTS_AGENT_TOKEN).
-- Agentin kaynnistys (Vault: insights_routine_url, insights_routine_token) asennetaan erikseen
-- tiedostolla 2026-11-23_analytics_insights_trigger.sql, kun pilviagentti on luotu.
-- ==============================================================================

-- 1) Raportin laskenta ilman oikeustarkistusta (kayttaa: yllapidon analytics_report ja agentti tokenilla)
CREATE OR REPLACE FUNCTION public.analytics_report_data(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    f timestamptz; t timestamptz; pf timestamptz; ndays int; r jsonb;
BEGIN
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
        'campaigns', coalesce((SELECT jsonb_agg(jsonb_build_object('campaign', c, 'source', s2, 'visits', n,
                    'leads', (SELECT count(*) FROM ld WHERE lower(btrim(split_part(substring(ld.message FROM E'Kampanja:\\s*([^\\n]+)'), '/', 3))) = lower(x.c))) ORDER BY n DESC)
                  FROM (SELECT utm_campaign AS c, src AS s2, count(*) AS n FROM ent WHERE utm_campaign IS NOT NULL GROUP BY 1, 2) x), '[]'::jsonb),
        'fb_posts', coalesce((SELECT jsonb_agg(to_jsonb(fbp) ORDER BY fbp.created_time DESC) FROM fbp), '[]'::jsonb),
        'ig_posts', coalesce((SELECT jsonb_agg(to_jsonb(igp) ORDER BY igp.posted_at DESC) FROM igp), '[]'::jsonb)
    ) INTO r;
    RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public.analytics_report_data(date, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.analytics_report(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'vain yllapitaja' USING ERRCODE = '42501'; END IF;
    RETURN public.analytics_report_data(p_from, p_to);
END; $$;
REVOKE ALL ON FUNCTION public.analytics_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_report(date, date) TO authenticated;

-- 2) Vinkkipyynnot ja tulokset
CREATE TABLE IF NOT EXISTS public.analytics_insights (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    requested_by text,
    p_from       date NOT NULL,
    p_to         date NOT NULL,
    status       text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'READY', 'FAILED')),
    started_at   timestamptz,
    finished_at  timestamptz,
    tips         jsonb,
    summary      text,
    error        text
);
CREATE INDEX IF NOT EXISTS idx_analytics_insights_created ON public.analytics_insights (created_at DESC);
ALTER TABLE public.analytics_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "analytics_insights_admin_read" ON public.analytics_insights;
CREATE POLICY "analytics_insights_admin_read" ON public.analytics_insights FOR SELECT TO authenticated USING (public.is_site_admin());
REVOKE ALL ON public.analytics_insights FROM anon;

CREATE TABLE IF NOT EXISTS public.insights_agent_tokens (id int PRIMARY KEY CHECK (id = 1), token_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.insights_agent_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.insights_agent_tokens FROM anon, authenticated;
INSERT INTO public.insights_agent_tokens (id, token_hash) VALUES (1, encode(sha256(convert_to('<AVAIN>', 'UTF8')), 'hex'))
ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = NOW();

CREATE OR REPLACE FUNCTION public.insights_token_ok(p_token text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT coalesce((SELECT token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex') FROM public.insights_agent_tokens WHERE id = 1), false);
$$;
REVOKE ALL ON FUNCTION public.insights_token_ok(text) FROM PUBLIC, anon, authenticated;

-- Kaynnistaa pilviagentin (jos asennettu). Virheet nielaistaan: pyynto jaa jonoon ja paivittainen ajo kasittelee sen.
CREATE OR REPLACE FUNCTION public.insights_fire()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u text; t text;
BEGIN
    SELECT decrypted_secret INTO u FROM vault.decrypted_secrets WHERE name = 'insights_routine_url' LIMIT 1;
    SELECT decrypted_secret INTO t FROM vault.decrypted_secrets WHERE name = 'insights_routine_token' LIMIT 1;
    IF u IS NULL OR t IS NULL THEN RETURN; END IF;
    PERFORM net.http_post(url := u,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || t,
                                      'anthropic-version', '2023-06-01', 'anthropic-beta', 'experimental-cc-routine-2026-04-01'),
        body := jsonb_build_object('text', 'Uusi analytiikan vinkkipyynto jonossa.'));
EXCEPTION WHEN OTHERS THEN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.insights_fire() FROM PUBLIC, anon, authenticated;

-- Yllapito pyytaa vinkit jaksolle (enintaan 15 pyyntoa vuorokaudessa; kesken oleva pyynto palautetaan)
CREATE OR REPLACE FUNCTION public.analytics_request_insights(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.analytics_insights;
BEGIN
    IF NOT public.is_site_admin() THEN RAISE EXCEPTION 'vain yllapitaja' USING ERRCODE = '42501'; END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN RAISE EXCEPTION 'virheellinen aikavali' USING ERRCODE = '22023'; END IF;
    SELECT * INTO r FROM public.analytics_insights
     WHERE status IN ('PENDING', 'RUNNING') AND created_at > now() - interval '15 minutes' ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('id', r.id, 'status', r.status, 'existing', true); END IF;
    IF (SELECT count(*) FROM public.analytics_insights WHERE created_at > now() - interval '24 hours') >= 15 THEN
        RAISE EXCEPTION 'vinkkeja on pyydetty jo 15 kertaa vuorokauden aikana' USING ERRCODE = '54000';
    END IF;
    INSERT INTO public.analytics_insights (requested_by, p_from, p_to) VALUES (coalesce(auth.jwt() ->> 'email', 'tuntematon'), p_from, p_to) RETURNING * INTO r;
    PERFORM public.insights_fire();
    RETURN jsonb_build_object('id', r.id, 'status', r.status, 'existing', false);
END; $$;
REVOKE ALL ON FUNCTION public.analytics_request_insights(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_request_insights(date, date) TO authenticated;

-- Agentti: ota seuraava pyynto (p_default: jos jonossa ei ole mitaan, luo 30 paivan pyynto paattyen eiliseen)
CREATE OR REPLACE FUNCTION public.insights_agent_next(p_token text, p_default boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.analytics_insights; y date := (now() AT TIME ZONE 'Europe/Helsinki')::date - 1;
BEGIN
    IF NOT public.insights_token_ok(p_token) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000'; END IF;
    -- jumiin jaaneet merkitaan epaonnistuneiksi
    UPDATE public.analytics_insights SET status = 'FAILED', error = 'aikakatkaisu', finished_at = now()
     WHERE status = 'RUNNING' AND started_at < now() - interval '20 minutes';
    SELECT * INTO r FROM public.analytics_insights WHERE status = 'PENDING' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
    IF NOT FOUND THEN
        IF NOT p_default THEN RETURN jsonb_build_object('id', NULL); END IF;
        INSERT INTO public.analytics_insights (requested_by, p_from, p_to) VALUES ('paivittainen ajo', y - 29, y) RETURNING * INTO r;
    END IF;
    UPDATE public.analytics_insights SET status = 'RUNNING', started_at = now() WHERE id = r.id;
    RETURN jsonb_build_object(
        'id', r.id, 'from', r.p_from, 'to', r.p_to,
        'report', public.analytics_report_data(r.p_from, r.p_to),
        'goals', (SELECT to_jsonb(g) - 'id' FROM public.social_goals g WHERE g.id = 1 AND (g.valid_until IS NULL OR g.valid_until >= (now() AT TIME ZONE 'Europe/Helsinki')::date)),
        'projects', coalesce((SELECT jsonb_agg(jsonb_build_object('slug', slug, 'title', title, 'status', status, 'price', price)) FROM public.projects WHERE published = true), '[]'::jsonb)
    );
END; $$;
REVOKE ALL ON FUNCTION public.insights_agent_next(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insights_agent_next(text, boolean) TO anon;

-- Agentti: tallenna vinkit (1-5 kpl: title, why, action, area)
CREATE OR REPLACE FUNCTION public.insights_agent_save(p_token text, p_id uuid, p_tips jsonb, p_summary text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE x jsonb;
BEGIN
    IF NOT public.insights_token_ok(p_token) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000'; END IF;
    IF jsonb_typeof(p_tips) <> 'array' OR jsonb_array_length(p_tips) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'vinkkeja pitaa olla 1-5' USING ERRCODE = '22023'; END IF;
    FOR x IN SELECT * FROM jsonb_array_elements(p_tips) LOOP
        IF coalesce(length(x ->> 'title'), 0) NOT BETWEEN 3 AND 120 OR coalesce(length(x ->> 'why'), 0) NOT BETWEEN 3 AND 500
           OR coalesce(length(x ->> 'action'), 0) NOT BETWEEN 3 AND 500 OR length(coalesce(x ->> 'area', '')) > 40 THEN
            RAISE EXCEPTION 'virheellinen vinkki (title 3-120, why 3-500, action 3-500, area enintaan 40 merkkia)' USING ERRCODE = '22023';
        END IF;
    END LOOP;
    UPDATE public.analytics_insights SET status = 'READY', tips = p_tips, summary = left(p_summary, 600), finished_at = now(), error = NULL
     WHERE id = p_id AND status = 'RUNNING';
    IF NOT FOUND THEN RAISE EXCEPTION 'pyyntoa ei loydy tai se ei ole kesken' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object('ok', true);
END; $$;
REVOKE ALL ON FUNCTION public.insights_agent_save(text, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insights_agent_save(text, uuid, jsonb, text) TO anon;

CREATE OR REPLACE FUNCTION public.insights_agent_fail(p_token text, p_id uuid, p_error text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NOT public.insights_token_ok(p_token) THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000'; END IF;
    UPDATE public.analytics_insights SET status = 'FAILED', error = left(p_error, 300), finished_at = now() WHERE id = p_id AND status = 'RUNNING';
    RETURN jsonb_build_object('ok', FOUND);
END; $$;
REVOKE ALL ON FUNCTION public.insights_agent_fail(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insights_agent_fail(text, uuid, text) TO anon;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.insights_agent_fail(text, uuid, text), public.insights_agent_save(text, uuid, jsonb, text),
--     public.insights_agent_next(text, boolean), public.analytics_request_insights(date, date), public.insights_fire(), public.insights_token_ok(text);
--   DROP TABLE IF EXISTS public.analytics_insights, public.insights_agent_tokens;
--   ja aja 2026-11-22_analytics_report.sql uudelleen (palauttaa analytics_reportin), DROP FUNCTION public.analytics_report_data(date, date).
