# -*- coding: utf-8 -*-
"""
Gerador do índice de coordenadas dos exercícios (exercises_coords.json).

Para cada Unit, localiza os marcadores textuais dos exercícios (ex.: "72.1")
diretamente na CAMADA DE TEXTO dos PDFs (sem OCR, sem converter em imagem) e
calcula a faixa vertical [top, bottom] de cada exercício. O leitor usa essas
faixas para recortar (crop) e mostrar apenas o exercício selecionado.

Descobertas que este script trata automaticamente:
  - 96 units têm todos os exercícios no arquivo _E.
  - Units 1 e 3: os primeiros exercícios (1.1/1.2 e 3.1/3.2) ficaram na página
    _L quando o PDF foi dividido. O índice guarda, por exercício, em QUAL
    arquivo (_E ou _L) ele está.
  - Units 21 e 27: o PDF só contém 4 exercícios (a lista .txt diz 5). O PDF é a
    fonte de verdade; o índice reflete o que realmente existe no PDF.

Uso:
    python gerar_indice_exercicios.py            # gera só se ainda não existir
    python gerar_indice_exercicios.py --force    # regenera sempre
"""

import json
import os
import re
import sys

import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.abspath(__file__))
MATERIALS = os.path.join(ROOT, "Pre Intermediate and Intermediate", "EVIU_P_I")
LISTA_TXT = os.path.join(ROOT, "Pre Intermediate and Intermediate", "exercises list.txt")
SAIDA_JSON = os.path.join(ROOT, "meu-leitor-pdf", "src", "exercises_coords.json")

# Gabarito único (multipágina) com as respostas de todas as units.
ANSWERS_PDF = os.path.join(
    ROOT, "Pre Intermediate and Intermediate",
    "English_Vocabulary_Pre_Intermediate_Answers_Key.pdf",
)
ANSWERS_JSON = os.path.join(ROOT, "meu-leitor-pdf", "src", "answers_coords.json")

# Arquivos escaneados por unidade, em ordem de leitura (esquerda -> direita do
# spread original). _L vem antes de _E porque os primeiros exercícios de algumas
# units ficaram na página da esquerda.
SUFIXOS = ["_L", "_E"]

PAD_TOP = 6.0      # pontos acima do marcador, para não cortar o rótulo
PAD_BOTTOM = 10.0  # folga abaixo do conteúdo do último exercício da página


def ler_lista_esperada(caminho):
    """Lê o exercises list.txt -> {unit: [ids esperados]}. Usado só para conferência."""
    esperado = {}
    if not os.path.exists(caminho):
        return esperado
    with open(caminho, "r", encoding="utf-8", errors="replace") as fh:
        for linha in fh:
            linha = linha.strip()
            if not linha:
                continue
            partes = linha.split(None, 1)
            if len(partes) < 2:
                continue
            unit = partes[0]
            if not unit.isdigit():
                continue
            ids = [x.strip() for x in partes[1].split(",") if x.strip()]
            esperado[int(unit)] = ids
    return esperado


def content_bottom(page):
    """Maior y1 de texto da página (fim real do conteúdo)."""
    maior = 0.0
    for w in page.get_text("words"):
        if w[3] > maior:
            maior = w[3]
    return maior if maior else page.rect.height


def coletar_marcadores(unit):
    """
    Varre _L e _E da unit e devolve, em ordem de leitura, uma lista de dicts:
    {id, suffix, page, x, y0, page_width, page_height, content_bottom}
    """
    marcadores = []
    padrao = re.compile(rf"^{unit}\.(\d+)$")
    for suf in SUFIXOS:
        caminho = os.path.join(MATERIALS, f"unit_{unit}", f"EVIU_PI-{unit}{suf}.pdf")
        if not os.path.exists(caminho):
            continue
        doc = fitz.open(caminho)
        for pno in range(doc.page_count):
            page = doc[pno]
            cb = content_bottom(page)
            # dedup por id dentro da mesma página, mantendo o de menor y (o rótulo)
            achados = {}
            for w in page.get_text("words"):
                m = padrao.match(w[4])
                if not m:
                    continue
                sub = int(m.group(1))
                if sub not in achados or w[1] < achados[sub]["y0"]:
                    achados[sub] = {
                        "id": f"{unit}.{sub}",
                        "sub": sub,
                        "suffix": suf,
                        "page": pno,
                        "x": round(w[0], 1),
                        "y0": round(w[1], 1),
                        "page_width": round(page.rect.width, 1),
                        "page_height": round(page.rect.height, 1),
                        "content_bottom": round(cb, 1),
                    }
            for sub in sorted(achados):
                marcadores.append(achados[sub])
        doc.close()
    # ordena por número do exercício (garante N.1, N.2, ...)
    marcadores.sort(key=lambda d: d["sub"])
    return marcadores


def calcular_bandas(marcadores):
    """
    Define top/bottom de cada exercício.
    bottom = y0 do próximo exercício se estiver no MESMO arquivo e MESMA página;
    caso contrário, fim do conteúdo da página (content_bottom).
    """
    saida = {}
    for i, m in enumerate(marcadores):
        top = max(0.0, m["y0"] - PAD_TOP)
        prox = marcadores[i + 1] if i + 1 < len(marcadores) else None
        if prox and prox["suffix"] == m["suffix"] and prox["page"] == m["page"]:
            bottom = prox["y0"]
        else:
            bottom = min(m["page_height"], m["content_bottom"] + PAD_BOTTOM)
        saida[m["id"]] = {
            "unit": int(m["id"].split(".")[0]),
            "suffix": m["suffix"],           # "_E" ou "_L"
            "page": m["page"],
            "x": m["x"],
            "top": round(top, 1),
            "bottom": round(bottom, 1),
            "pageWidth": m["page_width"],
            "pageHeight": m["page_height"],
        }
    return saida


def gerar_respostas(ids_validos):
    """
    Índice do gabarito (PDF único multipágina): para cada exercício N.x localiza
    o marcador na camada de texto e calcula a faixa [top, bottom] DENTRO da sua
    página. bottom = próximo marcador na mesma página, senão fim do conteúdo.

    Só considera marcadores cujo id é um exercício REAL (ids_validos). Isso evita
    falsos positivos como horários no texto ("9.30", "6.00") que também casam com
    \\d+.\\d+ e, se contados, encurtariam a banda da resposta anterior.

    Salva {id: {page, top, bottom, pageWidth, pageHeight}} em answers_coords.json.
    """
    if not os.path.exists(ANSWERS_PDF):
        print(f"[aviso] gabarito não encontrado: {ANSWERS_PDF}")
        return
    padrao = re.compile(r"^\d+\.\d+$")
    doc = fitz.open(ANSWERS_PDF)
    indice = {}
    for pno in range(doc.page_count):
        page = doc[pno]
        cb = content_bottom(page)
        pw = round(page.rect.width, 1)
        ph = round(page.rect.height, 1)
        # marcadores válidos desta página (menor y por id), ordenados por y
        achados = {}
        for w in page.get_text("words"):
            _id = w[4]
            if not padrao.match(_id) or _id not in ids_validos:
                continue
            if _id not in achados or w[1] < achados[_id]:
                achados[_id] = w[1]
        ordenados = sorted(achados.items(), key=lambda kv: kv[1])
        for i, (_id, y0) in enumerate(ordenados):
            if _id in indice:
                continue  # mantém a primeira ocorrência (a resposta de fato)
            top = max(0.0, y0 - PAD_TOP)
            if i + 1 < len(ordenados):
                bottom = ordenados[i + 1][1]
            else:
                bottom = min(ph, cb + PAD_BOTTOM)
            indice[_id] = {
                "page": pno,
                "top": round(top, 1),
                "bottom": round(bottom, 1),
                "pageWidth": pw,
                "pageHeight": ph,
            }
    doc.close()

    faltando = sorted(
        ids_validos - set(indice),
        key=lambda s: (int(s.split(".")[0]), int(s.split(".")[1])),
    )
    os.makedirs(os.path.dirname(ANSWERS_JSON), exist_ok=True)
    with open(ANSWERS_JSON, "w", encoding="utf-8") as fh:
        json.dump(indice, fh, ensure_ascii=False, indent=2)
    print(f"[ok] {len(indice)} respostas escritas em {ANSWERS_JSON}")
    if faltando:
        print(f"[aviso] exercícios sem resposta no gabarito: {faltando}")


def main():
    force = "--force" in sys.argv
    if os.path.exists(SAIDA_JSON) and os.path.exists(ANSWERS_JSON) and not force:
        print("[skip] índices já existem. Use --force para regenerar.")
        return

    esperado = ler_lista_esperada(LISTA_TXT)
    indice = {}
    avisos = []

    for unit in range(1, 101):
        marcadores = coletar_marcadores(unit)
        if not marcadores:
            avisos.append(f"unit {unit}: nenhum marcador encontrado")
            continue
        bandas = calcular_bandas(marcadores)
        indice.update(bandas)

        achados_ids = [m["id"] for m in marcadores]
        esp = esperado.get(unit, [])
        if esp and len(esp) != len(achados_ids):
            avisos.append(
                f"unit {unit}: lista.txt={len(esp)} vs PDF={len(achados_ids)} "
                f"-> usando PDF {achados_ids}"
            )

    os.makedirs(os.path.dirname(SAIDA_JSON), exist_ok=True)
    with open(SAIDA_JSON, "w", encoding="utf-8") as fh:
        json.dump(indice, fh, ensure_ascii=False, indent=2)

    print(f"[ok] {len(indice)} exercícios escritos em {SAIDA_JSON}")

    # Gabarito: usa os ids de exercícios reais para descartar falsos positivos.
    gerar_respostas(set(indice))

    if avisos:
        print("\nAvisos (divergências tratadas automaticamente):")
        for a in avisos:
            print("  -", a)


if __name__ == "__main__":
    main()
