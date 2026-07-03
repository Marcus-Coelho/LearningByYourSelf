# -*- coding: utf-8 -*-
"""
Gerador do índice de âncoras do player de áudio (audio_anchors_coords.json).

Para cada Unit, localiza na camada de texto do PDF de leitura (_L) os
marcadores de letra de seção (A, B, C...) que abrem cada bloco de vocabulário,
e associa cada um ao arquivo de áudio correspondente (U_XXX.Y.mp3). O leitor
usa essas coordenadas para sobrepor um player compacto na margem esquerda da
página, alinhado verticalmente com a letra (nunca embaixo dela: a faixa
colorida da letra é estreita e o texto do título/corpo começa logo abaixo,
então a margem — sempre vazia por design do livro — é o único espaço garantido
sem sobrepor conteúdo).

Os marcadores de letra são identificados pela fonte/tamanho/cor do texto
(SourceSansPro-Black, tamanho ~16.6, cor branca) — o mesmo estilo usado nas
letras "I", "You" etc. dentro de frases de exemplo é fonte/cor diferente,
então não é confundido.

Descobertas que este script trata automaticamente:
  - Units 1 e 3: a última seção (D) tem o marcador de letra na página _E, não
    na _L. Como a tela de leitura do app só carrega o arquivo _L, essa letra
    não tem uma posição visível para ancorar o player nessa tela — o índice
    simplesmente não inclui uma âncora para ela (o arquivo de áudio continua
    existindo em disco, só não aparece ancorado na leitura).
  - Unit 72: existe um arquivo de áudio extra (U_072.D.mp3) sem nenhuma
    seção "D" no material (nem em _L, nem em _E) — provavelmente um resquício
    do pacote original. Mesmo tratamento: sem âncora para essa letra.

Uso:
    python gerar_indice_audio.py            # gera só se ainda não existir
    python gerar_indice_audio.py --force     # regenera sempre
"""

import json
import os
import re
import sys

import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.abspath(__file__))
MATERIALS = os.path.join(ROOT, "Pre Intermediate and Intermediate", "EVIU_P_I")
SAIDA_JSON = os.path.join(ROOT, "meu-leitor-pdf", "src", "audio_anchors_coords.json")

# Só a página _L é considerada: é o único arquivo carregado na tela de leitura
# da unit (onde o player ancorado vai aparecer).
SUFFIX = "_L"

HEADING_FONT = "SourceSansPro-Black"
HEADING_MIN_SIZE = 16.0
HEADING_COLOR = 16777215  # branco (texto sobre a faixa colorida da letra)


def heading_letters(path):
    """Marcadores de letra de seção reais (não confunde com "I"/"A" no meio de frases)."""
    out = []
    if not os.path.exists(path):
        return out
    doc = fitz.open(path)
    for pno in range(doc.page_count):
        page = doc[pno]
        pw, ph = round(page.rect.width, 1), round(page.rect.height, 1)
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    text = span["text"].strip()
                    if (
                        len(text) == 1
                        and text.isalpha()
                        and text.isupper()
                        and span["font"] == HEADING_FONT
                        and span["size"] > HEADING_MIN_SIZE
                        and span["color"] == HEADING_COLOR
                    ):
                        out.append(
                            {
                                "letter": text,
                                "page": pno,
                                "x0": round(span["bbox"][0], 1),
                                "yTop": round(span["bbox"][1], 1),
                                "yBottom": round(span["bbox"][3], 1),
                                "pageWidth": pw,
                                "pageHeight": ph,
                            }
                        )
    doc.close()
    return out


def audio_files_by_unit(unit_dir, unit):
    letters = {}
    if not os.path.isdir(unit_dir):
        return letters
    padrao = re.compile(rf"^U_{unit:03d}\.([A-F])\.mp3$", re.IGNORECASE)
    for fn in os.listdir(unit_dir):
        m = padrao.match(fn)
        if m:
            letters[m.group(1).upper()] = fn
    return letters


def main():
    force = "--force" in sys.argv
    if os.path.exists(SAIDA_JSON) and not force:
        print("[skip] índice já existe. Use --force para regenerar.")
        return

    indice = {}
    avisos = []

    for unit in range(1, 101):
        unit_dir = os.path.join(MATERIALS, f"unit_{unit}")
        audio_letters = audio_files_by_unit(unit_dir, unit)
        if not audio_letters:
            continue

        pdf_path = os.path.join(unit_dir, f"EVIU_PI-{unit}{SUFFIX}.pdf")
        headings = {h["letter"]: h for h in heading_letters(pdf_path)}

        anchors = []
        for letter, fn in sorted(audio_letters.items()):
            heading = headings.get(letter)
            if not heading:
                avisos.append(
                    f"unit {unit}: sem marcador de letra '{letter}' em {SUFFIX} "
                    f"para o áudio {fn} -> sem âncora nessa unit"
                )
                continue
            anchors.append(
                {
                    "letter": letter,
                    "audio": fn,
                    "page": heading["page"],
                    "x0": heading["x0"],
                    "yTop": heading["yTop"],
                    "yBottom": heading["yBottom"],
                    "pageWidth": heading["pageWidth"],
                    "pageHeight": heading["pageHeight"],
                }
            )

        if anchors:
            indice[str(unit)] = anchors

    os.makedirs(os.path.dirname(SAIDA_JSON), exist_ok=True)
    with open(SAIDA_JSON, "w", encoding="utf-8") as fh:
        json.dump(indice, fh, ensure_ascii=False, indent=2)

    total_anchors = sum(len(v) for v in indice.values())
    print(f"[ok] {total_anchors} âncoras em {len(indice)} units escritas em {SAIDA_JSON}")

    if avisos:
        print("\nAvisos (áudios sem âncora visível na tela de leitura):")
        for a in avisos:
            print("  -", a)


if __name__ == "__main__":
    main()
