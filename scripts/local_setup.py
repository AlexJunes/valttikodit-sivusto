#!/usr/bin/env python3
"""Rakentaa PAIKALLISEN testitietokannan (Supabase CLI + Docker).

Käyttö (repon juuressa):   python3 scripts/local_setup.py
Vaatii: Docker Desktop käynnissä, `supabase start` ajettu (ks. docs/ymparistot.md).

Tekee: luo taulut (supabase/local/schema.sql), ajaa oikeussäännöt ja raporttifunktion
migraatioista, kopioi tuotannosta VAIN julkisen sisällön (julkaistut kohteet + sivutekstit,
anon-avaimella), lisää keksityt testiliidit ja -katselut sekä luo testiylläpitäjän.
Asiakkaiden oikeita liidejä EI kopioida. Idempotentti: voi ajaa uudelleen (tyhjentää testidatan).
Testiylläpitäjän tunnukset tallennetaan repon ulkopuolelle: ~/Claude/valttikodit-salaiset/local_admin.txt
"""
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_CONTAINER = 'supabase_db_valttikodit-local'
API = 'http://127.0.0.1:54321'
PROD_URL = 'https://xbeonksexpjvekqjxoph.supabase.co'
LOCAL_REPORT_TOKEN = 'local-report-token'
ADMIN_EMAIL = 'admin@valttikodit.test'
SECRETS_DIR = os.path.expanduser('~/Claude/valttikodit-salaiset')
SECRETS_FILE = os.path.join(SECRETS_DIR, 'local_admin.txt')


def docker_bin():
    for p in (os.path.expanduser('~/.docker/bin/docker'), '/usr/local/bin/docker', '/opt/homebrew/bin/docker'):
        if os.path.exists(p):
            return p
    return 'docker'


def psql(sql):
    r = subprocess.run([docker_bin(), 'exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'],
                       input=sql, text=True, capture_output=True)
    if r.returncode != 0:
        sys.exit('SQL-virhe:\n' + r.stderr)
    return r.stdout


def local_keys():
    try:
        out = subprocess.run(['supabase', 'status', '-o', 'json'], cwd=ROOT, capture_output=True, text=True,
                             env={**os.environ, 'PATH': os.path.expanduser('~/.docker/bin') + ':' + os.environ['PATH']}).stdout
        d = json.loads(out[out.index('{'):out.rindex('}') + 1])
        return d['SECRET_KEY'] if 'SECRET_KEY' in d else d['SERVICE_ROLE_KEY']
    except Exception as e:
        sys.exit('Paikallinen Supabase ei vastaa. Aja ensin: supabase start -x edge-runtime,logflare,vector,imgproxy,realtime,supavisor\n' + str(e))


def http(method, url, key, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read()
            return r.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def prod_public(table):
    cfg = open(os.path.join(ROOT, 'assets', 'js', 'config.js'), encoding='utf-8').read()
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'(sb_publishable_[^']+)'", cfg)
    status, data = http('GET', f'{PROD_URL}/rest/v1/{table}?select=*', key.group(1))
    if status != 200:
        sys.exit(f'Tuotannon julkisen {table}-datan haku epäonnistui: {status}')
    return data


def main():
    secret = local_keys()
    print('1/6 Poistetaan vanhat testitaulut ja luodaan rakenne...')
    psql('DROP TABLE IF EXISTS public.admin_users, public.leads, public.page_views, public.pages, public.projects, public.report_tokens, public.reference_cases CASCADE;'
         'DROP FUNCTION IF EXISTS public.is_site_admin() CASCADE; DROP FUNCTION IF EXISTS public.report_weekly(text) CASCADE;'
         'DROP POLICY IF EXISTS images_public_read ON storage.objects; DROP POLICY IF EXISTS images_admin_insert ON storage.objects;'
         'DROP POLICY IF EXISTS images_admin_update ON storage.objects; DROP POLICY IF EXISTS images_admin_delete ON storage.objects;')
    psql(open(os.path.join(ROOT, 'supabase', 'local', 'schema.sql'), encoding='utf-8').read())

    print('2/6 Ajetaan oikeussäännöt ja raporttifunktio migraatioista...')
    psql(open(os.path.join(ROOT, 'supabase', 'migrations', '2026-10-10_secure_rls.sql'), encoding='utf-8').read())
    psql(open(os.path.join(ROOT, 'supabase', 'migrations', '2026-10-10_report_weekly.sql'), encoding='utf-8').read().replace('<AVAIN>', LOCAL_REPORT_TOKEN))

    print('2b/6 Luodaan referenssitaulu ja esimerkkireferenssi...')
    for f in ('2026-10-11_reference_cases.sql', '2026-10-11_seed_sudenkorento.sql'):
        psql(open(os.path.join(ROOT, 'supabase', 'migrations', f), encoding='utf-8').read())

    print('3/6 Kopioidaan tuotannon julkinen sisältö (kohteet, sivut)...')
    for table in ('projects', 'pages'):
        data = prod_public(table)
        payload = json.dumps(data, ensure_ascii=False)
        assert '$j$' not in payload
        psql(f"INSERT INTO public.{table} SELECT * FROM json_populate_recordset(null::public.{table}, $j${payload}$j$::json);")
        print(f'     {table}: {len(data)} riviä')

    print('4/6 Lisätään keksityt testiliidit ja -katselut...')
    psql("""
INSERT INTO public.leads (name, email, phone, message, status) VALUES
 ('Testi Henkilö', 'testi1@example.test', '040 000 0001', E'LÄHDE: Ota yhteyttä -sivu\\n\\nTämä on keksitty testiliidi.', 'UUSI'),
 ('Maija Mallikas', 'testi2@example.test', '040 000 0002', E'LÄHDE: Myy tonttisi -sivu\\n\\nTontin osoite: Forsmaninranta 5\\nPostinumero: 91900\\nPaikkakunta: Liminka\\nKiinteistötunnus: 425-401-12-34\\nTontin koko (m²): 1200\\nKaavatilanne: Asemakaavoitettu\\n\\nKeksitty testiliidi.\\nTontilla on vanha varasto, joka on purkukuntoinen.\\n\\nOtattehan yhteyttä iltaisin.', 'UUSI'),
 ('Matti Meikäläinen', 'testi3@example.test', NULL, 'Keksitty käsitelty testiliidi.', 'KÄSITELTY');
INSERT INTO public.page_views (path, session_id, device_type, referrer, created_at)
SELECT (ARRAY['/index.html','/kohteet.html','/kohde.html?kohde=saunaranta_a','/yhteys.html','/tarinamme.html'])[1 + (g % 5)],
       'test-' || (g % 9), (ARRAY['Desktop','Mobiili','Tabletti'])[1 + (g % 3)],
       (ARRAY['Suora','Sisäinen','https://www.google.com/'])[1 + (g % 3)],
       now() - (g || ' hours')::interval
FROM generate_series(1, 60) g;
""")

    print('5/6 Luodaan testiylläpitäjä...')
    os.makedirs(SECRETS_DIR, exist_ok=True)
    if os.path.exists(SECRETS_FILE):
        password = re.search(r'salasana: (\S+)', open(SECRETS_FILE).read()).group(1)
    else:
        password = secrets.token_urlsafe(12)
    status, user = http('POST', f'{API}/auth/v1/admin/users', secret, {'email': ADMIN_EMAIL, 'password': password, 'email_confirm': True})
    if status in (200, 201):
        uid = user['id']
    else:  # on jo olemassa -> haetaan id
        _, lst = http('GET', f'{API}/auth/v1/admin/users?per_page=200', secret)
        uid = next(u['id'] for u in lst['users'] if u['email'] == ADMIN_EMAIL)
        http('PUT', f'{API}/auth/v1/admin/users/{uid}', secret, {'password': password})
    psql(f"INSERT INTO public.admin_users (id, email, role) VALUES ('{uid}', '{ADMIN_EMAIL}', 'admin') ON CONFLICT (id) DO NOTHING;")
    with open(SECRETS_FILE, 'w') as f:
        f.write(f'Paikallinen testiylläpito (vain localhost, ei tuotantoon)\nsähköposti: {ADMIN_EMAIL}\nsalasana: {password}\n')
    os.chmod(SECRETS_FILE, 0o600)

    print('6/6 Tarkistus...')
    print(psql("SELECT 'projects' t, count(*) FROM public.projects UNION ALL SELECT 'pages', count(*) FROM public.pages UNION ALL SELECT 'leads', count(*) FROM public.leads UNION ALL SELECT 'page_views', count(*) FROM public.page_views UNION ALL SELECT 'admin_users', count(*) FROM public.admin_users UNION ALL SELECT 'reference_cases', count(*) FROM public.reference_cases;"))
    print('Valmis. Testiylläpitäjän tunnukset: ' + SECRETS_FILE)


if __name__ == '__main__':
    main()
