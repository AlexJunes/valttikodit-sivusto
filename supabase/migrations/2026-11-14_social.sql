-- ==============================================================================
-- Some-hallinta (vaihe A): kampanjat, julkaisut ja tapahtumaloki
-- ==============================================================================
-- Ajetaan KASIN Supabase SQL Editorissa. Vaatii: funktio public.is_site_admin().
-- Facebook-avainta EI tallenneta tietokantaan: se on Edge Functionin salaisuus.
-- Tilasiirtymat: DRAFT -> APPROVED -> SCHEDULED -> PUBLISHED. Tilat SCHEDULED, PUBLISHED ja FAILED
-- voi asettaa vain julkaisupalvelu (service role), ei selain.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.social_campaigns (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    name       text NOT NULL,
    slug       text NOT NULL UNIQUE,                 -- kaytetaan utm_campaign-arvona
    goal       text,
    project_slug text,
    starts_on  date,
    ends_on    date,
    status     text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS public.social_posts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    created_by   text,
    campaign_id  uuid REFERENCES public.social_campaigns (id) ON DELETE SET NULL,
    channel      text NOT NULL DEFAULT 'facebook' CHECK (channel IN ('facebook')),
    title        text NOT NULL,                      -- sisainen nimi (myos utm_content)
    body         text NOT NULL DEFAULT '',
    image_url    text,
    link_kind    text,                               -- kohde | referenssi | tontti | muu
    link_slug    text,
    link_url     text,                               -- valmis UTM-linkki
    scheduled_at timestamptz,
    status       text NOT NULL DEFAULT 'DRAFT'
                 CHECK (status IN ('DRAFT', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'CANCELLED', 'FAILED')),
    approved_by  text,
    approved_at  timestamptz,
    fb_post_id   text,
    fb_permalink text,
    published_at timestamptz,
    last_error   text
);
CREATE INDEX IF NOT EXISTS idx_social_posts_status ON public.social_posts (status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.social_audit (
    id      bigserial PRIMARY KEY,
    at      timestamptz NOT NULL DEFAULT now(),
    actor   text,
    action  text NOT NULL,
    post_id uuid,
    details jsonb
);
CREATE INDEX IF NOT EXISTS idx_social_audit_post ON public.social_audit (post_id, at);

ALTER TABLE public.social_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_audit     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_campaigns_admin_all" ON public.social_campaigns;
DROP POLICY IF EXISTS "social_posts_admin_all" ON public.social_posts;
DROP POLICY IF EXISTS "social_audit_admin_read" ON public.social_audit;

CREATE POLICY "social_campaigns_admin_all" ON public.social_campaigns
    FOR ALL TO authenticated USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());
CREATE POLICY "social_posts_admin_all" ON public.social_posts
    FOR ALL TO authenticated USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());
-- Lokia voi vain lukea; rivit kirjoittaa laukaisin
CREATE POLICY "social_audit_admin_read" ON public.social_audit
    FOR SELECT TO authenticated USING (public.is_site_admin());

-- Suojalaukaisin: selain ei voi esittaa julkaisua ajastetuksi tai julkaistuksi eika kirjoittaa Facebook-tunnisteita
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
        END IF;
        NEW.created_by := who;
        RETURN NEW;
    END IF;

    NEW.updated_at := now();
    IF NOT is_service THEN
        IF NEW.status IN ('SCHEDULED', 'PUBLISHED', 'FAILED') AND NEW.status IS DISTINCT FROM OLD.status THEN
            RAISE EXCEPTION 'tilan % asettaa vain julkaisupalvelu', NEW.status USING ERRCODE = '42501';
        END IF;
        NEW.fb_post_id := OLD.fb_post_id; NEW.fb_permalink := OLD.fb_permalink;
        NEW.published_at := OLD.published_at; NEW.last_error := OLD.last_error;

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

DROP TRIGGER IF EXISTS trg_social_posts_guard ON public.social_posts;
CREATE TRIGGER trg_social_posts_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.social_posts
    FOR EACH ROW EXECUTE FUNCTION public.social_posts_guard();

-- Tapahtumaloki
CREATE OR REPLACE FUNCTION public.social_posts_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    who text := COALESCE(auth.jwt() ->> 'email', 'julkaisupalvelu');
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

DROP TRIGGER IF EXISTS trg_social_posts_audit ON public.social_posts;
CREATE TRIGGER trg_social_posts_audit
    AFTER INSERT OR UPDATE OR DELETE ON public.social_posts
    FOR EACH ROW EXECUTE FUNCTION public.social_posts_audit();

-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_social_posts_audit ON public.social_posts;
--   DROP TRIGGER IF EXISTS trg_social_posts_guard ON public.social_posts;
--   DROP FUNCTION IF EXISTS public.social_posts_audit();
--   DROP FUNCTION IF EXISTS public.social_posts_guard();
--   DROP TABLE IF EXISTS public.social_audit, public.social_posts, public.social_campaigns;
