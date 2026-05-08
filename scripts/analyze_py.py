"""
Análisis del PDF LH-820 con pdfplumber (Python).
Ejecutar: python scripts/analyze_py.py
"""
import pdfplumber
import sys
import re
from pathlib import Path

PDF_PATH = Path(__file__).parent.parent / "uploads" / "LH AM 820 0820_23 Consolidado An 5.pdf"

print(f"=== ANÁLISIS PDF LH-820 con pdfplumber ===\n")
print(f"Archivo: {PDF_PATH}\n")

TREN_RE = re.compile(r'\b(7\d{4})\b')

with pdfplumber.open(PDF_PATH) as pdf:
    print(f"Total páginas: {len(pdf.pages)}\n")

    all_trenes = set()

    # Analizar primeras páginas con datos (3-10)
    for page_num in range(3, min(12, len(pdf.pages) + 1)):
        page = pdf.pages[page_num - 1]

        print(f"\n{'='*60}")
        print(f"PÁGINA {page_num}")
        print('='*60)

        # Extraer texto simple
        text = page.extract_text()
        if text:
            lines = text.splitlines()
            print(f"Líneas de texto ({len(lines)}):")
            for i, line in enumerate(lines[:40]):
                print(f"  {i+1}: {repr(line)}")
            if len(lines) > 40:
                print(f"  ... ({len(lines)-40} más)")
        else:
            print("  (sin texto extraíble)")

        # Extraer palabras con posición
        words = page.extract_words()
        if words:
            print(f"\nPrimeras 30 palabras con posición:")
            for w in words[:30]:
                print(f"  x={w['x0']:.0f},y={w['top']:.0f} '{w['text']}'")

        # Buscar trenes
        if text:
            for m in TREN_RE.finditer(text):
                all_trenes.add(m.group(1))

        # Extraer tablas si las hay
        tables = page.extract_tables()
        if tables:
            print(f"\nTablas encontradas: {len(tables)}")
            for ti, table in enumerate(tables):
                print(f"  Tabla {ti+1} ({len(table)} filas):")
                for row in table[:5]:
                    print(f"    {row}")

    print(f"\n\n=== RESUMEN DE TRENES ENCONTRADOS ===")
    # Buscar en TODO el PDF
    all_trenes_full = set()
    for page in pdf.pages:
        text = page.extract_text() or ''
        for m in TREN_RE.finditer(text):
            all_trenes_full.add(m.group(1))

    sorted_trenes = sorted(all_trenes_full)
    print(f"Total trenes únicos: {len(sorted_trenes)}")
    print("Números:", ', '.join(sorted_trenes))
