-- ==============================================================================
-- Some-tilastojen yoajo (pg_cron -> Edge Function social-publish, toiminto "sync")
-- ==============================================================================
-- Ajetaan KASIN SQL Editorissa VASTA kun (a) 2026-11-14_social_metrics.sql on ajettu, (b) funktioon on lisatty
-- salaisuus CRON_SECRET (sama arvo kuin <CRON_SECRET> alla) ja (c) funktion "Enforce JWT Verification" on pois paalta
-- (funktio tunnistaa kutsujan itse: yllapitajan istunto + MFA tai x-cron-secret).
-- Korvaa <CRON_SECRET> ja <FUNKTION_OSOITE> (https://<projekti>.supabase.co/functions/v1/social-publish).
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DELETE FROM vault.secrets WHERE name IN ('social_function_url', 'social_cron_secret');
SELECT vault.create_secret('<FUNKTION_OSOITE>', 'social_function_url');
SELECT vault.create_secret('<CRON_SECRET>', 'social_cron_secret');

-- Joka yo klo 01:00 UTC (03:00 / 04:00 Suomen aikaa)
SELECT cron.unschedule('social-metrics-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social-metrics-sync');
SELECT cron.schedule('social-metrics-sync', '0 1 * * *', 'SELECT public.social_cron_sync()');

-- ROLLBACK:
--   SELECT cron.unschedule('social-metrics-sync');
--   DELETE FROM vault.secrets WHERE name IN ('social_function_url', 'social_cron_secret');
