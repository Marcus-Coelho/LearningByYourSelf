#!/usr/bin/env node
// Pré-carrega o cache de pronúncia (ver src/pronunciationTts.js) pra todas
// as palavras/frases de um backup do My Words de uma vez só, com um delay
// entre cada chamada pra não sobrecarregar o endpoint TTS do Google — em
// vez de o usuário esperar a cada ícone 🔊 novo que ele clica.
//
// A lista de palavras do My Words só existe no localStorage do navegador
// (este projeto não tem backend/banco — ver CLAUDE.md), então não dá pra um
// script Node ler "a lista atual" diretamente. A ponte é o próprio JSON de
// backup que a tela My Profile -> Backup & Restore já exporta (mesmo
// formato de buildBackupPayload em App.js): baixe um backup ali e aponte
// este script pro arquivo.
//
// Uso:
//   node scripts/preload-pronunciations.js caminho/para/backup.json
//
// (Não precisa rodar isso pra cada palavra nova adicionada — handleAddWord
// já dispara um warm-up em segundo plano pra palavra recém-criada sozinha,
// ver App.js. Este script serve pra aquecer o cache inteiro de uma vez,
// ex.: depois de restaurar um backup grande ou popular a lista fora do app.)
const fs = require('fs');
const path = require('path');
const { getPronunciationAudioPath, normalizeText } = require('../src/pronunciationTts');

const DELAY_MS = 500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const backupPath = process.argv[2];
  if (!backupPath) {
    console.error('Uso: node scripts/preload-pronunciations.js caminho/para/backup.json');
    console.error('(Exporte um backup em My Profile -> Backup & Restore -> Export.)');
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(backupPath), 'utf8');
  const backup = JSON.parse(raw);
  const wordbookRaw = backup?.data?.wordbook;
  if (!wordbookRaw) {
    console.error('Esse backup não tem uma lista "wordbook" (My Words vazio ou arquivo errado).');
    process.exit(1);
  }
  const entries = JSON.parse(wordbookRaw);
  // Ao contrário da versão Cambridge, o TTS do Google funciona igual bem
  // pra frase inteira — não há mais motivo pra filtrar só palavra única.
  const words = [...new Set(
    entries.map((entry) => normalizeText(entry.word)).filter(Boolean),
  )];

  console.log(`${words.length} entrada(s) única(s) para pré-carregar (de ${entries.length} no My Words).`);

  let done = 0;
  let ok = 0;
  for (const word of words) {
    try {
      await getPronunciationAudioPath(word);
      ok += 1;
      console.log(`[${done + 1}/${words.length}] OK: ${word}`);
    } catch (error) {
      console.log(`[${done + 1}/${words.length}] falhou: ${word} (${error.message})`);
    }
    done += 1;
    if (done < words.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`Pronto. ${ok}/${words.length} entrada(s) com áudio agora em cache.`);
}

main();
