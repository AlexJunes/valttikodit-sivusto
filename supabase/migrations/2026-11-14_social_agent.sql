-- ==============================================================================
-- Some-agentti (vaihe C): agentti tekee julkaisuluonnokset suoraan Some-sivulle
-- ==============================================================================
-- Ajetaan KASIN Supabase SQL Editorissa. Vaatii: 2026-11-14_social.sql ja 2026-11-14_social_metrics.sql.
-- Agentti voi VAIN luoda luonnoksia (tila DRAFT, source = agent) ja lukea tulokset/kontekstin. Se ei voi hyvaksya,
-- ajastaa, muokata tai poistaa mitaan. Oma avain (ei sama kuin raportti- tai liidiagentin).
--
-- OHJE: korvaa <AVAIN> omalla avaimella (openssl rand -hex 24) ja aja koko skripti.
-- ==============================================================================

ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_source_check;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_source_check CHECK (source IN ('manual', 'agent'));
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS agent_note text;

CREATE TABLE IF NOT EXISTS public.social_agent_tokens (
    id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.social_agent_tokens ENABLE ROW LEVEL SECURITY;
INSERT INTO public.social_agent_tokens (id, token_hash)
VALUES (1, encode(sha256(convert_to('<AVAIN>', 'UTF8')), 'hex'))
ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = NOW();

CREATE OR REPLACE FUNCTION public.social_posts_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    who text := COALESCE(auth.jwt() ->> 'email', 'system');
    is_service boolean := COALESCE(auth.role(), '') = 'service_role' OR session_user IN ('postgres', 'supabase_admin');
    content_changed boolean;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF NOT is_service AND OLD.status IN ('SCHEDULED', 'PUBLISHED') THEN
            RAISE EXCEPTION 'ajastettua tai julkaistua julkaisua ei voi poistaa; peru ajastus ensin' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NOT is_service THEN
            IF NEW.status <> 'DRAFT' THEN
                RAISE EXCEPTION 'uusi julkaisu luodaan luonnoksena' USING ERRCODE = '42501';
            END IF;
            NEW.fb_post_id := NULL; NEW.fb_permalink := NULL; NEW.published_at := NULL;
            NEW.approved_by := NULL; NEW.approved_at := NULL; NEW.last_error := NULL;
            -- source = agent vain agentin RPC:lla (asettaa app.social_agent=1 samassa transaktiossa)
            IF COALESCE(current_setting('app.social_agent', true), '') = '1' THEN NEW.source := 'agent';
            ELSE NEW.source := 'manual'; NEW.agent_note := NULL; END IF;
        END IF;
        NEW.created_by := CASE WHEN NEW.source = 'agent' THEN 'agentti' ELSE who END;
        RETURN NEW;
    END IF;

    NEW.updated_at := now();
    IF NOT is_service THEN
        IF NEW.status IN ('SCHEDULED', 'PUBLISHED', 'FAILED') AND NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'tilan % asettaa vain julkaisupalvelu', NEW.status USING ERRCODE = '42501';
        END IF;
        NEW.fb_post_id := OLD.fb_post_id; NEW.fb_permalink := OLD.fb_permalink;
        NEW.published_at := OLD.published_at; NEW.last_error := OLD.last_error;
        NEW.source := OLD.source; NEW.agent_note := OLD.agent_note;

        content_changed := (NEW.title, NEW.body, NEW.image_url, NEW.link_url, NEW.scheduled_at, NEW.campaign_id)
                           IS DISTINCT FROM (OLD.title, OLD.body, OLD.image_url, OLD.link_url, OLD.scheduled_at, OLD.campaign_id);

        IF OLD.status IN ('SCHEDULED', 'PUBLISHED') THEN
            IF content_changed THEN
                RAISE EXCEPTION 'ajastettua julkaisua ei voi muokata; peru ajastus ensin' USING ERRCODE = '42501';
            END IF;
            IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'CANCELLED' THEN
                RAISE EXCEPTION 'tilaa ei voi muuttaa suoraan' USING ERRCODE = '42501';
            END IF;
        END IF;

        IF NEW.status = 'APPROVED' AND OLD.status IS DISTINCT FROM 'APPROVED' THEN
            NEW.approved_by := who; NEW.approved_at := now();
        ELSIF NEW.status = 'APPROVED' AND content_changed THEN
            -- sisaltomuutos mitatoi hyvaksynnan
            NEW.status := 'DRAFT'; NEW.approved_by := NULL; NEW.approved_at := NULL;
        ELSIF NEW.status = 'DRAFT' THEN
            NEW.approved_by := NULL; NEW.approved_at := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.social_posts_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    who text := COALESCE(auth.jwt() ->> 'email', CASE WHEN COALESCE(current_setting('app.social_agent', true), '') = '1' THEN 'agentti' ELSE 'julkaisupalvelu' END);
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.social_audit (actor, action, post_id, details)
        VALUES (who, 'luotu', NEW.id, jsonb_build_object('title', NEW.title));
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.status IS DISTINCT FROM OLD.status THEN
            INSERT INTO public.social_audit (actor, action, post_id, details)
            VALUES (who, 'tila ' || NEW.status, NEW.id,
                    jsonb_build_object('title', NEW.title, 'scheduled_at', NEW.scheduled_at, 'error', NEW.last_error));
        ELSIF (NEW.title, NEW.body, NEW.image_url, NEW.link_url, NEW.scheduled_at)
              IS DISTINCT FROM (OLD.title, OLD.body, OLD.image_url, OLD.link_url, OLD.scheduled_at) THEN
            INSERT INTO public.social_audit (actor, action, post_id, details)
            VALUES (who, 'muokattu', NEW.id, jsonb_build_object('title', NEW.title));
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO public.social_audit (actor, action, post_id, details)
        VALUES (who, 'poistettu', OLD.id, jsonb_build_object('title', OLD.title, 'status', OLD.status));
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.social_results_data(p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    since timestamptz := NOW() - (GREATEST(7, LEAST(COALESCE(p_days, 90), 365)) || ' days')::interval;
    result jsonb;
BEGIN
    WITH latest AS (
        SELECT DISTINCT ON (fb_post_id) fb_post_id, views, unique_views, clicks, reactions, fetched_at
        FROM public.social_post_metrics ORDER BY fb_post_id, day DESC
    ),
    sp AS (
        SELECT p.fb_post_id, p.id AS internal_id, p.title, p.campaign_id,
               substring(p.link_url FROM 'utm_content=([^&]+)') AS utm_content
        FROM public.social_posts p WHERE p.fb_post_id IS NOT NULL
    ),
    site AS (
        SELECT utm_content, COUNT(*) AS n FROM public.page_views
        WHERE utm_source = 'facebook' AND utm_content IS NOT NULL AND created_at >= since GROUP BY utm_content
    ),
    posts AS (
        SELECT f.fb_post_id, f.created_time, left(COALESCE(f.message, ''), 160) AS message, f.permalink,
               sp.internal_id, sp.title, c.name AS campaign, sp.utm_content,
               l.views, l.unique_views, l.clicks, l.reactions, COALESCE(site.n, 0) AS site_views
        FROM public.social_fb_posts f
        LEFT JOIN sp ON sp.fb_post_id = f.fb_post_id
        LEFT JOIN public.social_campaigns c ON c.id = sp.campaign_id
        LEFT JOIN latest l ON l.fb_post_id = f.fb_post_id
        LEFT JOIN site ON site.utm_content = sp.utm_content
        WHERE f.created_time >= since
    ),
    camp_views AS (
        SELECT utm_campaign AS campaign, COUNT(*) AS site_views FROM public.page_views
        WHERE utm_source = 'facebook' AND utm_campaign IS NOT NULL AND created_at >= since GROUP BY utm_campaign
    ),
    camp_leads AS (
        SELECT NULLIF(btrim(split_part(substring(message FROM E'Kampanja:\\s*([^\\n]+)'), '/', 3)), '') AS campaign, COUNT(*) AS leads
        FROM public.leads
        WHERE created_at >= since AND message ~ E'Kampanja:\\s*facebook'
        GROUP BY 1
    )
    SELECT jsonb_build_object(
        'generated_at', NOW(),
        'synced_at', (SELECT MAX(fetched_at) FROM public.social_page_metrics),
        'page', COALESCE((SELECT jsonb_agg(t ORDER BY t.day) FROM (
                    SELECT day, views, page_views, engagements, followers FROM public.social_page_metrics WHERE day >= since::date) t), '[]'::jsonb),
        'posts', COALESCE((SELECT jsonb_agg(t ORDER BY t.created_time DESC) FROM posts t), '[]'::jsonb),
        'campaigns', COALESCE((SELECT jsonb_agg(t ORDER BY t.site_views DESC) FROM (
                    SELECT COALESCE(v.campaign, l.campaign) AS campaign, COALESCE(v.site_views, 0) AS site_views, COALESCE(l.leads, 0) AS leads
                    FROM camp_views v FULL OUTER JOIN camp_leads l ON l.campaign = v.campaign) t), '[]'::jsonb)
    ) INTO result;
    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.social_results_data(integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.social_results(p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.is_site_admin() THEN
        RAISE EXCEPTION 'vain yllapitaja' USING ERRCODE = '42501';
    END IF;
    RETURN public.social_results_data(p_days);
END;
$$;

-- Agentin konteksti: tulokset + olemassa olevat julkaisut (toiston valttamiseksi) + kampanjat
CREATE OR REPLACE FUNCTION public.social_agent_context(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    ok BOOLEAN;
BEGIN
    SELECT (token_hash = encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex'))
      INTO ok FROM public.social_agent_tokens WHERE id = 1;
    IF ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
    END IF;
    RETURN jsonb_build_object(
        'generated_at', NOW(),
        'results', public.social_results_data(120),
        'campaigns', COALESCE((SELECT jsonb_agg(jsonb_build_object('slug', slug, 'name', name)) FROM public.social_campaigns WHERE status = 'ACTIVE'), '[]'::jsonb),
        'recent_and_upcoming', COALESCE((
            SELECT jsonb_agg(t ORDER BY t.scheduled_at DESC NULLS LAST) FROM (
                SELECT p.title, left(p.body, 200) AS body, p.status, p.source, p.scheduled_at, p.created_at
                FROM public.social_posts p
                WHERE p.created_at >= NOW() - INTERVAL '45 days' OR p.status IN ('DRAFT', 'APPROVED', 'SCHEDULED')
                ORDER BY p.created_at DESC LIMIT 40) t), '[]'::jsonb)
    );
END;
$$;

-- Luo luonnos (vain DRAFT): validoi sisallon, rajoittaa maaran
CREATE OR REPLACE FUNCTION public.social_agent_create_draft(
    p_token TEXT, p_title TEXT, p_body TEXT, p_image_url TEXT, p_link_kind TEXT, p_link_slug TEXT,
    p_link_url TEXT, p_scheduled_at TIMESTAMPTZ, p_campaign_slug TEXT, p_campaign_name TEXT, p_note TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    ok BOOLEAN;
    cid uuid := NULL;
    new_id uuid;
BEGIN
    SELECT (token_hash = encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex'))
      INTO ok FROM public.social_agent_tokens WHERE id = 1;
    IF ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
    END IF;

    IF COALESCE(btrim(p_title), '') = '' OR length(p_title) > 80 THEN RAISE EXCEPTION 'virheellinen otsikko' USING ERRCODE = '22023'; END IF;
    IF COALESCE(btrim(p_body), '') = '' OR length(p_body) > 2000 THEN RAISE EXCEPTION 'virheellinen teksti' USING ERRCODE = '22023'; END IF;
    IF p_image_url IS NOT NULL AND p_image_url !~ '^https://' THEN RAISE EXCEPTION 'kuvan osoite pitaa alkaa https://' USING ERRCODE = '22023'; END IF;
    IF p_link_url IS NOT NULL AND p_link_url !~ '^https://www\.valttikodit\.fi/' THEN RAISE EXCEPTION 'linkin pitaa osoittaa www.valttikodit.fi-sivulle' USING ERRCODE = '22023'; END IF;
    IF p_link_kind IS NOT NULL AND p_link_kind NOT IN ('kohde', 'referenssi', 'tontti', 'muu') THEN RAISE EXCEPTION 'virheellinen linkkityyppi' USING ERRCODE = '22023'; END IF;
    IF p_scheduled_at IS NOT NULL AND (p_scheduled_at < NOW() + INTERVAL '1 hour' OR p_scheduled_at > NOW() + INTERVAL '29 days') THEN
        RAISE EXCEPTION 'ehdotetun ajankohdan pitaa olla 1 h - 29 vrk paassa' USING ERRCODE = '22023';
    END IF;
    IF (SELECT COUNT(*) FROM public.social_posts WHERE source = 'agent' AND created_at > NOW() - INTERVAL '7 days') >= 5 THEN
        RAISE EXCEPTION 'agentti on tehnyt jo 5 luonnosta viikon aikana' USING ERRCODE = '54000';
    END IF;
    IF (SELECT COUNT(*) FROM public.social_posts WHERE source = 'agent' AND status = 'DRAFT') >= 8 THEN
        RAISE EXCEPTION 'hyvaksymattomia agentin luonnoksia on jo 8' USING ERRCODE = '54000';
    END IF;

    IF p_campaign_slug IS NOT NULL THEN
        IF p_campaign_slug !~ '^[a-z0-9-]{1,50}$' THEN RAISE EXCEPTION 'virheellinen kampanjatunniste' USING ERRCODE = '22023'; END IF;
        INSERT INTO public.social_campaigns (name, slug) VALUES (COALESCE(NULLIF(btrim(p_campaign_name), ''), p_campaign_slug), p_campaign_slug)
        ON CONFLICT (slug) DO NOTHING;
        SELECT id INTO cid FROM public.social_campaigns WHERE slug = p_campaign_slug;
    END IF;

    PERFORM set_config('app.social_agent', '1', true);
    INSERT INTO public.social_posts (title, body, image_url, link_kind, link_slug, link_url, scheduled_at, campaign_id, agent_note)
    VALUES (btrim(p_title), p_body, p_image_url, p_link_kind, p_link_slug, p_link_url, p_scheduled_at, cid, left(p_note, 500))
    RETURNING id INTO new_id;
    RETURN jsonb_build_object('id', new_id);
END;
$$;

REVOKE ALL ON FUNCTION public.social_agent_context(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.social_agent_create_draft(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_agent_context(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.social_agent_create_draft(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO anon;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.social_agent_create_draft(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT);
--   DROP FUNCTION IF EXISTS public.social_agent_context(TEXT);
--   DROP TABLE IF EXISTS public.social_agent_tokens;
--   (palauta social_posts_guard/social_posts_audit/social_results migraatioista 2026-11-14_social*.sql)
