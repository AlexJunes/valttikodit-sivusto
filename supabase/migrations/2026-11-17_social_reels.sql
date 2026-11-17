-- Some: Reels-videot. Julkaisulla voi olla video (video_url); silloin se ajastetaan Facebookiin Reels-videona.
-- Aja Supabasen SQL Editorissa. Turvallinen ajaa uudelleen.
-- Peruutus: ALTER TABLE public.social_posts DROP COLUMN video_url; ja aja 2026-11-14_social_agent.sql:n social_posts_guard uudelleen.

ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.social_posts DROP CONSTRAINT IF EXISTS social_posts_video_url_https;
ALTER TABLE public.social_posts ADD CONSTRAINT social_posts_video_url_https CHECK (video_url IS NULL OR video_url ~ '^https://');

-- Suojalaukaisin: videon vaihto on sisaltomuutos (mitatoi hyvaksynnan, estetty ajastetulle)
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

        content_changed := (NEW.title, NEW.body, NEW.image_url, NEW.video_url, NEW.link_url, NEW.scheduled_at, NEW.campaign_id)
                           IS DISTINCT FROM (OLD.title, OLD.body, OLD.image_url, OLD.video_url, OLD.link_url, OLD.scheduled_at, OLD.campaign_id);

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
