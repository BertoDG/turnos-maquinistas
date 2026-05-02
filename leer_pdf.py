import pdfplumber
import json

archivos = [
    'ejemplo_pdf_turnos.pdf',
    'turnos_del_maquinista_adrian_alvarez.pdf',
]

with open('resultado_pdfs.txt', 'w', encoding='utf-8') as out:
    for archivo in archivos:
        out.write(f'\n\n========== {archivo} ==========\n')
        with pdfplumber.open(archivo) as pdf:
            out.write(f'Total paginas: {len(pdf.pages)}\n')
            for i, page in enumerate(pdf.pages):
                out.write(f'\n--- Pagina {i+1} ---\n')
                texto = page.extract_text()
                if texto:
                    out.write(texto + '\n')
                tablas = page.extract_tables()
                if tablas:
                    out.write('TABLAS:\n')
                    out.write(json.dumps(tablas, ensure_ascii=False, indent=2) + '\n')

print('Listo! Fichero guardado: resultado_pdfs.txt')
