-- ==============================================================================
-- Liidiagentin tietokantatuki (luku ja luokittelu, rajatut funktiot)
-- ==============================================================================
-- Ajetaan KASIN Supabase SQL Editorissa. Vaatii taulun public.leads.
-- HUOM: tama antaa agentille paasyn liidien HENKILOTIETOIHIN (nimi, sahkoposti,
-- puhelin, viesti), joten kaytetaan ERI avainta kuin raporttifunktioissa.
--
-- OHJE:
-- 1. Luo avain Terminalissa:   openssl rand -hex 24
-- 2. Korvaa alla kohta  <AVAIN>  luomallasi avaimella (EI committiin, vain SQL Editoriin).
-- 3. Tallenna avain salasanahallintaan; sama avain annetaan agentin ymparistomuuttujaksi
--    LEAD_AGENT_TOKEN (claude.ai -> pilviymparisto).
-- 4. Aja koko skripti.
-- Tama skripti merkitsee kaikki NYKYISET liidit "SKIPPED"-tilaan, jotta agentti kasittelee
-- vain tulevat liidit.
-- ==============================================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS agent_status text;        -- NULL | PROCESSING | DONE | FAILED | SKIPPED
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS agent_claimed_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS agent_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS agent_processed_at timestamptz;

-- Vanhat liidit eivat kuulu agentille
UPDATE public.leads SET agent_status = 'SKIPPED' WHERE agent_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_agent_status ON public.leads (agent_status, created_at);

-- Avaimen tiiviste (itse avainta ei tallenneta); RLS paalla ilman kaytantoja
CREATE TABLE IF NOT EXISTS public.agent_tokens (
    id         SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    token_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.agent_tokens ENABLE ROW LEVEL SECURITY;

INSERT INTO public.agent_tokens (id, token_hash)
VALUES (1, encode(sha256(convert_to('<AVAIN>', 'UTF8')), 'hex'))
ON CONFLICT (id) DO UPDATE SET token_hash = EXCLUDED.token_hash, created_at = NOW();

-- Hakee ja VARAA kasittelemattomat liidit (rinnakkaiset ajot eivat saa samaa liidia).
-- Varaus vanhenee 30 min jalkeen; enintaan 3 yritysta, sen jalkeen tila FAILED.
CREATE OR REPLACE FUNCTION public.agent_get_leads(p_token TEXT, p_limit INTEGER DEFAULT 10)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    ok BOOLEAN;
    result JSONB;
BEGIN
    SELECT (token_hash = encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex'))
      INTO ok FROM public.agent_tokens WHERE id = 1;
    IF ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
    END IF;

    -- yli 3 yritysta kaatuneet -> FAILED
    UPDATE public.leads SET agent_status = 'FAILED'
     WHERE agent_status = 'PROCESSING' AND agent_attempts >= 3
       AND agent_claimed_at < NOW() - INTERVAL '30 minutes';

    WITH picked AS (
        SELECT id FROM public.leads
         WHERE (agent_status IS NULL
                OR (agent_status = 'PROCESSING' AND agent_claimed_at < NOW() - INTERVAL '30 minutes' AND agent_attempts < 3))
         ORDER BY created_at
         LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 10), 20))
         FOR UPDATE SKIP LOCKED
    ), upd AS (
        UPDATE public.leads l
           SET agent_status = 'PROCESSING', agent_claimed_at = NOW(), agent_attempts = l.agent_attempts + 1
          FROM picked WHERE l.id = picked.id
        RETURNING l.id, l.created_at, l.name, l.email, l.phone, l.message, l.status
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', id, 'created_at', created_at, 'name', name, 'email', email,
               'phone', phone, 'message', message, 'status', status) ORDER BY created_at), '[]'::jsonb)
      INTO result FROM upd;

    RETURN result;
END;
$$;

-- Merkitsee varatun liidin kasitellyksi ja tallentaa luokan. Ei muuta mitaan muuta.
CREATE OR REPLACE FUNCTION public.agent_mark_lead(p_token TEXT, p_lead_id UUID, p_category TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    ok BOOLEAN;
    n INTEGER;
BEGIN
    SELECT (token_hash = encode(sha256(convert_to(COALESCE(p_token, ''), 'UTF8')), 'hex'))
      INTO ok FROM public.agent_tokens WHERE id = 1;
    IF ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
    END IF;

    IF p_category IS NULL OR p_category NOT IN ('TALON_OSTAJA', 'TONTIN_MYYJA', 'ALIHANKKIJA', 'MUU', 'ROSKAPOSTI') THEN
        RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023';
    END IF;

    UPDATE public.leads
       SET category = p_category, agent_status = 'DONE', agent_processed_at = NOW()
     WHERE id = p_lead_id AND agent_status = 'PROCESSING';
    GET DIAGNOSTICS n = ROW_COUNT;

    RETURN jsonb_build_object('updated', n);
END;
$$;

REVOKE ALL ON FUNCTION public.agent_get_leads(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agent_mark_lead(TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_get_leads(TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION public.agent_mark_lead(TEXT, UUID, TEXT) TO anon;

-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.agent_get_leads(TEXT, INTEGER);
--   DROP FUNCTION IF EXISTS public.agent_mark_lead(TEXT, UUID, TEXT);
--   DROP TABLE IF EXISTS public.agent_tokens;
--   ALTER TABLE public.leads DROP COLUMN IF EXISTS category, DROP COLUMN IF EXISTS agent_status,
--       DROP COLUMN IF EXISTS agent_claimed_at, DROP COLUMN IF EXISTS agent_attempts, DROP COLUMN IF EXISTS agent_processed_at;
