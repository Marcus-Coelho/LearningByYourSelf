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
  const american1SectionsRoot = path.join(
    __dirname, '..', '..', 'American English Level 1', 'pdfs', 'Secoes'
  );
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
  const american1PdfsRoot = path.join(__dirname, '..', '..', 'American English Level 1', 'pdfs');
  const AMERICAN1_REFERENCE_FOLDERS = {
    grammar: { dir: 'grammar_bank', pair: true },
    vocabulary: { dir: 'Vocabulary_bank', pair: false },
    sound: { dir: 'sound_bank', pair: true },
    communication: { dir: 'comunication', pair: false },
    writing: { dir: 'writing', pair: false },
  };

  app.get('/american1-pages/ref/:type/:page', async (req, res) => {
    const config = AMERICAN1_REFERENCE_FOLDERS[req.params.type];
    const page = Number(req.params.page);
    if (!config || !Number.isInteger(page) || page < 1) {
      res.status(400).end();
      return;
    }
    const dir = path.join(american1PdfsRoot, config.dir);
    try {
      if (config.pair) {
        const merged = await PDFDocument.create();
        for (const pageNumber of [page, page + 1]) {
          const filePath = path.join(dir, `${AMERICAN1_FILE_PREFIX}-${pageNumber}.pdf`);
          const bytes = fs.readFileSync(filePath);
          const source = await PDFDocument.load(bytes);
          const [copiedPage] = await merged.copyPages(source, [0]);
          merged.addPage(copiedPage);
        }
        const mergedBytes = await merged.save();
        res.type('application/pdf').send(Buffer.from(mergedBytes));
      } else {
        const filePath = path.join(dir, `${AMERICAN1_FILE_PREFIX}-${page}.pdf`);
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
  // English, CD5 = unit 10 completa até unit 12 Revise (fim do índice atual).
  const american1AudioRoot = path.join(__dirname, '..', '..', 'American English Level 1');
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
  // (índice de página 0-7 == páginas 116-123 do livro).
  app.get('/american1-pages/transcriptions', (req, res) => {
    res.type('application/pdf').sendFile(path.join(american1PdfsRoot, 'listening', 'Listening.pdf'));
  });

  // Respostas do Teacher's Book ("Show Answers", faixa inferior do leitor de
  // seção): as páginas soltas do teacher's book já foram organizadas em
  // pastas por seção (ver American English Level 1/pdfs/teacher_book) —
  // aqui só mescla os PDFs de uma pasta (ordenados pelo número de página no
  // nome do arquivo, ex. "5B_p70.pdf") num único PDF de resposta.
  const teacherBookRoot = path.join(american1PdfsRoot, 'teacher_book');

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

  // Vídeos do Practical English: cada episódio tem sua própria pasta com
  // arquivos .mp4 (A/B/C/D/E), servidos estaticamente e abertos numa nova
  // aba do navegador pelo link (ver american1_videos.json, campo "folder").
  const AMERICAN1_VIDEO_FOLDERS = {
    ep1: 'aef2e_level01_ep1_arriving_in_london',
    ep2: 'aef2e_level01_ep2_at_a_coffee_shop',
    ep3: 'aef2e_level01_ep3_in_a_clothing_store',
    ep4: 'aef2e_level01_ep4_getting_lost',
    ep5: 'aef2e_level01_ep5_at_a_restaurant',
    ep6: 'aef2e_level01_ep6_going_home',
    'onthestreet1-2': 'aef2e_level01_onthestreet_1-2',
    'onthestreet3-4': 'aef2e_level01_onthestreet_3-4',
    'onthestreet5-6': 'aef2e_level01_onthestreet_5-6',
    'onthestreet7-8': 'aef2e_level01_onthestreet_7-8',
    'onthestreet9-10': 'aef2e_level01_onthestreet_9-10',
    'onthestreet11-12': 'aef2e_level01_onthestreet_11-12',
  };
  Object.entries(AMERICAN1_VIDEO_FOLDERS).forEach(([slug, folder]) => {
    app.use(`/american1-video/${slug}`, express.static(path.join(american1PdfsRoot, folder), { fallthrough: false }));
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
  app.use('/grammar-elem-pages', express.static(path.join(grammarElemRoot, 'pdf'), { fallthrough: false }));
  app.use('/grammar-elem-pages', notFoundOn404);
  app.use('/grammar-elem-audio', express.static(path.join(grammarElemRoot, 'audio_files'), { fallthrough: false }));
  app.use('/grammar-elem-audio', notFoundOn404);
};
