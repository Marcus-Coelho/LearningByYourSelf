const path = require('path');
const express = require('express');

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
};
