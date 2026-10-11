#!/usr/bin/env python3
"""Paikallinen kehityspalvelin, joka käyttäytyy kuten GitHub Pages.

Käyttö (repon juuressa):   python3 scripts/dev_server.py        # http://localhost:8099
                           python3 scripts/dev_server.py 8080   # toinen portti

Eroaa `python3 -m http.server`:stä näin:
  * /kohteet, /yhteys, /tarinamme ... toimivat ilman .html-päätettä (kuten GitHub Pagesissa)
  * tuntemattomat polut (esim. /kohteet/<slug>) palauttavat 404.html:n HTTP-tilalla 404 (kuten Pagesissa)
Kuuntelee vain osoitteessa 127.0.0.1 (ei näy lähiverkkoon).
"""
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class PagesHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p) and not os.path.splitext(p)[1] and os.path.isfile(p + '.html'):
            return p + '.html'
        return p

    def send_error(self, code, message=None, explain=None):
        page = os.path.join(ROOT, '404.html')
        if code == 404 and os.path.isfile(page):
            body = open(page, 'rb').read()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s\n' % (fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    print(f'Kehityspalvelin: http://localhost:{port}  (Ctrl+C pysäyttää)')
    ThreadingHTTPServer(('127.0.0.1', port), PagesHandler).serve_forever()
