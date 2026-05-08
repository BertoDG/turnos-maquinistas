#!/usr/bin/env python3
"""
parse_lh820.py — Parser del Libro Horario AM 820 (Anejo 5)

Usa pypdfium2 (pdfium) porque el PDF usa fuentes con codificación personalizada
que pdfplumber/pdf.js no pueden decodificar correctamente.

Estrategia de asignación de tiempos a trenes:
- Rank-based: los tiempos en orden izq→der corresponden a trenes en orden del
  encabezado Tipo: (el PDF siempre tiene K==N tiempos para N trenes en filas con
  datos, o K==0 cuando ningún tren tiene parada en esa estación).

Uso:
    python parse_lh820.py [ruta_pdf] [-o salida.json] [-v]
    python parse_lh820.py [ruta_pdf] --supabase

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

# ── Regex ─────────────────────────────────────────────────────────────────────

RE_TREN  = re.compile(r'\b(7\d{4})\b')
RE_HORA  = re.compile(r'(?<!\d)(\d{1,2})\.(\d{2})(?!\d)')  # H.MM → HH:MM
RE_SITKM = re.compile(r'\b(\d{1,3})\.\s?(\d)\b')           # 49. 7 → 49.7
RE_VMAX  = re.compile(r'^\s{0,8}(\d{2,3})(?:\s|$)')        # entero al inicio de línea
RE_SKIP  = re.compile(
    r'(Bloqueo|Dependencia|VM.x|Sit\s*Km|C\s+Hora|HORARIO\s*820|P.g\s+[IVX]'
    r'|Tipo:|CERCANIAS|MATERIAL\s+VACIO|MEDIA\s+DISTANCIA)',
    re.IGNORECASE
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def tipo_tren(numero: str) -> str:
    n = int(numero)
    if 70400 <= n <= 70459: return 'CRF_LAVIANA'
    if 70460 <= n <= 70499: return 'CRF_LAVIANA_ALT'
    if 70500 <= n <= 70599: return 'CRF_GIJON'
    if 70700 <= n <= 70899: return 'CERCANIAS'
    if 71800 <= n <= 71899: return 'MD_LLANES'
    if 72100 <= n <= 72199: return 'VACIO'
    return 'OTRO'


def sentido_tren(numero: str) -> str:
    """PAR = nº par (Laviana→Gijón / dirección A). IMPAR = dirección B."""
    return 'PAR' if int(numero) % 2 == 0 else 'IMPAR'


def parse_hora(h_str: str, m_str: str) -> Optional[str]:
    h, mi = int(h_str), int(m_str)
    if h > 30 or mi > 59:
        return None
    return f'{h:02d}:{mi:02d}'


def parse_sitkm(chunk: str) -> Optional[float]:
    for m in RE_SITKM.finditer(chunk):
        v = float(f'{m.group(1)}.{m.group(2)}')
        if 0 <= v <= 600:
            return v
    return None


# Velocidades máximas válidas en la red RENFE (múltiplos de 5, 10-220 km/h)
_VALID_VMAX = {v for v in range(10, 225, 5)}

def parse_vmax(line: str) -> Optional[int]:
    """Extrae la velocidad máxima de la columna izquierda del LH-820.
    Son enteros sin decimal al inicio de línea (ej: 50, 100, 70).
    Solo se aceptan valores múltiplo de 5 entre 10 y 220 km/h.
    """
    m = RE_VMAX.match(line)
    if not m:
        return None
    v = int(m.group(1))
    return v if v in _VALID_VMAX else None


def extract_station(region: str) -> Optional[str]:
    s = region
    s = re.sub(r'\b(BA[BU]\s*ctc|ctc)\b', '', s, flags=re.IGNORECASE)
    s = re.sub(r'\b(VIA\s+II|PASO\s+A\s+NIVEL|TRAVES[IAÍ]A|KM\s+\d).*', '', s,
               flags=re.IGNORECASE)
    s = re.sub(r'\.{2,}', '', s)
    s = re.sub(r'\b\d{1,3}\.\s*\d\b', ' ', s)
    s = re.sub(r'\b\d{2,5}\b', ' ', s)
    s = re.sub(r'(?<![A-Za-z\xc1\xc9\xcd\xd3\xda\xdc\xd1\xe1\xe9\xed\xf3\xfa\xfc\xf1])'
               r'\b\d\b'
               r'(?![A-Za-z\xc1\xc9\xcd\xd3\xda\xdc\xd1\xe1\xe9\xed\xf3\xfa\xfc\xf1])',
               ' ', s)
    s = s.strip()

    letter_pat = (r'[A-Z\xc1\xc9\xcd\xd3\xda\xdc\xd1]'
                  r'[A-Za-z\xc1\xc9\xcd\xd3\xda\xdc\xd1\xe1\xe9\xed\xf3\xfa\xfc\xf1'
                  r'\s()\-/,\.]{2,}')
    parts = re.findall(letter_pat, s)
    if not parts:
        return None

    name = max(parts, key=len).strip()
    name = re.sub(r'\s+', ' ', name).strip().rstrip('.,;')

    if len(name) < 3:
        return None

    EXCL = {'APD', 'KM', 'VIA', 'CTC', 'BAB', 'BAU', 'SAN', 'LA', 'EL',
            'LAS', 'LOS', 'DEL', 'DE', 'AL', 'PC', 'CTG'}
    if name.upper().strip() in EXCL:
        return None

    return name.upper()


def _is_comercial(line: str, hora: str, col: int) -> bool:
    prefix = line[max(0, col - 3):col].strip()
    return bool(re.search(r'\b[12]\b', prefix))


def _add_parada(tren: dict, estacion: str, hora: str,
                sit_km: Optional[float], vmax: Optional[int],
                comercial: bool, apd: bool):
    paradas = tren['paradas']
    if any(p['estacion'] == estacion and p['hora'] == hora for p in paradas):
        return
    paradas.append({
        'orden': len(paradas),
        'estacion': estacion,
        'hora': hora,
        'sit_km': sit_km,
        'vmax': vmax,
        'comercial': comercial,
        'apd': apd,
    })


def _add_tramo(tren: dict, sit_km: float, vmax: Optional[int]):
    """Añade un punto km intermedio (cambio de VMax sin parada) a la lista tramos."""
    tramos = tren['tramos']
    if any(t['sit_km'] == sit_km for t in tramos):
        return
    tramos.append({'sit_km': sit_km, 'vmax': vmax})


# ── Extracción de texto ────────────────────────────────────────────────────────

def extract_pages(pdf_path: str) -> list[str]:
    """Devuelve la lista de textos de cada página del PDF usando pypdfium2."""
    import pypdfium2 as pdfium
    doc = pdfium.PdfDocument(pdf_path)
    pages = []
    for pg_idx in range(len(doc)):
        page = doc[pg_idx]
        textpage = page.get_textpage()
        pages.append(textpage.get_text_range())
    return pages


# ── Procesado de páginas ──────────────────────────────────────────────────────

def parse_page(page_text: str, trenes_map: dict, verbose: bool = False):
    """Procesa el texto de una página PDF (puede tener 1 ó 2 secciones)."""
    if not RE_TREN.search(page_text):
        return

    lines = page_text.splitlines()

    # Encontrar todas las líneas con 'Tipo:' Y números de tren → límites de sección
    tipo_sections: list[tuple[int, str]] = [
        (i, line)
        for i, line in enumerate(lines)
        if 'Tipo:' in line and RE_TREN.search(line)
    ]

    # Páginas de continuación sin 'Tipo:' (MD_LLANES pág 2/2, etc.)
    if not tipo_sections:
        for i, line in enumerate(lines[:10]):
            if RE_TREN.search(line):
                tipo_sections = [(i, line)]
                break

    if not tipo_sections:
        return

    for sec_num, (tipo_idx, tipo_line) in enumerate(tipo_sections):
        trains = [m.group(1) for m in RE_TREN.finditer(tipo_line)]
        if not trains:
            continue
        n_trains = len(trains)

        # Límite de esta sección
        section_end = (tipo_sections[sec_num + 1][0]
                       if sec_num + 1 < len(tipo_sections)
                       else len(lines))

        # Inicializar trenes
        for num in trains:
            if num not in trenes_map:
                trenes_map[num] = {
                    'numero': num,
                    'tipo': tipo_tren(num),
                    'sentido': sentido_tren(num),
                    'linea': None,
                    'notas': None,
                    'paradas': [],
                    'tramos': [],
                }

        if verbose:
            print(f'  Seccion {sec_num+1}: trenes={trains}')

        # Estado de continuación de estación (para EL BERRÓN / POLA DE SIERO)
        state: dict = {'station': None, 'sitkm': None, 'cont_rows': 0, 'vmax': None}

        for line in lines[tipo_idx + 1:section_end]:
            _process_line(line, trains, n_trains, state, trenes_map, verbose)


def _process_line(line: str, trains: list, n_trains: int,
                  state: dict, trenes_map: dict, verbose: bool):
    """Procesa una línea de datos y actualiza trenes_map y state."""
    if not line.strip():
        return
    if RE_SKIP.search(line):
        return

    # VMax: columna más a la izquierda, persiste hasta que cambia.
    # Se extrae ANTES de cualquier return para no perder el valor.
    vmax = parse_vmax(line)
    if vmax is not None:
        state['vmax'] = vmax

    # Sit_km de la región izquierda (primeros 15 chars)
    sitkm = parse_sitkm(line[:15])

    # Primera posición de hora en la línea (separa región estación de tiempos)
    first_m = RE_HORA.search(line)
    first_time_pos = first_m.start() if first_m else len(line)

    # Extraer nombre de estación antes de los tiempos
    station_region = line[:min(first_time_pos, 85)]
    station = extract_station(station_region)

    # Extraer todos los tiempos de la línea completa
    times: list[tuple[str, int]] = []
    for m in RE_HORA.finditer(line):
        h_val = parse_hora(m.group(1), m.group(2))
        if h_val:
            times.append((h_val, m.start()))

    # ── Actualizar estado ──────────────────────────────────────────────────
    if station:
        state['station'] = station
        state['sitkm'] = sitkm if sitkm is not None else state['sitkm']
        state['cont_rows'] = 0 if times else 3

    elif sitkm is not None:
        # Punto km sin estación → marcador intermedio de VMax en el trazado.
        # Se añade como tramo a todos los trenes de la sección.
        for num in trains:
            _add_tramo(trenes_map[num], sitkm, state.get('vmax'))
        state['station'] = None
        state['sitkm'] = None
        state['cont_rows'] = 0
        return

    # ── Determinar estación activa para esta fila ──────────────────────────
    if station:
        active_station = station
        active_sitkm   = state['sitkm']
    elif state['cont_rows'] > 0 and state['station']:
        active_station = state['station']
        active_sitkm   = state['sitkm']
        state['cont_rows'] -= 1
    else:
        return

    # ── Asignar tiempos a trenes (rank-based) ─────────────────────────────
    if times and active_station:
        sorted_times = sorted(times, key=lambda x: x[1])
        for i, (hora, col) in enumerate(sorted_times[:n_trains]):
            num = trains[i]
            comercial = _is_comercial(line, hora, col)
            apd = '(APD)' in active_station
            _add_parada(trenes_map[num], active_station, hora,
                        active_sitkm, state.get('vmax'), comercial, apd)
            if verbose:
                print(f'    {num} @ {active_station}: {hora} km={active_sitkm} vmax={state.get("vmax")}')


# ── Parser principal ───────────────────────────────────────────────────────────

def parse_lh820(pdf_path: str, verbose: bool = False) -> list[dict]:
    print('Extrayendo texto del PDF...')
    pages = extract_pages(pdf_path)
    print(f'Paginas: {len(pages)}')

    trenes_map: dict[str, dict] = {}

    for i, page_text in enumerate(pages):
        if verbose:
            print(f'Pagina {i+1}:')
        parse_page(page_text, trenes_map, verbose=verbose)

    # Ordenar paradas por hora
    result = []
    for tren in trenes_map.values():
        paradas = tren['paradas']
        if not paradas:
            continue
        paradas.sort(key=lambda p: p['hora'] or '99:99')
        for j, p in enumerate(paradas):
            p['orden'] = j
        result.append(tren)

    # Stats
    total_p = sum(len(t['paradas']) for t in result)
    print(f'Trenes con paradas: {len(result)} | Total paradas: {total_p}')
    tipos: dict[str, int] = {}
    for t in result:
        tipos[t['tipo']] = tipos.get(t['tipo'], 0) + 1
    for tp, cnt in sorted(tipos.items()):
        print(f'  {tp}: {cnt} trenes')

    return result


# ── Subida a Supabase ─────────────────────────────────────────────────────────

def subir_supabase(trenes: list[dict]):
    url = os.environ.get('SUPABASE_URL', '').rstrip('/')
    key = os.environ.get('SUPABASE_SERVICE_KEY', '')
    if not url or not key:
        print('ERROR: Define SUPABASE_URL y SUPABASE_SERVICE_KEY')
        sys.exit(1)

    import urllib.request
    endpoint = f'{url}/rest/v1/lh_trenes'
    headers = {
        'apikey': key,
        'Authorization': f'Bearer {key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
    }
    data = json.dumps(trenes).encode()
    req = urllib.request.Request(endpoint, data=data, headers=headers, method='POST')
    with urllib.request.urlopen(req) as resp:
        print(f'Supabase: {resp.status} {resp.reason}')


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description='Parser LH-820 -> JSON / Supabase')
    ap.add_argument('pdf', nargs='?',
                    default=str(Path(__file__).parent.parent /
                                'uploads' / 'LH AM 820 0820_23 Consolidado An 5.pdf'),
                    help='Ruta al PDF del LH-820 Anejo 5')
    ap.add_argument('-o', '--output', default='scripts/lh820_parsed.json')
    ap.add_argument('--supabase', action='store_true')
    ap.add_argument('-v', '--verbose', action='store_true')
    args = ap.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        print(f'ERROR: No existe: {pdf_path}')
        sys.exit(1)

    trenes = parse_lh820(str(pdf_path), verbose=args.verbose)

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(trenes, f, ensure_ascii=False, indent=2)
    print(f'JSON: {out_path} ({len(trenes)} trenes)')

    print('\n-- Primeros trenes por numero --')
    for tren in sorted(trenes, key=lambda t: t['numero'])[:8]:
        p_sample = ', '.join(
            f"{p['estacion']}@{p['hora']}" for p in tren['paradas'][:3]
        )
        n_p = len(tren['paradas'])
        print(f"  {tren['numero']} ({tren['tipo']}) -> {n_p} paradas | {p_sample}...")

    if args.supabase:
        subir_supabase(trenes)


if __name__ == '__main__':
    main()
