-- ==============================================================================
-- Some: markkinoinnin tavoitteet (yllapito asettaa, some-agentti lukee)
-- ==============================================================================
-- Aja Supabasen SQL Editorissa. Vaatii 2026-11-20_social_ig_text.sql. Turvallinen ajaa uudelleen.
-- Yksi voimassa oleva tavoiterivi (id = 1). Muutokset kirjataan social_audit-lokiin.
-- Agentti saa tavoitteet social_agent_context-funktiosta vain, jos ne ovat voimassa (valid_until).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.social_goals (
    id             int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    focus_projects text[] NOT NULL DEFAULT '{}',
    focus_note     text CHECK (focus_note IS NULL OR length(focus_note) <= 500),
    priorities     jsonb NOT NULL DEFAULT '{"myynti": 2, "tontit": 1, "seuraajat": 1, "luottamus": 1}'::jsonb,
    weekly_message text CHECK (weekly_message IS NULL OR length(weekly_message) <= 500),
    avoid          text CHECK (avoid IS NULL OR length(avoid) <= 500),
    valid_until    date,
    updated_by     text,
    updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.social_goals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_goals_admin_all" ON public.social_goals;
CREATE POLICY "social_goals_admin_all" ON public.social_goals
    FOR ALL TO authenticated USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());
REVOKE ALL ON public.social_goals FROM anon;

-- Paivittaja ja aika asetetaan aina palvelimella; muutos kirjataan lokiin
CREATE OR REPLACE FUNCTION public.social_goals_stamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.updated_by := COALESCE(auth.jwt() ->> 'email', 'system');
    NEW.updated_at := now();
    INSERT INTO public.social_audit (actor, action, post_id, details)
    VALUES (NEW.updated_by, 'tavoitteet paivitetty', NULL, jsonb_build_object(
        'focus_projects', NEW.focus_projects, 'focus_note', NEW.focus_note, 'priorities', NEW.priorities,
        'weekly_message', NEW.weekly_message, 'avoid', NEW.avoid, 'valid_until', NEW.valid_until));
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS social_goals_stamp ON public.social_goals;
CREATE TRIGGER social_goals_stamp BEFORE INSERT OR UPDATE ON public.social_goals
    FOR EACH ROW EXECUTE FUNCTION public.social_goals_stamp();

-- Agentin konteksti: lisatty voimassa olevat tavoitteet
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
        'goals', (SELECT jsonb_build_object(
                    'focus_projects', g.focus_projects, 'focus_note', g.focus_note, 'priorities', g.priorities,
                    'weekly_message', g.weekly_message, 'avoid', g.avoid, 'valid_until', g.valid_until,
                    'updated_by', g.updated_by, 'updated_at', g.updated_at)
                  FROM public.social_goals g
                  WHERE g.id = 1 AND (g.valid_until IS NULL OR g.valid_until >= (NOW() AT TIME ZONE 'Europe/Helsinki')::date)),
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
--   DROP TABLE IF EXISTS public.social_goals; DROP FUNCTION IF EXISTS public.social_goals_stamp();
--   ja aja 2026-11-20_social_ig_text.sql:n social_agent_context uudelleen.
