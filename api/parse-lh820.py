"""
Vercel serverless function — POST /api/parse-lh820

Body JSON: { "bucket": "pdfs-renfe", "path": "lh820-temp/xxx.pdf" }

Variables de entorno requeridas (Vercel):
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
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
            bucket = body.get('bucket', 'pdfs-renfe')
            path   = body.get('path', '')
            if not path:
                return self._error(400, 'Falta path del fichero en Supabase Storage')

            url = os.environ['SUPABASE_URL'].rstrip('/') + f'/storage/v1/object/{bucket}/{path}'
            key = os.environ['SUPABASE_SERVICE_KEY']
            req = urllib.request.Request(url, headers={
                'Authorization': f'Bearer {key}',
                'apikey': key,
            })
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
