-- ==============================================================================
-- Liidiagentin heti-laukaisin: uusi liidi kaynnistaa pilviagentin (Claude routine, API-trigger)
-- ==============================================================================
-- Ajetaan KASIN SQL Editorissa VASTA kun (a) migraatio 2026-10-18_lead_agent.sql on ajettu
-- ja (b) routine ja sen API-avain on luotu claude.ai:ssa.
-- Laukaisin lahettaa agentille vain tekstin "lead_id=<uuid>" (EI henkilotietoja).
-- Jos laukaisu epaonnistuu, liidin tallennus EI koskaan epaonnistu (virheet nielaistaan);
-- tuntiajastus kasittelee silloin liidin viiveella.
--
-- OHJE: korvaa alla <REITTI_ID> (routinen tunniste, esim. trig_01ABC...) ja <REITTI_AVAIN>
-- (API-trigger-avain, "sk-ant-oat01-...") ja aja. Avain tallentuu Supabasen Vaultiin.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT vault.create_secret('https://api.anthropic.com/v1/claude_code/routines/<REITTI_ID>/fire', 'lead_routine_url');
SELECT vault.create_secret('<REITTI_AVAIN>', 'lead_routine_token');

CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    u TEXT;
    t TEXT;
BEGIN
    BEGIN
        SELECT decrypted_secret INTO u FROM vault.decrypted_secrets WHERE name = 'lead_routine_url' LIMIT 1;
        SELECT decrypted_secret INTO t FROM vault.decrypted_secrets WHERE name = 'lead_routine_token' LIMIT 1;
        IF u IS NOT NULL AND t IS NOT NULL THEN
            PERFORM net.http_post(
                url := u,
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || t,
                    'anthropic-version', '2023-06-01',
                    'anthropic-beta', 'experimental-cc-routine-2026-04-01'),
                body := jsonb_build_object('text', 'Uusi liidi tallennettu. lead_id=' || NEW.id::text)
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        NULL; -- liidin tallennus ei saa koskaan epaonnistua laukaisimen takia
    END;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_new_lead() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_notify_new_lead ON public.leads;
CREATE TRIGGER trg_notify_new_lead
    AFTER INSERT ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();

-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_notify_new_lead ON public.leads;
--   DROP FUNCTION IF EXISTS public.notify_new_lead();
--   DELETE FROM vault.secrets WHERE name IN ('lead_routine_url', 'lead_routine_token');
