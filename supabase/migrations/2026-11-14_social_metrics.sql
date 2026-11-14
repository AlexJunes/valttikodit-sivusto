-- ==============================================================================
-- Some-tulokset (vaihe B): Facebook-tilastojen tallennus ja tulosfunktio
-- ==============================================================================
-- Ajetaan KASIN Supabase SQL Editorissa. Vaatii: 2026-11-14_social.sql ja is_site_admin().
-- Tilastot haetaan Edge Functionin toiminnolla "sync" (yoajo tai painike); selain ei kirjoita naita tauluja.
-- ==============================================================================

-- Facebook-sivun julkaisut (myos ne, jotka on tehty muualla kuin yllapidosta)
CREATE TABLE IF NOT EXISTS public.social_fb_posts (
    fb_post_id   text PRIMARY KEY,
    created_time timestamptz NOT NULL,
    message      text,
    permalink    text,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Julkaisukohtaiset tilastot paivittain (arvot ovat kumulatiivisia hakuhetkella)
CREATE TABLE IF NOT EXISTS public.social_post_metrics (
    fb_post_id   text NOT NULL REFERENCES public.social_fb_posts (fb_post_id) ON DELETE CASCADE,
    day          date NOT NULL,
    views        integer,
    unique_views integer,
    clicks       integer,
    reactions    integer,
    fetched_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (fb_post_id, day)
);

-- Sivun tason tilastot paivittain
CREATE TABLE IF NOT EXISTS public.social_page_metrics (
    day         date PRIMARY KEY,
    views       integer,
    page_views  integer,
    engagements integer,
    followers   integer,
    fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.social_sync_log (
    id      bigserial PRIMARY KEY,
    at      timestamptz NOT NULL DEFAULT now(),
    source  text,
    summary jsonb
);

ALTER TABLE public.social_fb_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_page_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_sync_log     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_fb_posts_admin_read" ON public.social_fb_posts;
DROP POLICY IF EXISTS "social_post_metrics_admin_read" ON public.social_post_metrics;
DROP POLICY IF EXISTS "social_page_metrics_admin_read" ON public.social_page_metrics;
DROP POLICY IF EXISTS "social_sync_log_admin_read" ON public.social_sync_log;
CREATE POLICY "social_fb_posts_admin_read" ON public.social_fb_posts FOR SELECT TO authenticated USING (public.is_site_admin());
CREATE POLICY "social_post_metrics_admin_read" ON public.social_post_metrics FOR SELECT TO authenticated USING (public.is_site_admin());
CREATE POLICY "social_page_metrics_admin_read" ON public.social_page_metrics FOR SELECT TO authenticated USING (public.is_site_admin());
CREATE POLICY "social_sync_log_admin_read" ON public.social_sync_log FOR SELECT TO authenticated USING (public.is_site_admin());

-- Tulosnakyma: Facebook-luvut + sivuston kavijat ja liidit kampanjatunnisteiden kautta (vain lukumaaria)
CREATE OR REPLACE FUNCTION public.social_results(p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    since timestamptz := NOW() - (GREATEST(7, LEAST(COALESCE(p_days, 90), 365)) || ' days')::interval;
    result jsonb;
BEGIN
    IF NOT public.is_site_admin() THEN
        RAISE EXCEPTION 'vain yllapitaja' USING ERRCODE = '42501';
    END IF;

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
REVOKE ALL ON FUNCTION public.social_results(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_results(integer) TO authenticated;

-- Yoajon kutsu: lukee osoitteen ja salaisuuden Vaultista (asetetaan tiedostolla 2026-11-14_social_cron.sql)
CREATE OR REPLACE FUNCTION public.social_cron_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    u text; s text;
BEGIN
    SELECT decrypted_secret INTO u FROM vault.decrypted_secrets WHERE name = 'social_function_url' LIMIT 1;
    SELECT decrypted_secret INTO s FROM vault.decrypted_secrets WHERE name = 'social_cron_secret' LIMIT 1;
    IF u IS NULL OR s IS NULL THEN RETURN; END IF;
    PERFORM net.http_post(url := u, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', s),
                          body := jsonb_build_object('action', 'sync', 'source', 'cron'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.social_cron_sync() FROM PUBLIC;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.social_cron_sync();
--   DROP FUNCTION IF EXISTS public.social_results(integer);
--   DROP TABLE IF EXISTS public.social_sync_log, public.social_page_metrics, public.social_post_metrics, public.social_fb_posts;
