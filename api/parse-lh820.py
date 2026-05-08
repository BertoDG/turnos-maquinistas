"""
Vercel serverless function — POST /api/parse-lh820

Body JSON: { "url": "<signed_url_de_supabase_storage>" }
El cliente genera una URL firmada temporal (5 min) y la pasa aquí.
El servidor descarga el PDF sin necesitar credenciales.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import tempfile
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            url  = body.get('url', '')
            if not url:
                return self._error(400, 'Falta url del fichero')

            # URL firmada de Supabase Storage — no necesita auth headers
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req) as resp:
                pdf_bytes = resp.read()

            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                tmp.write(pdf_bytes)
                pdf_path = tmp.name

            try:
                from parse_lh820 import parse_lh820
                trenes = parse_lh820(pdf_path)
            finally:
                try:
                    os.unlink(pdf_path)
                except Exception:
                    pass

            result = json.dumps(trenes, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(result)))
            self._cors()
            self.end_headers()
            self.wfile.write(result)

        except KeyError as exc:
            self._error(500, f'Variable de entorno no configurada: {exc}')
        except Exception as exc:
            self._error(500, str(exc))

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey')

    def _error(self, code: int, msg: str):
        body = json.dumps({'error': msg}).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)
