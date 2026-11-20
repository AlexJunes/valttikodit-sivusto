-- ==============================================================================
-- Analytiikan vinkkiagentin heti-kaynnistys (aja vasta kun pilviagentti on luotu)
-- ==============================================================================
-- Korvaa <REITTI_ID> (routinen tunniste trig_...) ja <REITTI_AVAIN> (API-trigger-avain sk-ant-oat01-...).
-- Avaimet tallentuvat Supabasen Vaultiin. Turvallinen ajaa uudelleen.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
DELETE FROM vault.secrets WHERE name IN ('insights_routine_url', 'insights_routine_token');
SELECT vault.create_secret('https://api.anthropic.com/v1/claude_code/routines/<REITTI_ID>/fire', 'insights_routine_url');
SELECT vault.create_secret('<REITTI_AVAIN>', 'insights_routine_token');
-- ROLLBACK: DELETE FROM vault.secrets WHERE name IN ('insights_routine_url', 'insights_routine_token');
