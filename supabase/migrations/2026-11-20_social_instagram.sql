-- ==============================================================================
-- Some: Instagram samaan julkaisuputkeen
-- ==============================================================================
-- Aja Supabasen SQL Editorissa. Vaatii aiemmat some-migraatiot (social, social_metrics, social_agent, social_reels, social_cron).
-- Julkaisulla on kanavat (channels: facebook ja/tai instagram). Instagramissa ei ole ajastusta, joten
-- Edge Function julkaisee Instagram-julkaisut itse ajankohtana (pg_cron 10 min valein, toiminto "tick").
-- Turvallinen ajaa uudelleen.
-- ==============================================================================

ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS channels text[] NOT NULL DEFAULT ARRAY['facebook']::text[];
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_channels_valid;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_channels_valid
    CHECK (cardinality(channels) BETWEEN 1 AND 2 AND channels <@ ARRAY['facebook', 'instagram']::text[]);
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS ig_status text;
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_ig_status_valid;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_ig_status_valid
    CHECK (ig_status IS NULL OR ig_status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED'));
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS ig_container_id text;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS ig_media_id text;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS ig_permalink text;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS ig_published_at timestamptz;
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS ig_error text;
CREATE INDEX IF NOT EXISTS idx_social_posts_ig_due ON public.social_posts (ig_status, scheduled_at) WHERE ig_status IS NOT NULL;

-- Suojalaukaisin: selain ei voi asettaa Instagram-tilaa; kanavan vaihto on sisaltomuutos
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
            NEW.ig_status := NULL; NEW.ig_container_id := NULL; NEW.ig_media_id := NULL; NEW.ig_permalink := NULL; NEW.ig_published_at := NULL; NEW.ig_error := NULL;
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
        NEW.ig_status := OLD.ig_status; NEW.ig_container_id := OLD.ig_container_id; NEW.ig_media_id := OLD.ig_media_id;
        NEW.ig_permalink := OLD.ig_permalink; NEW.ig_published_at := OLD.ig_published_at; NEW.ig_error := OLD.ig_error;

        content_changed := (NEW.title, NEW.body, NEW.image_url, NEW.video_url, NEW.link_url, NEW.scheduled_at, NEW.campaign_id, NEW.channels)
                           IS DISTINCT FROM (OLD.title, OLD.body, OLD.image_url, OLD.video_url, OLD.link_url, OLD.scheduled_at, OLD.campaign_id, OLD.channels);

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

-- Instagram-tilastot (kaikki tilin julkaisut, myos muualla tehdyt). Kirjoittaa vain julkaisupalvelu.
CREATE TABLE IF NOT EXISTS public.social_ig_media (
    ig_media_id text PRIMARY KEY,
    posted_at   timestamptz NOT NULL,
    caption     text,
    permalink   text,
    media_type  text,
    reach       integer,
    views       integer,
    likes       integer,
    comments    integer,
    saves       integer,
    shares      integer,
    fetched_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.social_ig_media ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_ig_media_admin_read" ON public.social_ig_media;
CREATE POLICY "social_ig_media_admin_read" ON public.social_ig_media FOR SELECT TO authenticated USING (public.is_site_admin());
REVOKE ALL ON public.social_ig_media FROM anon;
ALTER TABLE public.social_page_metrics ADD COLUMN IF NOT EXISTS ig_followers integer;

-- Tulosfunktio: lisatty Instagram-julkaisut ja -seuraajat
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
    igm AS (
        SELECT m.ig_media_id, m.posted_at, left(COALESCE(m.caption, ''), 160) AS caption, m.permalink, m.media_type,
               m.reach, m.views, m.likes, m.comments, m.saves, m.shares, sp2.title
        FROM public.social_ig_media m
        LEFT JOIN public.social_posts sp2 ON sp2.ig_media_id = m.ig_media_id
        WHERE m.posted_at >= since
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
                    SELECT day, views, page_views, engagements, followers, ig_followers FROM public.social_page_metrics WHERE day >= since::date) t), '[]'::jsonb),
        'ig_posts', COALESCE((SELECT jsonb_agg(t ORDER BY t.posted_at DESC) FROM igm t), '[]'::jsonb),
        'posts', COALESCE((SELECT jsonb_agg(t ORDER BY t.created_time DESC) FROM posts t), '[]'::jsonb),
        'campaigns', COALESCE((SELECT jsonb_agg(t ORDER BY t.site_views DESC) FROM (
                    SELECT COALESCE(v.campaign, l.campaign) AS campaign, COALESCE(v.site_views, 0) AS site_views, COALESCE(l.leads, 0) AS leads
                    FROM camp_views v FULL OUTER JOIN camp_leads l ON l.campaign = v.campaign) t), '[]'::jsonb)
    ) INTO result;
    RETURN result;
END;
$$;

-- Ajastin: 10 min valein toiminto "tick" (julkaisee eraantyneet Instagram-julkaisut ja paivittaa tilat).
-- Kayttaa samoja Vault-salaisuuksia kuin yoajo (social_function_url, social_cron_secret).
CREATE OR REPLACE FUNCTION public.social_cron_tick()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    u text; s text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.social_posts WHERE status = 'SCHEDULED' AND scheduled_at <= NOW() + INTERVAL '5 minutes') THEN
        RETURN;   -- ei mitaan tehtavaa: funktiota ei kutsuta turhaan
    END IF;
    SELECT decrypted_secret INTO u FROM vault.decrypted_secrets WHERE name = 'social_function_url' LIMIT 1;
    SELECT decrypted_secret INTO s FROM vault.decrypted_secrets WHERE name = 'social_cron_secret' LIMIT 1;
    IF u IS NULL OR s IS NULL THEN RETURN; END IF;
    PERFORM net.http_post(url := u, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s),
                          body := jsonb_build_object('action', 'tick', 'source', 'cron'), timeout_milliseconds := 60000);
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.social_cron_tick() FROM PUBLIC;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule('social-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-tick');
        PERFORM cron.schedule('social-tick', '*/10 * * * *', 'SELECT public.social_cron_tick()');
    END IF;
END $$;

-- ROLLBACK:
--   SELECT cron.unschedule('social-tick');
--   DROP FUNCTION IF EXISTS public.social_cron_tick();
--   DROP TABLE IF EXISTS public.social_ig_media;
--   ALTER TABLE public.social_page_metrics DROP COLUMN IF EXISTS ig_followers;
--   ALTER TABLE public.social_posts DROP COLUMN IF EXISTS channels, DROP COLUMN IF EXISTS ig_status, DROP COLUMN IF EXISTS ig_container_id,
--     DROP COLUMN IF EXISTS ig_media_id, DROP COLUMN IF EXISTS ig_permalink, DROP COLUMN IF EXISTS ig_published_at, DROP COLUMN IF EXISTS ig_error;
--   ja aja 2026-11-17_social_reels.sql:n social_posts_guard seka 2026-11-14_social_agent.sql:n social_results_data uudelleen.
