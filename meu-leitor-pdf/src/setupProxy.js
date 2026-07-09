const fs = require('fs');
const path = require('path');
const express = require('express');
const { PDFDocument } = require('pdf-lib');

// Serves audio and PDFs straight from the source material folder, so they
// never need to be copied into public/ (and therefore never end up in git).
module.exports = function (app) {
  const contentRoot = path.join(__dirname, '..', '..', 'Pre Intermediate and Intermediate');
  const materialsRoot = path.join(contentRoot, 'EVIU_P_I');

  // Gabarito único (multipágina) com as respostas de todas as units.
  app.get('/answers-key.pdf', (req, res) => {
    res.sendFile(path.join(contentRoot, 'English_Vocabulary_Pre_Intermediate_Answers_Key.pdf'));
  });
  // fallthrough: false makes missing files 404 here instead of falling through
  // to CRA's SPA history fallback (which would otherwise answer with index.html
  // and status 200, breaking the app's "does this file exist" probing).
  const notFoundOn404 = (err, req, res, next) => {
    res.status(err.status || 404).end();
  };

  // Audio players read from here.
  app.use('/audio', express.static(materialsRoot, { fallthrough: false }));
  app.use('/audio', notFoundOn404);

  // The PDF viewer reads each unit's *_L.pdf from here (same folder, same files
  // as /audio — no copies, no duplication).
  app.use('/materials', express.static(materialsRoot, { fallthrough: false }));
  app.use('/materials', notFoundOn404);

  // Curso "American English Level 1": cada seção do livro (A/B/C/-) ocupa
  // 2 páginas, mas o material bruto tem um PDF de UMA página por arquivo
  // (ver American_English_File_Book1_Index_Ordenado.csv). Em vez de expor
  // os arquivos soltos e montar 2 leitores lado a lado no front, mescla as
  // 2 páginas em um único PDF de 2 páginas sob demanda (pdf-lib), para o
  // leitor mostrar a seção como um "spread" contínuo, com um só toolbar.
  //
  // Reorganização manual de 2026-07-09: o conteúdo deixou de ficar solto em
  // "American English Level 1/pdfs/" e passou para
  // "American English Level 1/pdfs and videos/", separado em StudentBook/
  // (páginas do livro do aluno, incl. os apêndices grammar_bank/
  // Vocabulary_bank/sound_bank/comunication/writing) e teacher_book/ (páginas
  // do livro do professor: Units de resposta, Practical English/Review and
  // Check em PDF, Grammar/Vocabulary Extra Activities...).
  const american1Root = path.join(__dirname, '..', '..', 'American English Level 1');
  const american1PdfsVideosRoot = path.join(american1Root, 'pdfs and videos');
  const american1StudentBookRoot = path.join(american1PdfsVideosRoot, 'StudentBook');
  const american1TeacherBookRoot = path.join(american1PdfsVideosRoot, 'teacher_book');

  const american1SectionsRoot = path.join(american1StudentBookRoot, 'Secoes');
  const AMERICAN1_FILE_PREFIX = 'American English File Book 1 2nd edition Student Book';

  app.get('/american1-pages/section/:start/:end', async (req, res) => {
    const start = Number(req.params.start);
    const end = Number(req.params.end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
      res.status(400).end();
      return;
    }
    try {
      const merged = await PDFDocument.create();
      for (const pageNumber of [start, end]) {
        const filePath = path.join(american1SectionsRoot, `${AMERICAN1_FILE_PREFIX}-${pageNumber}.pdf`);
        const bytes = fs.readFileSync(filePath);
        const source = await PDFDocument.load(bytes);
        const [copiedPage] = await merged.copyPages(source, [0]);
        merged.addPage(copiedPage);
      }
      const mergedBytes = await merged.save();
      res.type('application/pdf').send(Buffer.from(mergedBytes));
    } catch (error) {
      res.status(404).end();
    }
  });

  // Links de referência (Grammar/Vocabulary/Sound Bank/Communication/Writing)
  // dentro de cada seção A/B/C: mesma ideia do merge acima, mas para as
  // páginas do apêndice do livro (ver american1_references.json). Grammar
  // Bank e Sound Bank sempre ocupam um par de páginas (a referência impressa
  // aponta pra primeira; a segunda é a próxima); Vocabulary/Communication/
  // Writing são página única.
  const AMERICAN1_REFERENCE_FOLDERS = {
    // grammar_bank foi renomeada manualmente para "grammar bank L pNNN.pdf"
    // (páginas pares, L de Leitura/Learning) / "grammar bank E pNNN.pdf"
    // (páginas ímpares, E de Exercises) — número da página logo antes de
    // ".pdf", precedido de "p".
    grammar: { root: american1StudentBookRoot, dir: 'grammar_bank', pair: true, naming: 'page-suffix' },
    // Vocabulary_bank foi renomeada manualmente para "pNNN <título>.pdf"
    // (número da página logo após o "p", ex.: "p148 vocabulary bank days
    // and numbers.pdf") — não segue mais o padrão AMERICAN1_FILE_PREFIX-N.
    vocabulary: { root: american1StudentBookRoot, dir: 'Vocabulary_bank', pair: false, naming: 'page-prefix' },
    sound: { root: american1StudentBookRoot, dir: 'sound_bank', pair: true, naming: 'legacy' },
    communication: { root: american1StudentBookRoot, dir: 'comunication', pair: false, naming: 'legacy' },
    writing: { root: american1StudentBookRoot, dir: 'writing', pair: false, naming: 'legacy' },
  };

  // Resolve o caminho do PDF de uma página de referência, de acordo com a
  // convenção de nome de arquivo da pasta ('legacy' = prefixo fixo + "-N.pdf",
  // 'page-prefix' = número da página logo após o "p" inicial do nome,
  // 'page-suffix' = número da página logo antes de ".pdf", precedido de "p").
  function resolveReferenceFilePath(dir, page, naming) {
    if (naming === 'page-prefix' || naming === 'page-suffix') {
      const pattern = naming === 'page-prefix' ? /^p(\d+)\D/i : /p(\d+)\.pdf$/i;
      const match = fs.readdirSync(dir).find((name) => {
        const m = name.match(pattern);
        return m && Number(m[1]) === page;
      });
      if (!match) {
        throw new Error(`No file found for page ${page} in ${dir}`);
      }
      return path.join(dir, match);
    }
    return path.join(dir, `${AMERICAN1_FILE_PREFIX}-${page}.pdf`);
  }

  app.get('/american1-pages/ref/:type/:page', async (req, res) => {
    const config = AMERICAN1_REFERENCE_FOLDERS[req.params.type];
    const page = Number(req.params.page);
    if (!config || !Number.isInteger(page) || page < 1) {
      res.status(400).end();
      return;
    }
    const dir = path.join(config.root, config.dir);
    try {
      if (config.pair) {
        const merged = await PDFDocument.create();
        for (const pageNumber of [page, page + 1]) {
          const filePath = resolveReferenceFilePath(dir, pageNumber, config.naming);
          const bytes = fs.readFileSync(filePath);
          const source = await PDFDocument.load(bytes);
          const [copiedPage] = await merged.copyPages(source, [0]);
          merged.addPage(copiedPage);
        }
        const mergedBytes = await merged.save();
        res.type('application/pdf').send(Buffer.from(mergedBytes));
      } else {
        const filePath = resolveReferenceFilePath(dir, page, config.naming);
        res.type('application/pdf').sendFile(filePath);
      }
    } catch (error) {
      res.status(404).end();
    }
  });

  // Áudio ancorado do American English Level 1: o "Class Audio" desse livro é
  // dividido em vários CDs (o selo impresso no livro tem o número do CD antes
  // da faixa, ex.: "1)2" = CD1 faixa 2; "2)3" = CD2 faixa 3) — cada CD com seu
  // próprio nome de arquivo. Os limites de CD não coincidem com limites de unit:
  // CD1 = units 1-2, CD2 = units 3-4 + unit 5 seção A, CD3 = unit 5 seção B até
  // unit 7 Practical English, CD4 = unit 8 completa até unit 9 Practical
  // English, CD5 = unit 10 completa até unit 12 Review and Check (fim do índice atual).
  const american1AudioRoot = american1Root;
  app.use('/american1-audio/cd1', express.static(path.join(american1AudioRoot, 'audio_files_1'), { fallthrough: false }));
  app.use('/american1-audio/cd1', notFoundOn404);
  app.use('/american1-audio/cd2', express.static(path.join(american1AudioRoot, 'audio_files_2'), { fallthrough: false }));
  app.use('/american1-audio/cd2', notFoundOn404);
  app.use('/american1-audio/cd3', express.static(path.join(american1AudioRoot, 'audio_files_3'), { fallthrough: false }));
  app.use('/american1-audio/cd3', notFoundOn404);
  app.use('/american1-audio/cd4', express.static(path.join(american1AudioRoot, 'audio_files_4'), { fallthrough: false }));
  app.use('/american1-audio/cd4', notFoundOn404);
  app.use('/american1-audio/cd5', express.static(path.join(american1AudioRoot, 'audio_files_5'), { fallthrough: false }));
  app.use('/american1-audio/cd5', notFoundOn404);

  // Transcriptions: PDF único (8 páginas, já mesclado previamente com
  // pdf-lib a partir das páginas soltas 116-123) com as transcrições dos
  // áudios do livro. Ancorado com src/american1_transcriptions_audio_anchors.json
  // (índice de página 0-7 == páginas 116-123 do livro). Na reorganização de
  // 2026-07-09 esse arquivo foi renomeado e ganhou uma versão com OCR (texto
  // pesquisável) ao lado da original — usamos a versão com OCR, já que o
  // conteúdo visual das páginas é o mesmo e a busca de texto passa a
  // funcionar no leitor.
  app.get('/american1-pages/transcriptions', (req, res) => {
    res.type('application/pdf').sendFile(
      path.join(american1StudentBookRoot, 'listening', 'Listening all pages com OCR.pdf')
    );
  });

  // Respostas do Teacher's Book ("Show Answers", faixa inferior do leitor de
  // seção): as páginas soltas do teacher's book já foram organizadas em
  // pastas por seção (ver American English Level 1/pdfs and videos/teacher_book) —
  // aqui só mescla os PDFs de uma pasta (ordenados pelo número de página no
  // nome do arquivo, ex. "5B_p70.pdf") num único PDF de resposta.
  const teacherBookRoot = american1TeacherBookRoot;

  const pageNumberFromFilename = (filename) => {
    const match = filename.match(/_p(\d+)\.pdf$/i);
    return match ? Number(match[1]) : 0;
  };

  const mergeFolderToPdf = async (dir, res) => {
    const files = fs.readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.pdf'))
      .sort((a, b) => pageNumberFromFilename(a) - pageNumberFromFilename(b));
    if (files.length === 0) {
      res.status(404).end();
      return;
    }
    const merged = await PDFDocument.create();
    for (const file of files) {
      const bytes = fs.readFileSync(path.join(dir, file));
      const source = await PDFDocument.load(bytes);
      const copiedPages = await merged.copyPages(source, source.getPageIndices());
      copiedPages.forEach((p) => merged.addPage(p));
    }
    const mergedBytes = await merged.save();
    res.type('application/pdf').send(Buffer.from(mergedBytes));
  };

  // Seções A/B/C: teacher_book/Units/<unit><section>/*.pdf
  app.get('/american1-pages/answers/:unit/:section', async (req, res) => {
    const unit = Number(req.params.unit);
    const section = req.params.section;
    if (!Number.isInteger(unit) || unit < 1 || !/^[A-C]$/.test(section)) {
      res.status(400).end();
      return;
    }
    const dir = path.join(teacherBookRoot, 'Units', `${unit}${section}`);
    try {
      await mergeFolderToPdf(dir, res);
    } catch (error) {
      res.status(404).end();
    }
  });

  // Practical English (units 1, 3, 5, 7, 9, 11): teacher_book/practical_english/ep<N>/*.pdf
  const AMERICAN1_PRACTICAL_ENGLISH_UNIT_TO_EP = {
    1: 'ep1', 3: 'ep2', 5: 'ep3', 7: 'ep4', 9: 'ep5', 11: 'ep6',
  };
  app.get('/american1-pages/answers-pe/:unit', async (req, res) => {
    const unit = Number(req.params.unit);
    const ep = AMERICAN1_PRACTICAL_ENGLISH_UNIT_TO_EP[unit];
    if (!ep) {
      res.status(400).end();
      return;
    }
    const dir = path.join(teacherBookRoot, 'practical_english', ep);
    try {
      await mergeFolderToPdf(dir, res);
    } catch (error) {
      res.status(404).end();
    }
  });

  // Review and Check (units 2, 4, 6, 8, 10, 12): teacher_book/review_and_check_revisions,
  // um PDF único por par de units (ex. "1&2 Review and Check.pdf").
  const AMERICAN1_REVIEW_UNIT_TO_FILE = {
    2: '1&2 Review and Check.pdf',
    4: '3&4 Review and Check.pdf',
    6: '5&6 Review and Check.pdf',
    8: '7&8 Review and Check.pdf',
    10: '9&10 Review and Check.pdf',
    12: '11&12 Review and Check.pdf',
  };
  app.get('/american1-pages/answers-revise/:unit', (req, res) => {
    const unit = Number(req.params.unit);
    const filename = AMERICAN1_REVIEW_UNIT_TO_FILE[unit];
    if (!filename) {
      res.status(400).end();
      return;
    }
    const filePath = path.join(teacherBookRoot, 'review_and_check_revisions', filename);
    res.type('application/pdf').sendFile(filePath, (error) => {
      if (error && !res.headersSent) {
        res.status(404).end();
      }
    });
  });

  // Vídeos do Practical English e do "On the street": cada episódio tem sua
  // própria pasta com arquivos .mp4 (A/B/C/D/E), servidos estaticamente e
  // abertos numa nova aba do navegador pelo link (ver american1_videos.json,
  // campo "folder"). Na reorganização de 2026-07-09 essas pastas deixaram de
  // ficar soltas em "pdfs/" e passaram a viver cada uma sob sua própria
  // pasta-mãe em "pdfs and videos/" (Practical Englihs videos / On the
  // street videos — nomes exatos das pastas no disco, com o typo mantido).
  const american1PracticalEnglishVideoRoot = path.join(american1PdfsVideosRoot, 'Practical Englihs videos');
  const american1OnTheStreetVideoRoot = path.join(american1PdfsVideosRoot, 'On the street videos');
  const AMERICAN1_VIDEO_FOLDERS = {
    ep1: { root: american1PracticalEnglishVideoRoot, dir: 'aef2e_level01_ep1_arriving_in_london' },
    ep2: { root: american1PracticalEnglishVideoRoot, dir: 'aef2e_level01_ep2_at_a_coffee_shop' },
    ep3: { root: american1PracticalEnglishVideoRoot, dir: 'aef2e_level01_ep3_in_a_clothing_store' },
    ep4: { root: american1PracticalEnglishVideoRoot, dir: 'aef2e_level01_ep4_getting_lost' },
    ep5: { root: american1PracticalEnglishVideoRoot, dir: 'aef2e_level01_ep5_at_a_restaurant' },
    ep6: { root: american1PracticalEnglishVideoRoot, dir: 'aef2e_level01_ep6_going_home' },
    'onthestreet1-2': { root: american1OnTheStreetVideoRoot, dir: 'aef2e_level01_onthestreet_1-2' },
    'onthestreet3-4': { root: american1OnTheStreetVideoRoot, dir: 'aef2e_level01_onthestreet_3-4' },
    'onthestreet5-6': { root: american1OnTheStreetVideoRoot, dir: 'aef2e_level01_onthestreet_5-6' },
    'onthestreet7-8': { root: american1OnTheStreetVideoRoot, dir: 'aef2e_level01_onthestreet_7-8' },
    'onthestreet9-10': { root: american1OnTheStreetVideoRoot, dir: 'aef2e_level01_onthestreet_9-10' },
    'onthestreet11-12': { root: american1OnTheStreetVideoRoot, dir: 'aef2e_level01_onthestreet_11-12' },
  };
  Object.entries(AMERICAN1_VIDEO_FOLDERS).forEach(([slug, { root, dir }]) => {
    app.use(`/american1-video/${slug}`, express.static(path.join(root, dir), { fallthrough: false }));
    app.use(`/american1-video/${slug}`, notFoundOn404);
  });

  // Curso "Grammar English Elementary": cada unit tem um par de PDFs de UMA
  // página cada — Unit-<n>L.pdf (leitura/explicação) e Unit-<n>E.pdf
  // (exercícios) — e um punhado de áudios curtos por unit, nomeados
  // "<n><letra>-elem_murph_merged.mp3" (letra A, B, C... conforme o
  // conteúdo daquela unit, ver src/grammar_elem_audio.json). Ao contrário do
  // American1, o áudio aqui não fica ancorado sobre o PDF — é só um link
  // simples com a letra ao lado do botão "Exercises" (ver App.js).
  const grammarElemRoot = path.join(__dirname, '..', '..', 'Grammar Elemetary');

  // Helpers compartilhados por qualquer pasta do Grammar Elementary onde 1
  // PDF de 1 página só cobre vários números juntos (respostas, additional
  // exercises...): o nome do arquivo lista os números daquela página, e um
  // número cuja resposta/exercício continua na página seguinte ganha "p1"/
  // "p2" (colado, ex. "24p2", ou como token solto, ex. "16 p2" — os dois
  // jeitos aparecem nos dados reais). Confirmado com getPageCount que todo
  // arquivo dessas pastas tem exatamente 1 página, então a "página dentro do
  // arquivo" é sempre a primeira — nunca a posição do token.
  const parseNumberedPdfTokens = (filename, prefixPattern) => {
    const match = filename.match(prefixPattern);
    if (!match) return null;
    const entries = [];
    match[1].trim().split(/\s+/).forEach((token) => {
      const attached = token.match(/^(\d+)(p1|p2)?$/i);
      if (attached) {
        entries.push({ number: Number(attached[1]), part: attached[2] ? attached[2].toLowerCase() : null });
        return;
      }
      const partOnly = token.match(/^p([12])$/i);
      if (partOnly && entries.length > 0) {
        entries[entries.length - 1].part = `p${partOnly[1]}`;
      }
    });
    return entries;
  };

  const buildNumberedPdfMap = (dir, prefixPattern) => {
    const map = {};
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((name) => name.toLowerCase().endsWith('.pdf'));
    } catch (error) {
      return map;
    }
    files.forEach((file) => {
      const entries = parseNumberedPdfTokens(file, prefixPattern);
      if (!entries) return;
      entries.forEach(({ number, part }) => {
        (map[number] = map[number] || []).push({ file, page: 1, part });
      });
    });
    // "p1"/sem sufixo sempre antes de "p2" na resposta final, mesmo que a
    // ordem de leitura dos arquivos no disco não garanta isso.
    Object.values(map).forEach((entries) => {
      entries.sort((a, b) => (a.part === 'p2' ? 1 : 0) - (b.part === 'p2' ? 1 : 0));
    });
    return map;
  };

  const serveNumberedPdfFromMap = (map, dir, paramName = 'number') => async (req, res) => {
    const number = Number(req.params[paramName]);
    const entries = map[number];
    if (!Number.isInteger(number) || !entries || entries.length === 0) {
      res.status(404).end();
      return;
    }
    try {
      const merged = await PDFDocument.create();
      for (const entry of entries) {
        const bytes = fs.readFileSync(path.join(dir, entry.file));
        const source = await PDFDocument.load(bytes);
        const [copiedPage] = await merged.copyPages(source, [entry.page - 1]);
        merged.addPage(copiedPage);
      }
      const mergedBytes = await merged.save();
      res.type('application/pdf').send(Buffer.from(mergedBytes));
    } catch (error) {
      res.status(404).end();
    }
  };

  // Respostas ("Show Answers", igual ao American1): gabarito bruto em
  // answers_pdf/, cada página impressa trazendo as respostas de várias units
  // juntas (ex.: "answer 24p2 25 26 27 28 29p1.pdf" = uma página só, com o
  // fim da unit 24, as units 25-28 inteiras e o início da unit 29).
  const grammarElemAnswersRoot = path.join(grammarElemRoot, 'answers_pdf');
  const grammarElemAnswersMap = buildNumberedPdfMap(grammarElemAnswersRoot, /^answer (.+)\.pdf$/i);
  app.get(
    '/grammar-elem-pages/answers/:unit',
    serveNumberedPdfFromMap(grammarElemAnswersMap, grammarElemAnswersRoot, 'unit'),
  );

  // Appendixes (1 a 7): ficam depois da última unit na lista, mas fora da
  // contabilidade de progresso (ver App.js — a tela deles nunca marca
  // "visited"). Cada um tem 1 ou 2 páginas em arquivos separados
  // ("appendix <n> p1.pdf" / "appendix <n> p2.pdf" — nunca mais que 2).
  // Registrado ANTES do express.static abaixo: senão o fallback 404 dele
  // intercepta "/grammar-elem-pages/appendix/*" antes de chegar aqui.
  const grammarElemAppendixesRoot = path.join(grammarElemRoot, 'Appendixes');

  app.get('/grammar-elem-pages/appendix/:number', async (req, res) => {
    const number = Number(req.params.number);
    if (!Number.isInteger(number) || number < 1) {
      res.status(400).end();
      return;
    }
    const p1Path = path.join(grammarElemAppendixesRoot, `appendix ${number} p1.pdf`);
    const p2Path = path.join(grammarElemAppendixesRoot, `appendix ${number} p2.pdf`);
    try {
      if (!fs.existsSync(p2Path)) {
        res.type('application/pdf').sendFile(p1Path, (error) => {
          if (error && !res.headersSent) {
            res.status(404).end();
          }
        });
        return;
      }
      const merged = await PDFDocument.create();
      for (const filePath of [p1Path, p2Path]) {
        const bytes = fs.readFileSync(filePath);
        const source = await PDFDocument.load(bytes);
        const [copiedPage] = await merged.copyPages(source, [0]);
        merged.addPage(copiedPage);
      }
      const mergedBytes = await merged.save();
      res.type('application/pdf').send(Buffer.from(mergedBytes));
    } catch (error) {
      res.status(404).end();
    }
  });

  // Additional Exercises (1 a 35): mesma ideia das respostas — PDF de 1
  // página por arquivo, cada página cobrindo vários exercícios juntos (ex.:
  // "additional 10 11 12 13.pdf"), e "p2" num arquivo à parte quando o
  // exercício continua na página seguinte (ex.: "additional 16 p2.pdf",
  // "additional 31 p2.pdf" — no material bruto atual isso acontece com o 16
  // e o 31, não só o 31). Fora da contabilidade de progresso, igual aos
  // Appendixes.
  const grammarElemAdditionalRoot = path.join(grammarElemRoot, 'Additional Exercises');
  const grammarElemAdditionalMap = buildNumberedPdfMap(grammarElemAdditionalRoot, /^additional (.+)\.pdf$/i);
  app.get(
    '/grammar-elem-pages/additional/:number',
    serveNumberedPdfFromMap(grammarElemAdditionalMap, grammarElemAdditionalRoot),
  );

  app.use('/grammar-elem-pages', express.static(path.join(grammarElemRoot, 'pdf'), { fallthrough: false }));
  app.use('/grammar-elem-pages', notFoundOn404);
  app.use('/grammar-elem-audio', express.static(path.join(grammarElemRoot, 'audio_files'), { fallthrough: false }));
  app.use('/grammar-elem-audio', notFoundOn404);
};
