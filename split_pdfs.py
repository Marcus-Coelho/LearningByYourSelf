import os
import re
import subprocess
import sys
from pathlib import Path


def ensure_pypdf():
    try:
        from pypdf import PdfReader, PdfWriter
        return PdfReader, PdfWriter
    except Exception:
        subprocess.check_call([sys.executable, '-m', 'ensurepip', '--upgrade'])
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--user', 'pypdf'])
        from pypdf import PdfReader, PdfWriter
        return PdfReader, PdfWriter


PdfReader, PdfWriter = ensure_pypdf()
root = Path(r'C:\Users\marcu\OneDrive\Documentos\Projeto_pagina_pdf\Pre Intermediate and Intermediate\EVIU_P_I')

for folder in sorted(root.iterdir()):
    if not folder.is_dir():
        continue
    if not re.match(r'^(Unit|unit)_\d+$', folder.name):
        continue

    m = re.match(r'^(Unit|unit)_(\d+)$', folder.name)
    num = m.group(2)
    pdfs = [p for p in folder.iterdir() if p.is_file() and re.match(rf'^EVIU_PI-{num}\.pdf$', p.name)]
    if not pdfs:
        print(f'Sem arquivo em {folder.name}')
        continue

    src = pdfs[0]
    reader = PdfReader(str(src))
    if len(reader.pages) < 2:
        print(f'Arquivo com menos de 2 páginas em {folder.name}: {src.name}')
        continue

    for label, page_idx in [('L', 0), ('E', 1)]:
        writer = PdfWriter()
        writer.add_page(reader.pages[page_idx])
        out = folder / f'EVIU_PI-{num}_{label}.pdf'
        with open(out, 'wb') as f:
            writer.write(f)
    print(f'Processado {folder.name}')

print('Concluído.')
