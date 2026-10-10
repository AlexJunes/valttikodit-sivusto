-- HUOM: Tämä on käsikirjan mukainen TAVOITESKEEMA (referenssi), ei välttämättä vastaa tuotannon todellista tilaa.
-- Tarkista todellinen skeema Supabasesta ennen käyttöä. Älä aja tuotantoon sellaisenaan.

-- ==============================================================================
-- VALTTIKODIT.FI - DATABASE SCHEMA DDL
-- ==============================================================================

-- 1. TAULU: projects (Asuntokohteet)
CREATE TABLE IF NOT EXISTS public.projects (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    location TEXT,
    address TEXT,
    area TEXT,
    area_other TEXT,
    type TEXT,
    price NUMERIC,
    status TEXT DEFAULT 'AVAILABLE', -- 'MARKETING', 'AVAILABLE', 'CONSTRUCTION', 'RESERVED', 'SOLD'
    room_setup TEXT,
    ingress TEXT,
    description TEXT,
    published BOOLEAN DEFAULT false,
    hero_image TEXT,
    gallery_images JSONB DEFAULT '[]'::jsonb,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_slug ON public.projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_published ON public.projects(published);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- 2. TAULU: pages (Dynaaminen CMS)
CREATE TABLE IF NOT EXISTS public.pages (
    id BIGSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE, -- 'index', 'valtti-tapa', 'yhteys', 'kohde'
    content JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pages_slug ON public.pages(slug);

-- 3. TAULU: leads (Asiakasyhteydenotot ja varaukset)
CREATE TABLE IF NOT EXISTS public.leads (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    message TEXT,
    status TEXT DEFAULT 'UUSI' NOT NULL -- 'UUSI', 'KÄSITELTY'
);

CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);

-- 4. TAULU: page_views (GDPR-analytiikka)
CREATE TABLE IF NOT EXISTS public.page_views (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    path TEXT NOT NULL,
    session_id TEXT,
    device_type TEXT,
    referrer TEXT
);

CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON public.page_views(path);

-- 5. TAULU: admin_users (Ylläpitäjät)
CREATE TABLE IF NOT EXISTS public.admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    role TEXT DEFAULT 'admin' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
