-- ==============================================================================
-- Some: oma Instagram-teksti (ig_body) ja agentin kanavavalinta
-- ==============================================================================
-- Aja Supabasen SQL Editorissa. Vaatii 2026-11-20_social_instagram.sql. Turvallinen ajaa uudelleen.
-- Instagramiin julkaistaan ig_body, jos se on annettu, muuten sama teksti kuin Facebookiin (body).
-- ==============================================================================

ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS ig_body text;
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_ig_body_len;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_ig_body_len CHECK (ig_body IS NULL OR length(ig_body) <= 2200);

-- Suojalaukaisin: Instagram-tekstin muutos on sisaltomuutos (mitatoi hyvaksynnan)
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

        content_changed := (NEW.title, NEW.body, NEW.image_url, NEW.video_url, NEW.link_url, NEW.scheduled_at, NEW.campaign_id, NEW.channels, NEW.ig_body)
                           IS DISTINCT FROM (OLD.title, OLD.body, OLD.image_url, OLD.video_url, OLD.link_url, OLD.scheduled_at, OLD.campaign_id, OLD.channels, OLD.ig_body);

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

-- Agentti: kanavat ja Instagram-teksti (vanha 11 parametrin versio poistetaan)
DROP FUNCTION IF EXISTS public.social_agent_create_draft(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.social_agent_create_draft(
    p_token TEXT, p_title TEXT, p_body TEXT, p_image_url TEXT, p_link_kind TEXT, p_link_slug TEXT,
    p_link_url TEXT, p_scheduled_at TIMESTAMPTZ, p_campaign_slug TEXT, p_campaign_name TEXT, p_note TEXT,
    p_channels TEXT[] DEFAULT ARRAY['facebook']::TEXT[], p_ig_body TEXT DEFAULT NULL)
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
    IF p_channels IS NULL OR cardinality(p_channels) NOT BETWEEN 1 AND 2 OR NOT (p_channels <@ ARRAY['facebook', 'instagram']::TEXT[]) THEN
        RAISE EXCEPTION 'virheelliset kanavat' USING ERRCODE = '22023';
    END IF;
    IF 'instagram' = ANY (p_channels) AND p_image_url IS NULL THEN RAISE EXCEPTION 'Instagram vaatii kuvan' USING ERRCODE = '22023'; END IF;
    IF p_ig_body IS NOT NULL AND (btrim(p_ig_body) = '' OR length(p_ig_body) > 2200) THEN RAISE EXCEPTION 'virheellinen Instagram-teksti' USING ERRCODE = '22023'; END IF;
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
    INSERT INTO public.social_posts (title, body, image_url, link_kind, link_slug, link_url, scheduled_at, campaign_id, agent_note, channels, ig_body)
    VALUES (btrim(p_title), p_body, p_image_url, p_link_kind, p_link_slug, p_link_url, p_scheduled_at, cid, left(p_note, 500), p_channels,
            CASE WHEN 'instagram' = ANY (p_channels) THEN p_ig_body ELSE NULL END)
    RETURNING id INTO new_id;
    RETURN jsonb_build_object('id', new_id);
END;
$$;
REVOKE ALL ON FUNCTION public.social_agent_create_draft(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_agent_create_draft(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], TEXT) TO anon;

-- Agentin konteksti: viimeaikaisten julkaisujen kanavat ja Instagram-teksti
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
                SELECT p.title, left(p.body, 200) AS body, left(p.ig_body, 200) AS ig_body, p.channels, p.status, p.source, p.scheduled_at, p.created_at
                FROM public.social_posts p
                WHERE p.created_at >= NOW() - INTERVAL '45 days' OR p.status IN ('DRAFT', 'APPROVED', 'SCHEDULED')
                ORDER BY p.created_at DESC LIMIT 40) t), '[]'::jsonb)
    );
END;
$$;

-- ROLLBACK:
--   ALTER TABLE public.social_posts DROP COLUMN IF EXISTS ig_body;
--   DROP FUNCTION IF EXISTS public.social_agent_create_draft(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT[], TEXT);
--   ja aja 2026-11-14_social_agent.sql (agentin funktiot) seka 2026-11-20_social_instagram.sql:n social_posts_guard uudelleen.
