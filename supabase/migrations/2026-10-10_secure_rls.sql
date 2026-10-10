-- ==============================================================================
-- RLS-KORJAUS: sulkee julkisen kirjoitus-/lukuoikeuden (leads, projects, pages,
-- page_views, admin_users, storage 'images').
-- Ajetaan KÄSIN Supabase SQL Editorissa. TEE VARMUUSKOPIO ENSIN.
--
-- EI KOSKE muihin tauluihin (contractors, labor_logs, project_*, safety_inspections,
-- site_diaries, tasks, report_tokens) -- ne kuuluvat toiselle sovellukselle.
--
-- Periaate:
--   * Julkinen (anon): saa LUKEA julkaistut kohteet ja sivusisällön, saa LISÄTÄ liidin
--     ja sivukatselun (rajatuilla kentillä). Ei muuta.
--   * Ylläpito: vain kirjautunut käyttäjä, jonka sähköposti on taulussa admin_users.
-- ==============================================================================

-- 1. Apufunktio: onko kirjautunut käyttäjä ylläpitäjä
CREATE OR REPLACE FUNCTION public.is_site_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admin_users a
        WHERE lower(a.email) = lower(COALESCE(auth.jwt() ->> 'email', ''))
    );
$$;

REVOKE ALL ON FUNCTION public.is_site_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_site_admin() TO authenticated;

-- 2. Poista KAIKKI nykyiset käytännöt näiltä viideltä taululta
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('leads', 'projects', 'pages', 'page_views', 'admin_users')
    LOOP
        EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

ALTER TABLE public.leads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- 3. LEADS: julkinen voi vain lisätä (rajatuin kentin), ylläpito hallitsee kaikkea
CREATE POLICY "leads_public_insert" ON public.leads
    FOR INSERT TO anon, authenticated
    WITH CHECK (
        status = 'UUSI'
        AND char_length(name) BETWEEN 1 AND 200
        AND char_length(email) BETWEEN 3 AND 254 AND position('@' in email) > 1
        AND (phone IS NULL OR char_length(phone) <= 50)
        AND (message IS NULL OR char_length(message) <= 5000)
    );

CREATE POLICY "leads_admin_all" ON public.leads
    FOR ALL TO authenticated
    USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

-- 4. PROJECTS: julkinen näkee vain julkaistut, ylläpito kaiken
CREATE POLICY "projects_public_read_published" ON public.projects
    FOR SELECT TO anon, authenticated
    USING (published = true);

CREATE POLICY "projects_admin_all" ON public.projects
    FOR ALL TO authenticated
    USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

-- 5. PAGES (CMS): julkinen lukee, vain ylläpito muokkaa
CREATE POLICY "pages_public_read" ON public.pages
    FOR SELECT TO anon, authenticated
    USING (true);

CREATE POLICY "pages_admin_all" ON public.pages
    FOR ALL TO authenticated
    USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

-- 6. PAGE_VIEWS: julkinen voi vain lisätä, vain ylläpito lukee/poistaa
CREATE POLICY "page_views_public_insert" ON public.page_views
    FOR INSERT TO anon, authenticated
    WITH CHECK (char_length(path) BETWEEN 1 AND 500);

CREATE POLICY "page_views_admin_all" ON public.page_views
    FOR ALL TO authenticated
    USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

-- 7. ADMIN_USERS: vain ylläpitäjät
CREATE POLICY "admin_users_admin_all" ON public.admin_users
    FOR ALL TO authenticated
    USING (public.is_site_admin()) WITH CHECK (public.is_site_admin());

-- 8. STORAGE 'images': julkinen lukee, vain ylläpito lataa/muuttaa/poistaa
DROP POLICY IF EXISTS "Salli kuvien lataus"   ON storage.objects;
DROP POLICY IF EXISTS "Salli kuvien luku"     ON storage.objects;
DROP POLICY IF EXISTS "Salli kuvien muokkaus" ON storage.objects;
DROP POLICY IF EXISTS "Salli kuvien poisto"   ON storage.objects;

CREATE POLICY "images_public_read" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'images');

CREATE POLICY "images_admin_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'images' AND public.is_site_admin());

CREATE POLICY "images_admin_update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'images' AND public.is_site_admin())
    WITH CHECK (bucket_id = 'images' AND public.is_site_admin());

CREATE POLICY "images_admin_delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'images' AND public.is_site_admin());

-- ==============================================================================
-- HÄTÄPALAUTUS jos ylläpito ei pääse sisään (ajetaan vain jos välttämätöntä):
--   Tarkista että kirjautuneen sähköposti on admin_users-taulussa:
--     SELECT email FROM public.admin_users;
--   Palautus tilapäisesti (SUOJAAMATON, korjaa heti):
--     CREATE POLICY "tmp_auth_all" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- ==============================================================================
