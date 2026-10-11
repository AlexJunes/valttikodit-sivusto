#!/usr/bin/env python3
"""Luo docs/TILA.md suoraan repon koodista (deterministinen, ei aikaleimoja).

Aja repon juuressa:   python3 scripts/update_docs.py
Tarkistus (ei kirjoita, palauttaa 1 jos TILA.md on vanhentunut):   python3 scripts/update_docs.py --check

TILA.md on GENEROITU: älä muokkaa käsin. Käsin kirjoitettu selitysdokumentaatio on
docs/arkkitehtuuri.md, docs/tietokanta.md, docs/tietoturva.md, docs/agentit.md.
"""
import glob
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'TILA.md')


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()


def cell(v):
    return str(v).replace('|', '\\|')


def first(pattern, text, flags=re.S | re.I):
    m = re.search(pattern, text, flags)
    return re.sub(r'\s+', ' ', m.group(1)).strip() if m else None


def html_pages():
    pages = sorted(glob.glob(os.path.join(ROOT, '*.html')))
    admin = sorted(glob.glob(os.path.join(ROOT, 'admin', '*.html')))
    return [os.path.relpath(p, ROOT) for p in pages], [os.path.relpath(p, ROOT) for p in admin]


def page_info(path):
    h = read(path)
    cms = sorted(set(re.findall(r'data-cms="([^"]+)"', h)))
    gcms = sorted(set(re.findall(r'data-global-cms="([^"]+)"', h)))
    og = sorted(set(re.findall(r'<meta\s+property="(og:[a-z_:]+)"', h)))
    return {
        'title': first(r'<title>(.*?)</title>', h),
        'desc': first(r'<meta\s+name="description"\s+content="(.*?)"', h),
        'canonical': first(r'<link\s+rel="canonical"\s+href="(.*?)"', h),
        'og': og,
        'h1': len(re.findall(r'<h1[\s>]', h)),
        'cms': cms,
        'gcms': gcms,
        'forms': sorted(set(re.findall(r'<form[^>]*action="([^"]+)"', h))),
        'scripts': sorted(set(re.sub(r'\?v=[0-9a-f]+$', '', u) for u in re.findall(r'<script[^>]*src="([^"]+)"', h))),
        'jsonld': 'application/ld+json' in h,
    }


def js_usage():
    rows = []
    for path in sorted(glob.glob(os.path.join(ROOT, 'assets', 'js', '*.js'))):
        t = read(os.path.relpath(path, ROOT))
        tables = {}
        for m in re.finditer(r"(?<!storage)\.from\('([a-z_]+)'\)([^;]{0,250})", t):
            name, rest = m.group(1), m.group(2)
            if name == 'images':
                continue
            ops = tables.setdefault(name, set())
            for op in ('select', 'insert', 'update', 'delete', 'upsert'):
                if '.' + op + '(' in rest:
                    ops.add(op)
        rpcs = sorted(set(re.findall(r"\.rpc\('([a-zA-Z_]+)'", t)))
        storage = sorted(set(re.findall(r"storage\s*\.from\('([a-z_]+)'\)", t)))
        keys = sorted(set(re.findall(r"(?:local|session)Storage\.(?:get|set|remove)Item\('([^']+)'", t))
                      | set(re.findall(r"(?:CONSENT|SESSION|STORAGE)_KEY\s*=\s*'([^']+)'", t)))
        rows.append((os.path.relpath(path, ROOT), tables, rpcs, storage, keys))
    return rows


def external_hosts():
    hosts = set()
    for p in sorted(glob.glob(os.path.join(ROOT, '**', '*.html'), recursive=True)):
        rel = os.path.relpath(p, ROOT)
        if rel.startswith(('docs', 'app', 'utils')):
            continue
        for u in re.findall(r'(?:src|href)="(https?://[^"/]+)', read(rel)):
            hosts.add(u)
    return sorted(hosts)


def main():
    pages, admin = html_pages()
    L = []
    w = L.append
    w('# TILA – automaattisesti generoitu tuotantotila')
    w('')
    w('> **Älä muokkaa käsin.** Tämä tiedosto luodaan komennolla `python3 scripts/update_docs.py` suoraan repon koodista, ja se päivitetään jokaisen muutoksen yhteydessä (ks. `CLAUDE.md`). Selitykset: `docs/arkkitehtuuri.md`, `docs/tietokanta.md`, `docs/tietoturva.md`, `docs/agentit.md`.')
    w('')
    cname = read('CNAME').strip()
    w(f'- **Domain (CNAME):** `{cname}`')
    w(f"- **404.html-reititys (`/kohteet/<slug>` -> `kohde.html?kohde=<slug>`):** {'kyllä' if 'rewrite=true' in read('404.html') else 'EI LÖYDY – tarkista!'}")
    w('')

    w('## Julkiset sivut')
    w('')
    w('| Sivu | Title | Description (merkkiä) | Canonical | OG-tageja | h1 | Schema | Lomake | CMS-kenttiä |')
    w('|---|---|---|---|---|---|---|---|---|')
    for p in pages:
        i = page_info(p)
        w(f"| `{p}` | {cell(i['title'] or '–')} | {len(i['desc']) if i['desc'] else '–'} | {'kyllä' if i['canonical'] else '–'} | {len(i['og'])} | {i['h1']} | {'kyllä' if i['jsonld'] else '–'} | {', '.join(i['forms']) or '–'} | {len(i['cms'])} |")
    w('')
    w('### CMS-kentät (`data-cms`) sivuittain')
    w('')
    for p in pages:
        i = page_info(p)
        if i['cms'] or i['gcms']:
            w(f"- `{p}`: " + ', '.join(i['cms']) + (f" | globaalit: {', '.join(i['gcms'])}" if i['gcms'] else ''))
    w('')

    w('## Ylläpitosivut (`admin/`)')
    w('')
    for p in admin:
        i = page_info(p)
        w(f"- `{p}` – {cell(i['title'] or '–')}")
    w('')

    w('## JavaScript: tietokanta- ja selaintallennuskäyttö')
    w('')
    w('| Tiedosto | Taulut (operaatiot) | RPC | Storage | local/sessionStorage-avaimet |')
    w('|---|---|---|---|---|')
    for path, tables, rpcs, storage, keys in js_usage():
        t = '; '.join(f"{n} ({', '.join(sorted(o)) or 'viittaus'})" for n, o in sorted(tables.items())) or '–'
        w(f"| `{path}` | {t} | {', '.join(rpcs) or '–'} | {', '.join(storage) or '–'} | {', '.join(keys) or '–'} |")
    w('')

    w('## Ulkoiset riippuvuudet (isännät HTML:ssä)')
    w('')
    for h in external_hosts():
        w(f'- {h}')
    w('')

    w('## Sitemap ja robots')
    w('')
    for loc in re.findall(r'<loc>([^<]+)</loc>', read('sitemap.xml')):
        w(f'- {loc}')
    w('')
    w('robots.txt:')
    w('')
    w('```')
    w(read('robots.txt').strip())
    w('```')
    w('')

    w('## Tietokantamigraatiot (supabase/migrations)')
    w('')
    w('Lueteltu tiedostot, jotka on kirjattu repoon. Tuotantoon ne ajetaan käsin Supabase SQL Editorissa; ks. `docs/tietokanta.md`.')
    w('')
    for p in sorted(glob.glob(os.path.join(ROOT, 'supabase', 'migrations', '*.sql'))):
        name = os.path.basename(p)
        head = first(r'^--\s*(.*?)\n', read(os.path.join('supabase', 'migrations', name)), re.M) or ''
        w(f'- `{name}` – {head}')
    w('')

    w('## Repon rakenne (ylin taso)')
    w('')
    for n in sorted(os.listdir(ROOT)):
        if n in ('.git', '.DS_Store'):
            continue
        w(f"- `{n}{'/' if os.path.isdir(os.path.join(ROOT, n)) else ''}`")
    w('')

    text = '\n'.join(L)
    if len(sys.argv) > 1 and sys.argv[1] == '--check':
        cur = open(OUT, encoding='utf-8').read() if os.path.exists(OUT) else ''
        if cur != text:
            print('docs/TILA.md on vanhentunut. Aja: python3 scripts/update_docs.py')
            sys.exit(1)
        print('docs/TILA.md on ajan tasalla.')
        return
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(text)
    print('Päivitetty:', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
