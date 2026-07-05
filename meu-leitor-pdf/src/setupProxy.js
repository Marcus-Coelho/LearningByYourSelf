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

  // Vídeos do Practical English: cada episódio tem sua própria pasta com
  // arquivos .mp4 (A/B/C/D/E), servidos estaticamente e abertos numa nova
  // aba do navegador pelo link (ver american1_videos.json, campo "folder").
  const AMERICAN1_VIDEO_FOLDERS = {
    ep1: 'aef2e_level01_ep1_arriving_in_london',
  };
  Object.entries(AMERICAN1_VIDEO_FOLDERS).forEach(([slug, folder]) => {
    app.use(`/american1-video/${slug}`, express.static(path.join(american1PdfsRoot, folder), { fallthrough: false }));
    app.use(`/american1-video/${slug}`, notFoundOn404);
  });
};
