#!/usr/bin/env python3
"""Lisää CSS/JS-linkkeihin sisältöön perustuvan versiotunnisteen (?v=<hash>), jotta selain hakee muuttuneen tiedoston heti.

GitHub Pages välimuistittaa tiedostot 10 minuutiksi; ilman versiotunnistetta kävijä voi saada uuden HTML:n mutta vanhan
CSS:n/JS:n ja sivu näyttää rikkinäiseltä. Tunniste muuttuu vain kun tiedoston sisältö muuttuu.
Aja repon juuressa:  python3 scripts/bump_assets.py     (git pre-commit -hook ajaa tämän automaattisesti)
"""
import glob
import hashlib
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAT = re.compile(r'((?:src|href)="(?:\.\./)?assets/(?:css|js)/([A-Za-z0-9_-]+\.(?:css|js)))(?:\?v=[0-9a-f]+)?(")')


def short_hash(rel):
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return hashlib.sha1(f.read()).hexdigest()[:8]


def main():
    files = sorted(glob.glob(os.path.join(ROOT, '*.html')) + glob.glob(os.path.join(ROOT, 'admin', '*.html')))
    changed = 0
    for path in files:
        s = open(path, encoding='utf-8').read()

        def repl(m):
            kind = 'css' if m.group(2).endswith('.css') else 'js'
            rel = f'assets/{kind}/{m.group(2)}'
            if not os.path.exists(os.path.join(ROOT, rel)):
                return m.group(0)
            return f'{m.group(1)}?v={short_hash(rel)}{m.group(3)}'

        n = PAT.sub(repl, s)
        if n != s:
            open(path, 'w', encoding='utf-8').write(n)
            changed += 1
    print(f'Versiotunnisteet päivitetty: {changed} tiedostoa')


if __name__ == '__main__':
    main()
