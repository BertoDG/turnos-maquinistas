"""
Vercel serverless function — POST /api/parse-lh820

Acepta el PDF como cuerpo binario (application/octet-stream).
Si el header X-Compressed: deflate-raw está presente, descomprime
con zlib antes de parsear.

Devuelve JSON array de trenes.
"""

from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import tempfile
import zlib

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'scripts'))


class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length == 0:
                return self._error(400, 'PDF vacío')

            raw = self.rfile.read(length)

            # Descomprimir si el cliente lo envió comprimido
            if self.headers.get('X-Compressed') == 'deflate-raw':
                raw = zlib.decompress(raw, -zlib.MAX_WBITS)

            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
                tmp.write(raw)
                pdf_path = tmp.name

            try:
                from parse_lh820 import parse_lh820
                trenes = parse_lh820(pdf_path)
            finally:
                try:
                    os.unlink(pdf_path)
                except Exception:
                    pass

            body = json.dumps(trenes, ensure_ascii=False).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        except Exception as exc:
            self._error(500, str(exc))

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Compressed')

    def _error(self, code: int, msg: str):
        body = json.dumps({'error': msg}).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)
