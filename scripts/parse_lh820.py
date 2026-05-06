#!/usr/bin/env python3
"""
parse_lh820.py — Parser del Libro Horario AM 820 (Anejo 5)
Extrae los datos de trenes del PDF y los exporta como JSON listo
para importar en la tabla lh_trenes de Supabase.

Uso:
    pip install pdfplumber
    python parse_lh820.py "LH AM 820 0820_23 Consolidado An 5.pdf" -o lh820_trenes.json
    python parse_lh820.py "LH AM 820 0820_23 Consolidado An 5.pdf" --supabase

Variables de entorno para --supabase:
    SUPABASE_URL=https://xxxxx.supabase.co
    SUPABASE_SERVICE_KEY=eyJhbGci...
"""

import re
import json
import argparse
import os
import sys
from pathlib import Path
from typing import Optional

try:
    import pdfplumber
except ImportError:
    print("ERROR: Instala pdfplumber con: pip install pdfplumber")
    sys.exit(1)


# ── Constantes ────────────────────────────────────────────────────────────────

# Número de tren: 5 dígitos, primer dígito 7
TREN_HEADER_RE = re.compile(r'\b(7\d{4})\b')

# Hora en formato HH.MM o HH:MM
HORA_RE = re.compile(r'\b(\d{1,2})[.::](\d{2})\b')

# Detectar km: número entero o decimal seguido de nada especial (en columna km)
KM_RE = re.compile(r'^\d+(?:[.,]\d+)?$')

# Tipos de tren por prefijo
def tipo_tren(numero: str) -> str:
    n = int(numero)
    if 70400 <= n <= 70499: return 'CRF_LAVIANA'
    if 70500 <= n <= 70599: return 'CRF_GIJON'
    if 70700 <= n <= 70899: return 'CERCANIAS'
    if 71800 <= n <= 71899: return 'MD_LLANES'
    if 72100 <= n <= 72199: return 'VACIO'
    return 'OTRO'


def normalizar_hora(h: str, m: str) -> str:
    return f"{int(h):02d}:{int(m):02d}"


def es_estacion(texto: str) -> bool:
    """Detecta si una línea de texto corresponde al nombre de una estación."""
    t = texto.strip()
    if not t or len(t) < 3:
        return False
    # Estaciones: mayúsculas o mayúsculas + (APD)
    if re.match(r'^[A-ZÁÉÍÓÚÜÑ\s\-/()\.]+$', t, re.IGNORECASE):
        # Excluir encabezados numéricos puros
        if re.match(r'^\d[\d\s,.]*$', t):
            return False
        return True
    return False


# ── Parser principal ─────────────────────────────────────────────────────────

def parse_pdf(pdf_path: str) -> list[dict]:
    """
    Extrae trenes del PDF LH-820.
    Devuelve lista de dicts con estructura:
    {
        "numero": "70400",
        "tipo": "CRF_LAVIANA",
        "linea": null,
        "paradas": [...],
        "vigente_desde": "2023-01-01",
        "notas": null
    }
    """
    trenes: dict[str, dict] = {}  # numero → tren

    with pdfplumber.open(pdf_path) as pdf:
        print(f"  PDF: {len(pdf.pages)} páginas")

        for page_num, page in enumerate(pdf.pages, 1):
            # Extraer texto con tolerancia para mantener columnas
            words = page.extract_words(
                x_tolerance=3,
                y_tolerance=3,
                keep_blank_chars=False,
            )

            if not words:
                continue

            # Agrupar palabras por fila (y0 similar)
            filas: dict[float, list[dict]] = {}
            for w in words:
                y = round(w['top'], 1)
                filas.setdefault(y, []).append(w)

            filas_sorted = sorted(filas.items())

            # Identificar columnas de trenes en esta página
            # Buscar filas que contengan números de tren
            trenes_pagina: list[tuple[float, str]] = []  # (x_centro, numero)

            for y, palabras in filas_sorted:
                numeros = [(w['x0'], w['text']) for w in palabras if TREN_HEADER_RE.fullmatch(w['text'])]
                if len(numeros) >= 1:
                    for x0, num in numeros:
                        trenes_pagina.append((x0, num))
                    break  # Solo cogemos la primera fila de encabezados

            if not trenes_pagina:
                continue

            print(f"    Pág {page_num}: trenes {[t[1] for t in trenes_pagina]}")

            # Crear entradas para trenes nuevos
            for _, num in trenes_pagina:
                if num not in trenes:
                    trenes[num] = {
                        'numero': num,
                        'tipo': tipo_tren(num),
                        'linea': None,
                        'paradas': [],
                        'vigente_desde': '2023-01-01',
                        'notas': None,
                    }

            # Determinar columnas X de cada tren
            # Asumimos que las columnas de hora de cada tren están
            # cerca de su x0
            col_x = {num: x0 for x0, num in trenes_pagina}

            # Parsear filas de datos (debajo del encabezado)
            orden_base = {num: len(trenes[num]['paradas']) for _, num in trenes_pagina}
            fila_encabezado_y = trenes_pagina[0][0] if trenes_pagina else 0

            # Encontrar la Y del encabezado de trenes
            header_y = None
            for y, palabras in filas_sorted:
                nums = [w['text'] for w in palabras if TREN_HEADER_RE.fullmatch(w['text'])]
                if any(n in [t[1] for _, t in [(0, tp) for tp in trenes_pagina]] for n in nums):
                    header_y = y
                    break

            if header_y is None:
                continue

            # Procesar filas de datos debajo del encabezado
            orden_offset = {num: orden_base[num] for num in col_x}
            ultima_estacion = None

            for y, palabras in filas_sorted:
                if y <= header_y:
                    continue

                # Texto de la fila
                textos = [w['text'] for w in palabras]
                texto_fila = ' '.join(textos)

                # Detectar nombre de estación (columna más a la izquierda)
                palabras_izq = [w for w in palabras if w['x0'] < min(col_x.values()) - 5]
                estacion = None
                if palabras_izq:
                    est_texto = ' '.join(w['text'] for w in palabras_izq).strip()
                    if es_estacion(est_texto) and not re.match(r'^\d', est_texto):
                        estacion = est_texto
                        ultima_estacion = estacion

                if ultima_estacion is None:
                    continue

                # Para cada tren, buscar su hora en esta fila
                for num, x_tren in col_x.items():
                    # Palabras en la zona de este tren (±50px)
                    palabras_tren = [
                        w for w in palabras
                        if abs(w['x0'] - x_tren) < 60 or abs(w['x1'] - x_tren) < 60
                    ]

                    hora = None
                    comercial = False

                    for w in palabras_tren:
                        # Detectar punto/círculo comercial
                        if w['text'] in ('●', '•', '·', 'l', '|'):
                            comercial = True
                            continue

                        m = HORA_RE.search(w['text'])
                        if m:
                            hora = normalizar_hora(m.group(1), m.group(2))

                    if hora or estacion:
                        # Solo añadir parada si tiene hora o es la primera vez que vemos esta estación
                        if hora:
                            parada = {
                                'orden': orden_offset[num],
                                'estacion': ultima_estacion,
                                'hora': hora,
                                'comercial': comercial,
                                'apd': '(APD)' in (ultima_estacion or ''),
                            }
                            # Evitar duplicados consecutivos
                            paradas_existentes = trenes[num]['paradas']
                            if not paradas_existentes or paradas_existentes[-1].get('hora') != hora or paradas_existentes[-1].get('estacion') != ultima_estacion:
                                trenes[num]['paradas'].append(parada)
                                orden_offset[num] += 1

    resultado = list(trenes.values())
    # Filtrar trenes sin paradas
    resultado = [t for t in resultado if len(t['paradas']) > 0]
    print(f"\nTotal trenes extraídos: {len(resultado)}")
    return resultado


# ── Exportar a Supabase ───────────────────────────────────────────────────────

def subir_supabase(trenes: list[dict]):
    """Sube los trenes directamente a Supabase via REST API."""
    url  = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key  = os.environ.get('SUPABASE_SERVICE_KEY', '')

    if not url or not key:
        print("ERROR: Define SUPABASE_URL y SUPABASE_SERVICE_KEY")
        sys.exit(1)

    try:
        import urllib.request
        endpoint = f"{url}/rest/v1/lh_trenes"
        headers = {
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates',
        }
        data = json.dumps(trenes).encode()
        req = urllib.request.Request(endpoint, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req) as resp:
            print(f"Supabase: {resp.status} {resp.reason}")
    except Exception as e:
        print(f"Error subiendo a Supabase: {e}")
        sys.exit(1)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Parser LH-820 → JSON / Supabase')
    parser.add_argument('pdf', help='Ruta al PDF del LH-820 Anejo 5')
    parser.add_argument('-o', '--output', default='lh820_trenes.json', help='Fichero JSON de salida')
    parser.add_argument('--supabase', action='store_true', help='Subir directamente a Supabase')
    parser.add_argument('--pretty', action='store_true', help='JSON indentado')
    args = parser.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f"ERROR: No se encuentra el PDF: {pdf_path}")
        sys.exit(1)

    print(f"Procesando {pdf_path.name}…")
    trenes = parse_pdf(str(pdf_path))

    # Guardar JSON
    indent = 2 if args.pretty else None
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(trenes, f, ensure_ascii=False, indent=indent)
    print(f"Guardado en {args.output} ({len(trenes)} trenes)")

    if args.supabase:
        print("Subiendo a Supabase…")
        subir_supabase(trenes)

    # Muestra resumen
    print("\n── Resumen por tipo ──")
    tipos: dict[str, int] = {}
    for t in trenes:
        tipos[t['tipo']] = tipos.get(t['tipo'], 0) + 1
    for tipo, count in sorted(tipos.items()):
        print(f"  {tipo}: {count} trenes")


if __name__ == '__main__':
    main()
