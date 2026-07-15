import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SpecialZoomLevel, Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { SelectionMode } from '@react-pdf-viewer/selection-mode';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import exerciseCoords from './exercises_coords.json';
import answersCoords from './answers_coords.json';
import audioAnchorsCoords from './audio_anchors_coords.json';
import american1Index from './american1_index.json';
import american1AudioAnchors from './american1_audio_anchors.json';
import american1ReferenceAudioAnchors from './american1_reference_audio_anchors.json';
import american1TranscriptionsAudioAnchors from './american1_transcriptions_audio_anchors.json';
import american1References from './american1_references.json';
import american1Videos from './american1_videos.json';
import grammarElemAudio from './grammar_elem_audio.json';
import grammarElemIndex from './grammar_elem_index.json';
import grammarElemAppendixIndex from './grammar_elem_appendix_index.json';
import listeningAmerican1 from './listening_american1.json';
import listeningVocabulary from './listening_vocabulary.json';
import './App.css';

// Fontes de Listening disponíveis na tela "Listening" do menu principal —
// hoje só a do American English A1, mas é uma lista pra caber outras depois
// (ex.: um listening da Grammar Elementary) sem precisar remodelar nada.
const LISTENING_SOURCES = [listeningAmerican1, listeningVocabulary];

// Rótulo curto de origem mostrado ao lado do número do exercício (ex.:
// "unit 7-c") — tracks do Vocabulary têm unit/letter próprios; tracks do
// American1 não têm esses campos, então cai no audioLabel (ex.: "1-13").
const listeningTrackLabel = (track) => {
  if (track.unit && track.letter) {
    return `unit ${track.unit}-${track.letter.toLowerCase()}`;
  }
  if (track.audioLabel) {
    return track.audioLabel.toLowerCase();
  }
  if (track.cd && track.track) {
    return `${track.cd.replace(/^CD/i, '')}-${track.track}`.toLowerCase();
  }
  return '';
};

// URL do gabarito único (multipágina), servido por src/setupProxy.js.
const ANSWERS_KEY_URL = '/answers-key.pdf';

const MIN_CENTER_WIDTH = 420;
const MIN_RIGHT_WIDTH = 260;
// .main-panels ganha padding:10px de cada lado em telas <=820px (ver
// App.css) — sem descontar isso, um rightWidth calculado a partir de
// window.innerWidth "cabe" no cálculo mas ainda estoura a tela de verdade
// por esses 20px de padding. Um pouco de folga a mais por segurança.
const RESPONSIVE_WIDTH_BUFFER = 24;
// Largura inicial do painel direito (My Notes) como fração da janela, não
// mais um valor fixo de 650px — a pedido do usuário em 2026-07-11, que
// achava o painel largo demais por padrão (obrigando a redimensionar toda
// vez que abre uma unit) e mandou uma imagem de referência com a proporção
// desejada (~21% da largura total). Continua ajustável por arrasto — isso
// só muda onde o painel nasce.
const RIGHT_PANEL_WIDTH_RATIO = 0.21;

// Velocidades disponíveis no player de áudio ancorado.
const AUDIO_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

// Revisão espaçada ("Today's Review"): dias até um item autoavaliado voltar
// à fila de revisão, conforme a nota dada — nota baixa volta logo, nota alta
// volta bem depois. O item sai da fila quando é reavaliado (qualquer nota),
// o que agenda a próxima repetição.
const DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_INTERVALS_BY_RATING = { 1: 1, 2: 2, 3: 3, 4: 7, 5: 30 };

// Escada de intervalos (em dias) dos flashcards do "My Words": palavra nova
// nasce vencida (revisar já); "Again" volta ao primeiro degrau, "Good" sobe
// um degrau, "Easy" sobe dois.
const FLASHCARD_STEPS_DAYS = [1, 3, 7, 14, 30, 60];

// Imagem de mnemônica do "My Words": redimensionada no navegador (maior lado
// até 640px, JPEG 72%) antes de virar data URL e ir pro localStorage — sem
// isso, uma foto de celular direto do clipboard/upload (vários MB) esgotaria
// a cota do localStorage em poucas palavras salvas.
const WORDBOOK_IMAGE_MAX_DIMENSION = 640;
const WORDBOOK_IMAGE_QUALITY = 0.72;

const resizeImageFileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(reader.error || new Error('Could not read file'));
  reader.onload = () => {
    const img = new window.Image();
    img.onerror = () => reject(new Error('Invalid image'));
    img.onload = () => {
      const scale = Math.min(1, WORDBOOK_IMAGE_MAX_DIMENSION / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', WORDBOOK_IMAGE_QUALITY));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// Só um dos itens colados costuma ser a imagem (o resto é texto/HTML da
// mesma cópia) — pega o primeiro item de imagem, ignora o resto. Usado no
// onPaste do FORMULÁRIO inteiro (não só da ImageDropZone), pra colar
// funcionar com o cursor em qualquer campo — ver comentário em WordbookPage.
const getImageFileFromClipboardEvent = (event) => {
  const items = Array.from(event.clipboardData?.items || []);
  const imageItem = items.find((item) => item.type.startsWith('image/'));
  return imageItem ? imageItem.getAsFile() : null;
};

// Cadastro é só-nome, sem senha (ver PROJECT_SUMMARY.md): "users" guarda a
// lista de nomes já cadastrados neste navegador e "activeUser" aponta quem
// está "logado" agora. Todo progresso (respostas, notas, autoavaliação,
// units visitadas) é namespaced por nome via userKey(), para que duas
// pessoas no mesmo navegador não misturem dados.
const USERS_KEY = 'users';
const ACTIVE_USER_KEY = 'activeUser';

const loadUsers = () => {
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
};

const saveUsers = (users) => {
  try {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (error) {
    // Armazenamento indisponível — lista de usuários fica só nesta sessão.
  }
};

const userKey = (name, base) => `u:${encodeURIComponent(name)}:${base}`;

// Chaves de progresso usadas antes de existir cadastro de usuário. Migradas
// uma única vez para o primeiro nome cadastrado neste navegador, para não
// "perder" progresso acumulado antes dessa feature existir.
const LEGACY_PROGRESS_PREFIXES = ['rating:', 'notes:', 'answers:'];

const migrateLegacyDataToUser = (name) => {
  try {
    const keysToMigrate = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (key === 'visitedUnits' || LEGACY_PROGRESS_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToMigrate.push(key);
      }
    }
    keysToMigrate.forEach((key) => {
      const value = window.localStorage.getItem(key);
      if (value !== null) {
        window.localStorage.setItem(userKey(name, key), value);
      }
      window.localStorage.removeItem(key);
    });
  } catch (error) {
    // Armazenamento indisponível — segue sem migrar dados antigos.
  }
};

// Varre as chaves "u:<nome>:review:<curso>:<id>" e devolve só os itens já
// vencidos (due <= agora), mais atrasados primeiro — é o conteúdo do card
// "Today's Review" da Home/Courses.
const loadDueReviews = (name) => {
  const due = [];
  try {
    const prefix = userKey(name, 'review:');
    const now = Date.now();
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const remainder = key.slice(prefix.length);
      const separator = remainder.indexOf(':');
      if (separator === -1) continue;
      let entry;
      try {
        entry = JSON.parse(window.localStorage.getItem(key));
      } catch (error) {
        continue;
      }
      if (entry && typeof entry.due === 'number' && entry.due <= now) {
        due.push({
          course: remainder.slice(0, separator),
          id: remainder.slice(separator + 1),
          rating: entry.rating,
          due: entry.due,
        });
      }
    }
  } catch (error) {
    // Armazenamento indisponível — sem fila de revisão nesta sessão.
  }
  due.sort((a, b) => a.due - b.due);
  return due;
};

// Exercícios agrupados por unidade, em ordem numérica (N.1, N.2, ...).
// Gerado a partir de exercises_coords.json (ver gerar_indice_exercicios.py).
const exercisesByUnit = (() => {
  const map = {};
  Object.entries(exerciseCoords).forEach(([id, coords]) => {
    (map[coords.unit] = map[coords.unit] || []).push(id);
  });
  Object.values(map).forEach((ids) =>
    ids.sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]))
  );
  return map;
})();

// Estado visual das grades de unit ("badge" colorido no card): unvisited
// (nunca aberta) / visited (aberta, sem nota) / rated (pelo menos uma nota
// dada) / mastered (nota máxima). Usado nas 3 grades (Vocabulary, American
// English A1, Grammar English A1) — ver renderUnitBadge em App().
const UNIT_BADGE_MASTERED_RATING = 5;
const getUnitBadgeStatus = (visited, rating) => {
  if (!visited) return 'unvisited';
  if (!rating) return 'visited';
  return rating >= UNIT_BADGE_MASTERED_RATING ? 'mastered' : 'rated';
};
// Vocabulary não tem uma nota única por unit (a autoavaliação é por
// exercício, ver exerciseRatings) — "mastered" exige ter avaliado TODOS os
// exercícios da unit com a nota máxima; qualquer outra avaliação já conta
// como "rated". Units sem exercício indexado nunca passam de "visited".
const getVocabularyUnitBadgeStatus = (unitNumber, visited, exerciseRatings) => {
  if (!visited) return 'unvisited';
  const ids = exercisesByUnit[unitNumber] || [];
  const given = ids.map((id) => exerciseRatings[id] || 0);
  const ratedCount = given.filter((value) => value > 0).length;
  if (ratedCount === 0) return 'visited';
  const allMastered = given.length === ratedCount
    && given.every((value) => value >= UNIT_BADGE_MASTERED_RATING);
  return allMastered ? 'mastered' : 'rated';
};

const unitTable = {
  1: 'Learning vocabulary',
  2: 'Keeping a vocabulary notebook',
  3: 'Using a dictionary',
  4: 'English language words',
  5: 'Country, nationality and language',
  6: 'The physical world',
  7: 'Weather',
  8: 'Animals and insects',
  9: 'The body and movement',
  10: 'Describing appearance',
  11: 'Describing character',
  12: 'Feelings',
  13: 'Family and friends',
  14: 'Growing up',
  15: 'Romance, marriage and divorce',
  16: 'Daily routines',
  17: 'The place where you live',
  18: 'Around the home',
  19: 'Money',
  20: 'Health',
  21: 'Clothes',
  22: 'Fashion and buying clothes',
  23: 'Shopping',
  24: 'Food',
  25: 'Cooking',
  26: 'City life',
  27: 'Life in the country',
  28: 'Transport',
  29: 'On the road',
  30: 'Notices and warnings',
  31: 'Classroom language',
  32: 'School education',
  33: 'Studying English and taking exams',
  34: 'University education',
  35: 'Jobs',
  36: 'Talking about your work',
  37: 'Making a career',
  38: 'Working in an office',
  39: 'Running a company',
  40: 'Business and finance',
  41: 'Sport and leisure',
  42: 'Competitive sport',
  43: 'Books and films',
  44: 'Music',
  45: 'Special events',
  46: 'Travel bookings',
  47: 'Air travel',
  48: 'Hotels and restaurants',
  49: 'Cafés',
  50: 'Sightseeing holidays',
  51: 'Holidays by the sea',
  52: 'Newspapers and television',
  53: 'Phoning and texting',
  54: 'Computers',
  55: 'Email and the Internet',
  56: 'Crime',
  57: 'Politics',
  58: 'Climate change',
  59: 'War and violence',
  60: 'Time',
  61: 'Numbers',
  62: 'Distance, dimensions and size',
  63: 'Objects, materials, shapes and colour',
  64: 'Containers and quantities',
  65: 'Apologies, excuses and thanks',
  66: 'Requests, permission and suggestions',
  67: 'Opinions, agreeing and disagreeing',
  68: 'Likes, dislikes, attitudes and preferences',
  69: 'Greetings, farewells and special expressions',
  70: 'Prefixes: changing meaning',
  71: 'Suffixes: forming nouns',
  72: 'Suffixes: forming adjectives',
  73: 'Compound nouns',
  74: 'Word partners',
  75: 'Fixed phrases',
  76: 'Fixed phrases in conversation',
  77: 'Verb or adjective + preposition',
  78: 'Prepositional phrases',
  79: 'Phrasal verbs 1: form and meaning',
  80: 'Phrasal verbs 2: grammar and style',
  81: 'Make, do and take: uses and phrases',
  82: 'Key verbs: give, keep and miss',
  83: 'Get: uses, phrases and phrasal verbs',
  84: 'Go: meanings and expressions',
  85: 'The senses',
  86: 'Uncountable nouns',
  87: 'Verb constructions 1',
  88: 'Verb constructions 2',
  89: 'Adjectives',
  90: 'Prepositions: place and movement',
  91: 'Adverbs',
  92: 'Time and sequence',
  93: 'Addition and contrast',
  94: 'Reason, purpose, result, condition',
  95: 'Formal and informal English',
  96: 'Completing forms and CVs',
  97: 'Writing an essay',
  98: 'Formal letters and emails',
  99: 'Informal emails and messages',
  100: 'Abbreviations',
};

const unitItems = Array.from({ length: 100 }, (_, index) => {
  const number = index + 1;
  return {
    number,
    label: unitTable[number] || `Unit ${number}`,
  };
});

// Curso "American English A1": american1_index.json é a leitura direta
// de American_English_File_Book1_Index_Ordenado.csv (unit, seção A/B/C/-,
// título, foco de grammar/vocabulary/pronunciation e a dupla de páginas do
// livro). Agrupado por unit, na mesma ordem em que aparece no CSV.
const american1SectionsByUnit = (() => {
  const map = {};
  american1Index.forEach((entry) => {
    (map[entry.unit] = map[entry.unit] || []).push(entry);
  });
  return map;
})();

const american1UnitNumbers = Object.keys(american1SectionsByUnit)
  .map(Number)
  .sort((a, b) => a - b);

// Busca por palavra-chave na grade de units (ver UnitSearchBox em App()):
// junta título + grammar + vocabulary + pronunciation de TODAS as seções da
// unit (não só a seção "A" mostrada como resumo no card), porque um tópico
// como "phrasal verbs" pode estar só na seção B ou C. Pré-computado uma vez
// (dado estático do módulo), não a cada tecla digitada.
const american1UnitSearchText = (() => {
  const map = {};
  american1UnitNumbers.forEach((unit) => {
    const sections = american1SectionsByUnit[unit] || [];
    map[unit] = sections
      .flatMap((section) => [section.title, section.grammar, section.vocabulary, section.pronunciation])
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  });
  return map;
})();

// Progresso é contado por seção (1A, 1B, ... Practical English/Review and Check de
// cada unit), não por unit — as units são longas, então marcar a unit
// inteira como "vista" ao abrir a primeira seção inflava o progresso.
const american1SectionsTotal = american1Index.length;

// Links de referência (Grammar/Vocabulary/Sound Bank/Communication/Writing)
// de cada seção A/B/C — ver american1_references.json, derivado de
// pages_others.txt cruzado com american1_index.json. Indexado por
// "<unit>|<section>" para lookup direto na tela de unit.
const american1ReferencesBySection = (() => {
  const map = {};
  american1References.forEach((entry) => {
    map[`${entry.unit}|${entry.section}`] = entry.refs;
  });
  return map;
})();

// Vídeos do Practical English (ep1, ep2...) por unit/section — arquivos .mp4
// servidos por src/setupProxy.js e abertos numa nova aba ao clicar no link.
const american1VideosBySection = (() => {
  const map = {};
  american1Videos.forEach((entry) => {
    map[`${entry.unit}|${entry.section}`] = entry;
  });
  return map;
})();

// Rótulo e pasta/rota de cada tipo de referência. Grammar e Sound Bank
// mescladas como par de páginas (a referência impressa aponta pra primeira
// do par); Vocabulary/Communication/Writing são página única.
const AMERICAN1_REFERENCE_LABELS = {
  grammar: 'grammar',
  vocabulary: 'vocabulary',
  sound: 'sound bank',
  communication: 'communication',
  writing: 'writing',
};

// Cursos listados na página "Courses". title também é usado no topo do
// leitor (reader-title-bar) enquanto o usuário está dentro de uma unit.
const courses = {
  vocabulary: {
    title: 'English Vocabulary B',
    description: 'Explore pre-intermediate vocabulary practice and lessons.',
  },
  american1: {
    title: 'American English A1',
    description: 'Read through American English File Book 1, unit by unit, section by section.',
  },
  grammarElem: {
    title: 'Grammar English A1',
    description: 'Essential Grammar in Use, unit by unit — reading, exercises and audio.',
  },
};

// Curso "Grammar English A1": 115 units, cada uma com um par de PDFs
// de página única (Unit-<n>L.pdf de leitura, Unit-<n>E.pdf de exercícios,
// ver src/setupProxy.js) e um punhado de áudios curtos por unit (ver
// grammar_elem_audio.json, gerado a partir dos nomes de arquivo em
// Grammar Elemetary/audio_files).
const GRAMMAR_ELEM_UNIT_COUNT = 115;
const grammarElemUnitNumbers = Array.from({ length: GRAMMAR_ELEM_UNIT_COUNT }, (_, i) => i + 1);

// Título/tópico de cada unit (grammar_elem_index.json) — extraído das
// próprias páginas Unit-<n>L.pdf (a de leitura; as _E são só exercícios,
// não têm o título): PyMuPDF, localizando o bloco de texto no topo da
// página, acima do primeiro marcador de seção "A" (algumas páginas listam
// A/B/C na ordem de leitura ANTES do título, apesar de estarem visualmente
// abaixo — layout em colunas). Script de extração não fica no repo (mesma
// política dos outros geradores de índice deste projeto, ver
// exercise-crop-feature/american1-anchored-audio-detection).
const getGrammarElemUnitTitle = (unit) => grammarElemIndex[String(unit)] || '';

// Appendixes do Grammar English A1: ficam depois da última unit,
// mas não contam pra "Your Progress" (ver src/setupProxy.js para como as
// páginas de cada appendix são resolvidas a partir de Appendixes/*.pdf).
const GRAMMAR_ELEM_APPENDIX_COUNT = 7;
const grammarElemAppendixNumbers = Array.from({ length: GRAMMAR_ELEM_APPENDIX_COUNT }, (_, i) => i + 1);

// Título de cada appendix (grammar_elem_appendix_index.json) — mesma técnica
// de extração de getGrammarElemUnitTitle, aplicada em "appendix <n> p1.pdf"
// (a página 1 de cada appendix; alguns têm p2, mas o título só está na p1).
// Essas páginas não têm marcador de seção "A" (texto corrido, sem
// subseções), então o corte usado foi o mesmo fallback das units 110/114:
// logo depois do próprio bloco de título (tamanho >= 36), excluindo o
// rótulo "Appendix N" (que aparece 2x na página, incl. um "fantasma" maior).
const getGrammarElemAppendixTitle = (appendixNumber) => grammarElemAppendixIndex[String(appendixNumber)] || '';

// Additional Exercises do Grammar English A1: mesma ideia dos
// Appendixes (depois das units, fora da contabilidade de progresso — ver
// src/setupProxy.js para como as páginas são resolvidas a partir de
// "Additional Exercises"/*.pdf).
const GRAMMAR_ELEM_ADDITIONAL_COUNT = 35;
const grammarElemAdditionalNumbers = Array.from({ length: GRAMMAR_ELEM_ADDITIONAL_COUNT }, (_, i) => i + 1);

const renderPdfUpload = (onChange, label = 'Load PDF') => (
  <label className="upload-button">
    {label}
    <input
      type="file"
      accept="application/pdf,.pdf"
      onChange={onChange}
    />
  </label>
);

const IconSearch = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

// Botão hambúrguer do menu mobile — vira um "X" quando o dropdown está
// aberto (duas linhas do meio giram formando o X, mesma animação clássica
// de app de celular), em vez de trocar por um ícone diferente.
const IconMenuToggle = ({ open }) => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <line x1="3" y1="6" x2="21" y2="6" style={{ transition: 'transform 160ms, opacity 160ms', transform: open ? 'translateY(6px) rotate(45deg)' : 'none', transformOrigin: 'center' }} />
    <line x1="3" y1="12" x2="21" y2="12" style={{ transition: 'opacity 160ms', opacity: open ? 0 : 1 }} />
    <line x1="3" y1="18" x2="21" y2="18" style={{ transition: 'transform 160ms, opacity 160ms', transform: open ? 'translateY(-6px) rotate(-45deg)' : 'none', transformOrigin: 'center' }} />
  </svg>
);

// Ícones do left slide menu — um por item, mesmo estilo de traço do
// IconSearch/IconChevron (stroke currentColor, sem preenchimento).
const IconHome = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11.5 12 4l9 7.5" />
    <path d="M5.5 10v9a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1v-9" />
  </svg>
);

const IconCourses = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5v-13z" />
    <path d="M12 3h5.5A2.5 2.5 0 0 1 20 5.5v13a2.5 2.5 0 0 1-2.5 2.5H12" />
  </svg>
);

const IconWords = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6.5 3.5h9a1.5 1.5 0 0 1 1.5 1.5v15.5l-6-3.5-6 3.5V5a1.5 1.5 0 0 1 1.5-1.5z" />
  </svg>
);

const IconHeadphones = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
    <rect x="3" y="14" width="4.5" height="6" rx="1.5" />
    <rect x="16.5" y="14" width="4.5" height="6" rx="1.5" />
  </svg>
);

const IconMic = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
    <path d="M12 19v2" />
    <path d="M8.5 21h7" />
  </svg>
);

const IconProfile = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20c1.4-3.8 4.4-5.8 7.5-5.8s6.1 2 7.5 5.8" />
  </svg>
);

const IconSound = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4z" />
    <path d="M16.5 9a4 4 0 0 1 0 6" />
    <path d="M19 6.5a8 8 0 0 1 0 11" />
  </svg>
);

const IconLanguage = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" />
    <path d="M7 9h10" />
    <path d="M7 12h10" />
    <path d="M7 15h6" />
  </svg>
);

// Setinha do botão de esconder/mostrar o painel — SVG (não texto ›/‹) pra
// controlar a espessura de verdade via strokeWidth, em vez de depender do
// peso da fonte do navegador.
const IconChevron = ({ direction = 'right' }) => (
  <svg
    viewBox="0 0 10 10"
    width="10"
    height="10"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transformOrigin: 'center', transform: direction === 'left' ? 'rotate(180deg)' : undefined }}
  >
    <path d="M3.5 1.5l4 3.5-4 3.5" />
  </svg>
);

const IconText = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16" />
    <path d="M8 11h8" />
    <path d="M8 15h8" />
    <path d="M8 19h8" />
  </svg>
);

const IconHand = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2" />
    <path d="M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2" />
    <path d="M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
  </svg>
);

const IconMaximize = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v3" />
    <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

const IconMinimize = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3v3a2 2 0 0 1-2 2H4" />
    <path d="M15 3v3a2 2 0 0 0 2 2h3" />
    <path d="M9 21v-3a2 2 0 0 0-2-2H4" />
    <path d="M15 21v-3a2 2 0 0 1 2-2h3" />
  </svg>
);

const IconPlay = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
);

const IconPause = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
);

const IconStop = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M6 6h12v12H6z" /></svg>
);

const IconDots = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
    <circle cx="12" cy="5" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="12" cy="19" r="2" />
  </svg>
);

const IconBack5 = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
    <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    <text x="12" y="16.5" textAnchor="middle" fontSize="7.5" fontWeight="700" stroke="none">5</text>
  </svg>
);

// Restaura a posição (página + unit/seção selecionada) depois de um F5 —
// sem react-router, um reload sempre jogava de volta pra Home. sessionStorage
// (não localStorage) porque é posição de navegação, não progresso: some
// sozinha ao fechar a aba, igual o comportamento normal de um app com URL.
// Só restaura se já havia um usuário ativo — sem isso as telas de curso
// ficariam num estado inconsistente (gate de cadastro pede um usuário).
// Lido uma vez só, no carregamento do módulo (mesmo padrão de ACTIVE_USER_KEY
// abaixo), pra alimentar os useState iniciais sem piscar a Home antes.
const SESSION_POSITION_KEY = 'sessionPosition';
// 'register' nunca é restaurada: é a tela do usuário DESLOGADO, e só é
// alcançável nesse estado (ver handleSwitchUser) — se por algum motivo
// ficou salva com um usuário ainda ativo, cai na Home em vez de travar ali.
const NON_RESTORABLE_PAGES = ['register'];
const RESTORED_POSITION = (() => {
  try {
    const hasActiveUser = window.localStorage.getItem(ACTIVE_USER_KEY);
    if (!hasActiveUser) return null;
    const raw = window.sessionStorage.getItem(SESSION_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (NON_RESTORABLE_PAGES.includes(parsed.activePage)) return null;
    return parsed;
  } catch (error) {
    return null;
  }
})();

function App() {
  const [pdfFileUrl, setPdfFileUrl] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(RESTORED_POSITION?.selectedUnit ?? null);
  const [selectedExercise, setSelectedExercise] = useState(RESTORED_POSITION?.selectedExercise ?? null);
  const [selectedAmerican1Unit, setSelectedAmerican1Unit] = useState(RESTORED_POSITION?.selectedAmerican1Unit ?? null);
  const [selectedAmerican1Section, setSelectedAmerican1Section] = useState(RESTORED_POSITION?.selectedAmerican1Section ?? null);
  const [selectedAmerican1Reference, setSelectedAmerican1Reference] = useState(RESTORED_POSITION?.selectedAmerican1Reference ?? null);
  const [selectedGrammarElemUnit, setSelectedGrammarElemUnit] = useState(RESTORED_POSITION?.selectedGrammarElemUnit ?? null);
  const [selectedGrammarElemAppendix, setSelectedGrammarElemAppendix] = useState(RESTORED_POSITION?.selectedGrammarElemAppendix ?? null);
  const [selectedGrammarElemAdditional, setSelectedGrammarElemAdditional] = useState(RESTORED_POSITION?.selectedGrammarElemAdditional ?? null);
  // Navegação da tela "Listening" (menu principal): hub -> fonte (ex.:
  // "Listening from American English A1") -> track (ex.: CD1 Track 13).
  // Guardamos só os ids (não os objetos) pra caber no histórico/sessionStorage
  // como o resto da posição restaurável — os dados completos vêm de volta
  // procurando em LISTENING_SOURCES.
  const [selectedListeningSource, setSelectedListeningSource] = useState(RESTORED_POSITION?.selectedListeningSource ?? null);
  const [selectedListeningTrack, setSelectedListeningTrack] = useState(RESTORED_POSITION?.selectedListeningTrack ?? null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [showAmerican1Answers, setShowAmerican1Answers] = useState(false);
  const [showAmerican1ReferenceAnswers, setShowAmerican1ReferenceAnswers] = useState(false);
  const [showGrammarElemAnswers, setShowGrammarElemAnswers] = useState(false);
  // Cada curso do Profile abre/fecha independente (chave = id do curso em
  // `courses`) — fechado por padrão, deixando só o título e a linha de
  // score/progresso visíveis. Objeto (não dois booleans soltos) porque mais
  // cursos serão adicionados depois.
  const [expandedProfileCourses, setExpandedProfileCourses] = useState({});
  const [activePage, setActivePage] = useState(RESTORED_POSITION?.activePage || 'home');
  const [activeCourseId, setActiveCourseId] = useState(RESTORED_POSITION?.activeCourseId ?? null);
  // Busca por palavra-chave nas 3 grades de unit (Vocabulary/American1/
  // Grammar Elementary) — compartilhada entre as 3 porque só uma grade fica
  // visível de cada vez; zerada ao entrar em qualquer uma delas (ver
  // handleVocabulary/handleAmerican1/handleGrammarElem) pra não começar
  // filtrada sem o usuário saber por quê.
  const [unitSearchQuery, setUnitSearchQuery] = useState('');
  // Busca (unit ou número do exercício) e filtro "hide 100%" da lista de
  // listening exercises — zerados ao abrir uma fonte (ver
  // handleOpenListeningSource) pra não começar filtrada sem o usuário saber.
  const [listeningSearchQuery, setListeningSearchQuery] = useState('');
  const [hideMasteredListening, setHideMasteredListening] = useState(false);
  // Largura inicial = RIGHT_PANEL_WIDTH_RATIO da janela (ver comentário na
  // constante), com piso em MIN_RIGHT_WIDTH e teto no espaço realmente
  // disponível — numa tablet mais estreita (~820px), MIN_CENTER_WIDTH(420) +
  // 14px do divisor já não deixa espaço nem pro piso, então o teto
  // (`available`) sempre vence quando a tela é estreita.
  const [rightWidth, setRightWidth] = useState(() => {
    try {
      const available = window.innerWidth - MIN_CENTER_WIDTH - 14 - RESPONSIVE_WIDTH_BUFFER;
      const target = window.innerWidth * RIGHT_PANEL_WIDTH_RATIO;
      return Math.min(available, Math.max(MIN_RIGHT_WIDTH, target));
    } catch (error) {
      return 400;
    }
  });
  // Esconde/mostra o painel direito (notas + respostas) inteiro, dando a
  // largura toda pro leitor — a mesma flag controla o botão flutuante
  // "+ Word", que some junto (ver render de WordQuickAdd mais abaixo).
  const [sidePanelVisible, setSidePanelVisible] = useState(true);
  // Left slide menu: painel que desliza da esquerda, aberto pelo botão
  // hambúrguer (ver .menu-toggle/.side-drawer no CSS). Fechado por padrão;
  // fecha sozinho ao navegar (cada link já tem seu próprio onClick), ao
  // clicar fora dele/no backdrop, ou com Esc.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);

  // Rede de segurança: fecha o dropdown em QUALQUER navegação, não só nos
  // links de dentro dele (ex.: clicar em "My Profile", que é um botão à
  // parte do .menu).
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activePage]);
  // Toda tela que tem o painel direito ("side-panel right-panel", com
  // UnitNotes/respostas) usa o mesmo layout de grid de 3 colunas — listado
  // aqui pra saber quando faz sentido mostrar o botão de esconder/mostrar
  // (não existe em telas de grade de units, home, etc.).
  const PAGES_WITH_SIDE_PANEL = ['exercises', 'unit', 'grammarElem-unit', 'grammarElem-exercise', 'grammarElem-appendix', 'grammarElem-additional', 'american1-unit', 'american1-reference', 'american1-transcriptions'];
  const [exerciseRatings, setExerciseRatings] = useState({});
  const [visitedUnits, setVisitedUnits] = useState({});
  const [american1UnitRatings, setAmerican1UnitRatings] = useState({});
  const [american1VisitedSections, setAmerican1VisitedSections] = useState({});
  const [grammarElemUnitRatings, setGrammarElemUnitRatings] = useState({});
  const [grammarElemVisitedUnits, setGrammarElemVisitedUnits] = useState({});
  // Última unit/seção aberta EM CADA curso — alimenta o botão "Continue
  // where you left off", um por curso na tela Courses e um só (o mais
  // recente dos 3, por timestamp) na Home. Chave = id do curso
  // ('vocabulary'/'american1'/'grammarElem'), valor = {unit, section?,
  // timestamp} (section só usado pelo American1).
  const [lastVisitedByCourse, setLastVisitedByCourse] = useState({});
  const [reviewQueue, setReviewQueue] = useState([]);
  const [wordbookEntries, setWordbookEntries] = useState([]);
  // Centro vertical (em px, relativo à viewport) do container que tem o
  // resize-handle — usado só pelo botão de esconder/mostrar o painel, que é
  // fixed na viewport (não filho do grid) e por isso não pode simplesmente
  // usar "top: 50%": a metade da TELA não é a metade do painel, já que o
  // cabeçalho consome espaço no topo. Recalculado via layoutRef (já anexado
  // ao container de cada uma das 8 telas com painel — ver PAGES_WITH_SIDE_PANEL).
  const [panelCenterY, setPanelCenterY] = useState(null);
  const layoutRef = useRef(null);
  const startDragRef = useRef(null);
  // Controla a integração com o botão Voltar/Avançar do navegador (History
  // API) — ver o efeito "Restaurar posição" abaixo. hasPushedHistoryRef
  // decide replaceState (1ª vez, não empilha entrada nova) vs pushState
  // (navegações seguintes); isPopStateRef evita que uma mudança de estado
  // DISPARADA por um Voltar/Avançar empilhe outra entrada em cima (senão o
  // botão Voltar ficaria preso reempilhando pra frente a cada clique).
  const hasPushedHistoryRef = useRef(false);
  const isPopStateRef = useRef(false);

  // Identidade do "usuário" (só nome, sem senha — ver comentário acima de
  // userKey). Lido de forma síncrona do localStorage no useState para não
  // piscar a home/courses antes de sabermos se já há alguém logado.
  const [userName, setUserName] = useState(() => {
    try {
      return window.localStorage.getItem(ACTIVE_USER_KEY) || '';
    } catch (error) {
      return '';
    }
  });
  const [registeredUsers, setRegisteredUsers] = useState(() => loadUsers());
  const [registerNameInput, setRegisterNameInput] = useState('');
  const [registerError, setRegisterError] = useState('');

  // Reencolhe o painel de notas se a janela ficar estreita demais pra ele
  // (ex.: girar um tablet de paisagem pra retrato) — só encolhe até caber,
  // nunca alarga de volta sozinho (não queremos desfazer um ajuste manual
  // do usuário quando a tela volta a ficar larga).
  useEffect(() => {
    const handleWindowResize = () => {
      setRightWidth((prev) => {
        const available = window.innerWidth - MIN_CENTER_WIDTH - 14 - RESPONSIVE_WIDTH_BUFFER;
        const maxAllowed = Math.max(MIN_RIGHT_WIDTH, available);
        return Math.min(prev, maxAllowed);
      });
    };
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  // Fecha o dropdown do menu mobile ao clicar/tocar fora dele, ou com Esc —
  // mesmo comportamento padrão de app de celular. Só liga o listener
  // enquanto o menu está aberto, pra não pagar o custo de um listener
  // global o tempo todo.
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const handleOutsideClick = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setMobileMenuOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen]);

  // Mede o centro vertical real do container do resize-handle (ver
  // panelCenterY acima) sempre que a tela muda (layoutRef passa a apontar
  // pra um container novo) e quando a janela é redimensionada — o botão de
  // esconder/mostrar é fixed na viewport, então precisa desse valor em vez
  // de um simples "top: 50%" (que seria o centro da TELA, não do painel).
  useEffect(() => {
    if (!PAGES_WITH_SIDE_PANEL.includes(activePage)) return undefined;
    const updateCenter = () => {
      if (!layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      setPanelCenterY(rect.top + rect.height / 2);
    };
    updateCenter();
    window.addEventListener('resize', updateCenter);
    const ro = new ResizeObserver(updateCenter);
    if (layoutRef.current) ro.observe(layoutRef.current);
    return () => {
      window.removeEventListener('resize', updateCenter);
      ro.disconnect();
    };
  }, [activePage]);

  // Carrega as autoavaliações de exercícios do usuário ativo (chaves
  // "u:<nome>:rating:<exerciseId>") para calcular o score geral — recarrega
  // sempre que o usuário ativo muda (troca de usuário no mesmo navegador).
  useEffect(() => {
    if (!userName) {
      setExerciseRatings({});
      return;
    }
    try {
      const prefix = userKey(userName, 'rating:');
      const loaded = {};
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const value = Number(window.localStorage.getItem(key));
          if (value >= 1 && value <= 5) {
            loaded[key.slice(prefix.length)] = value;
          }
        }
      }
      setExerciseRatings(loaded);
    } catch (error) {
      // Armazenamento indisponível — o score fica vazio nesta sessão.
      setExerciseRatings({});
    }
  }, [userName]);

  // Carrega as units já visitadas pelo usuário ativo em qualquer sessão
  // anterior. "Your Progress" conta essas units (não a posição da unit
  // atual) — assim, se o aluno pular direto pra Unit 70 sem ter visto as
  // anteriores, o progresso não aparece como 70% indevidamente. Prepara
  // também o terreno para uma futura "Unit aleatória", que pode ser aberta
  // fora de ordem.
  useEffect(() => {
    if (!userName) {
      setVisitedUnits({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(userKey(userName, 'visitedUnits'));
      if (raw) {
        const list = JSON.parse(raw);
        const loaded = {};
        list.forEach((unit) => {
          loaded[unit] = true;
        });
        setVisitedUnits(loaded);
      } else {
        setVisitedUnits({});
      }
    } catch (error) {
      // Armazenamento indisponível — progresso conta só a partir de agora.
      setVisitedUnits({});
    }
  }, [userName]);

  useEffect(() => {
    if (!userName) {
      setLastVisitedByCourse({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(userKey(userName, 'lastVisited'));
      if (!raw) {
        setLastVisitedByCourse({});
        return;
      }
      const parsed = JSON.parse(raw);
      // Formato antigo (2026-07-10, versão de 1 ponteiro só): {course, unit,
      // section}. O formato atual é por curso: {vocabulary: {...}, ...}.
      // Sem essa migração, um valor salvo no formato antigo carrega como um
      // objeto sem nenhuma das 3 chaves esperadas e nenhum botão aparece.
      if (parsed && parsed.course && parsed.unit) {
        const migrated = {
          [parsed.course]: { unit: parsed.unit, section: parsed.section, timestamp: Date.now() },
        };
        setLastVisitedByCourse(migrated);
        window.localStorage.setItem(userKey(userName, 'lastVisited'), JSON.stringify(migrated));
        return;
      }
      setLastVisitedByCourse(parsed || {});
    } catch (error) {
      setLastVisitedByCourse({});
    }
  }, [userName]);

  // Recarrega a fila de revisão vencida ao trocar de usuário e a cada troca
  // de página — avaliar um item acontece dentro de um curso, então quando o
  // usuário volta pra Home/Courses a fila já reflete o reagendamento.
  useEffect(() => {
    if (!userName) {
      setReviewQueue([]);
      return;
    }
    setReviewQueue(loadDueReviews(userName));
  }, [userName, activePage]);

  // Agenda (ou reagenda) a revisão espaçada de um item autoavaliado — a
  // próxima data depende só da última nota dada (ver
  // REVIEW_INTERVALS_BY_RATING).
  const scheduleReview = (course, id, rating) => {
    if (!userName) return;
    const days = REVIEW_INTERVALS_BY_RATING[rating] || 7;
    try {
      window.localStorage.setItem(
        userKey(userName, `review:${course}:${id}`),
        JSON.stringify({ rating, ratedAt: Date.now(), due: Date.now() + days * DAY_MS }),
      );
    } catch (error) {
      // Armazenamento indisponível — sem agendamento de revisão.
    }
  };

  // Autoavaliação é voluntária: só entra na média o exercício em que o
  // usuário realmente clicou numa estrela.
  const handleRateExercise = (exerciseId, value) => {
    if (!exerciseId || !userName) return;
    setExerciseRatings((prev) => ({ ...prev, [exerciseId]: value }));
    try {
      window.localStorage.setItem(userKey(userName, `rating:${exerciseId}`), String(value));
    } catch (error) {
      // Armazenamento indisponível — a nota fica só nesta sessão.
    }
    scheduleReview('vocabulary', exerciseId, value);
  };

  const ratingValues = Object.values(exerciseRatings);
  const overallScorePercent = ratingValues.length > 0
    ? Math.round((ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length / 5) * 100)
    : null;

  // Mesmo mecanismo de autoavaliação/progresso do curso Vocabulary, só que
  // por unit (não por exercício — o American English A1 não tem
  // exercícios numerados soltos) e com chaves totalmente separadas
  // ("american1-rating:"/"american1-visitedUnits", em vez de "rating:"/
  // "visitedUnits") para que os resets de cada curso, no Profile, não se
  // misturem.
  useEffect(() => {
    if (!userName) {
      setAmerican1UnitRatings({});
      return;
    }
    try {
      const prefix = userKey(userName, 'american1-rating:');
      const loaded = {};
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const value = Number(window.localStorage.getItem(key));
          if (value >= 1 && value <= 5) {
            loaded[key.slice(prefix.length)] = value;
          }
        }
      }
      setAmerican1UnitRatings(loaded);
    } catch (error) {
      setAmerican1UnitRatings({});
    }
  }, [userName]);

  useEffect(() => {
    if (!userName) {
      setAmerican1VisitedSections({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(userKey(userName, 'american1-visitedUnits'));
      if (raw) {
        const list = JSON.parse(raw);
        const loaded = {};
        list.forEach((sectionKey) => {
          loaded[sectionKey] = true;
        });
        setAmerican1VisitedSections(loaded);
      } else {
        setAmerican1VisitedSections({});
      }
    } catch (error) {
      setAmerican1VisitedSections({});
    }
  }, [userName]);

  const handleRateAmerican1Unit = (unit, value) => {
    if (!unit || !userName) return;
    setAmerican1UnitRatings((prev) => ({ ...prev, [unit]: value }));
    try {
      window.localStorage.setItem(userKey(userName, `american1-rating:${unit}`), String(value));
    } catch (error) {
      // Armazenamento indisponível — a nota fica só nesta sessão.
    }
    scheduleReview('american1', unit, value);
  };

  const american1RatingValues = Object.values(american1UnitRatings);
  const american1ScorePercent = american1RatingValues.length > 0
    ? Math.round((american1RatingValues.reduce((sum, value) => sum + value, 0) / american1RatingValues.length / 5) * 100)
    : null;
  const american1VisitedSectionsCount = Object.keys(american1VisitedSections).length;
  const american1ProgressPercent = american1SectionsTotal > 0
    ? Math.round((american1VisitedSectionsCount / american1SectionsTotal) * 100)
    : 0;

  // Mesmo mecanismo, agora para o Grammar English A1 — chaves
  // "grammarElem-rating:"/"grammarElem-visitedUnits", independentes dos
  // outros dois cursos.
  useEffect(() => {
    if (!userName) {
      setGrammarElemUnitRatings({});
      return;
    }
    try {
      const prefix = userKey(userName, 'grammarElem-rating:');
      const loaded = {};
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const value = Number(window.localStorage.getItem(key));
          if (value >= 1 && value <= 5) {
            loaded[key.slice(prefix.length)] = value;
          }
        }
      }
      setGrammarElemUnitRatings(loaded);
    } catch (error) {
      setGrammarElemUnitRatings({});
    }
  }, [userName]);

  useEffect(() => {
    if (!userName) {
      setGrammarElemVisitedUnits({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(userKey(userName, 'grammarElem-visitedUnits'));
      if (raw) {
        const list = JSON.parse(raw);
        const loaded = {};
        list.forEach((unit) => {
          loaded[unit] = true;
        });
        setGrammarElemVisitedUnits(loaded);
      } else {
        setGrammarElemVisitedUnits({});
      }
    } catch (error) {
      setGrammarElemVisitedUnits({});
    }
  }, [userName]);

  const handleRateGrammarElemUnit = (unit, value) => {
    if (!unit || !userName) return;
    setGrammarElemUnitRatings((prev) => ({ ...prev, [unit]: value }));
    try {
      window.localStorage.setItem(userKey(userName, `grammarElem-rating:${unit}`), String(value));
    } catch (error) {
      // Armazenamento indisponível — a nota fica só nesta sessão.
    }
    scheduleReview('grammarElem', unit, value);
  };

  const grammarElemRatingValues = Object.values(grammarElemUnitRatings);
  const grammarElemScorePercent = grammarElemRatingValues.length > 0
    ? Math.round((grammarElemRatingValues.reduce((sum, value) => sum + value, 0) / grammarElemRatingValues.length / 5) * 100)
    : null;
  const grammarElemVisitedUnitsCount = Object.keys(grammarElemVisitedUnits).length;
  const grammarElemProgressPercent = grammarElemUnitNumbers.length > 0
    ? Math.round((grammarElemVisitedUnitsCount / grammarElemUnitNumbers.length) * 100)
    : 0;

  // Caderno de vocabulário ("My Words"): um único array JSON por usuário
  // (chave "u:<nome>:wordbook") com as palavras salvas e o agendamento de
  // flashcard de cada uma ({step, due} — ver FLASHCARD_STEPS_DAYS).
  useEffect(() => {
    if (!userName) {
      setWordbookEntries([]);
      return;
    }
    try {
      const raw = window.localStorage.getItem(userKey(userName, 'wordbook'));
      const list = raw ? JSON.parse(raw) : [];
      setWordbookEntries(Array.isArray(list) ? list : []);
    } catch (error) {
      setWordbookEntries([]);
    }
  }, [userName]);

  const persistWordbook = (next) => {
    setWordbookEntries(next);
    try {
      window.localStorage.setItem(userKey(userName, 'wordbook'), JSON.stringify(next));
    } catch (error) {
      // Provavelmente estouro de cota do localStorage (as imagens salvas nas
      // palavras são o jeito mais fácil de chegar lá) — diferente de outros
      // dados do app, perder uma imagem em silêncio seria surpreendente pro
      // usuário logo depois de ele ter colado/enviado ela, então avisa.
      window.alert('Could not save — your browser storage is full. Try removing a picture from an older word to free up space.');
    }
  };

  // Palavra nova nasce vencida (due = agora): entra direto na próxima sessão
  // de flashcards, que é quando o usuário de fato a grava pela primeira vez.
  // `image` é opcional (data URL já redimensionada — ver resizeImageFileToDataUrl).
  const handleAddWord = ({ word, meaning, example, context, image }) => {
    const trimmedWord = (word || '').trim();
    if (!trimmedWord || !userName) return;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      word: trimmedWord,
      meaning: (meaning || '').trim(),
      example: (example || '').trim(),
      context: (context || '').trim(),
      image: image || null,
      createdAt: Date.now(),
      step: 0,
      due: Date.now(),
    };
    persistWordbook([entry, ...wordbookEntries]);
  };

  const handleDeleteWord = (id) => {
    persistWordbook(wordbookEntries.filter((entry) => entry.id !== id));
  };

  // Autoavaliação do flashcard: "again" volta ao primeiro degrau da escada
  // de intervalos, "good" sobe um degrau, "easy" sobe dois.
  const handleGradeWord = (id, grade) => {
    persistWordbook(wordbookEntries.map((entry) => {
      if (entry.id !== id) return entry;
      const currentStep = Number.isInteger(entry.step) ? entry.step : 0;
      const nextStep = grade === 'again'
        ? 0
        : Math.min(FLASHCARD_STEPS_DAYS.length - 1, currentStep + (grade === 'easy' ? 2 : 1));
      return { ...entry, step: nextStep, due: Date.now() + FLASHCARD_STEPS_DAYS[nextStep] * DAY_MS };
    }));
  };

  const wordbookDueCount = wordbookEntries.filter((entry) => (entry.due ?? 0) <= Date.now()).length;

  useEffect(() => {
    return () => {
      if (pdfFileUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(pdfFileUrl);
      }
    };
  }, [pdfFileUrl]);

  useEffect(() => {
    if (activePage !== 'unit' || !selectedUnit) {
      return;
    }

    const fileName = `EVIU_PI-${selectedUnit}_L.pdf`;
    setPdfFileUrl((currentUrl) => {
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
      return `/materials/unit_${selectedUnit}/${fileName}`;
    });
    setPdfFileName(fileName);
  }, [selectedUnit, activePage]);

  // Marca a unit como visitada assim que a tela de leitura dela é aberta —
  // é isso que conta pro "Your Progress" no cabeçalho, não o número da unit.
  useEffect(() => {
    if (activePage !== 'unit' || !selectedUnit || !userName) {
      return;
    }
    setVisitedUnits((prev) => {
      if (prev[selectedUnit]) {
        return prev;
      }
      const next = { ...prev, [selectedUnit]: true };
      try {
        window.localStorage.setItem(userKey(userName, 'visitedUnits'), JSON.stringify(Object.keys(next).map(Number)));
      } catch (error) {
        // Armazenamento indisponível — progresso não sobrevive a recarregar.
      }
      return next;
    });
  }, [selectedUnit, activePage, userName]);

  // Mesma ideia, para o American English A1: conta como visitada assim
  // que a tela de leitura de uma seção (1A, 1B, Practical English/Review and Check...)
  // é aberta — cada seção conta um acesso, não a unit inteira, já que as
  // units são longas (3-4 seções cada).
  useEffect(() => {
    if (activePage !== 'american1-unit' || !selectedAmerican1Unit || !selectedAmerican1Section || !userName) {
      return;
    }
    const sectionKey = `${selectedAmerican1Unit}|${selectedAmerican1Section}`;
    setAmerican1VisitedSections((prev) => {
      if (prev[sectionKey]) {
        return prev;
      }
      const next = { ...prev, [sectionKey]: true };
      try {
        window.localStorage.setItem(
          userKey(userName, 'american1-visitedUnits'),
          JSON.stringify(Object.keys(next)),
        );
      } catch (error) {
        // Armazenamento indisponível — progresso não sobrevive a recarregar.
      }
      return next;
    });
  }, [selectedAmerican1Unit, selectedAmerican1Section, activePage, userName]);

  // Mesma ideia, para o Grammar English A1.
  useEffect(() => {
    if (activePage !== 'grammarElem-unit' || !selectedGrammarElemUnit || !userName) {
      return;
    }
    setGrammarElemVisitedUnits((prev) => {
      if (prev[selectedGrammarElemUnit]) {
        return prev;
      }
      const next = { ...prev, [selectedGrammarElemUnit]: true };
      try {
        window.localStorage.setItem(
          userKey(userName, 'grammarElem-visitedUnits'),
          JSON.stringify(Object.keys(next).map(Number)),
        );
      } catch (error) {
        // Armazenamento indisponível — progresso não sobrevive a recarregar.
      }
      return next;
    });
  }, [selectedGrammarElemUnit, activePage, userName]);

  // "Continue where you left off": grava a última unit/seção aberta DE CADA
  // curso (um botão por curso na tela Courses) + timestamp (pra Home saber
  // qual dos 3 foi o mais recente e mostrar só esse). Reage às mesmas 3
  // telas de leitura marcadas como visitadas acima.
  useEffect(() => {
    if (!userName) return;
    let course = null;
    let entry = null;
    if (activePage === 'unit' && selectedUnit) {
      course = 'vocabulary';
      entry = { unit: selectedUnit, timestamp: Date.now() };
    } else if (activePage === 'american1-unit' && selectedAmerican1Unit && selectedAmerican1Section) {
      course = 'american1';
      entry = { unit: selectedAmerican1Unit, section: selectedAmerican1Section, timestamp: Date.now() };
    } else if (activePage === 'grammarElem-unit' && selectedGrammarElemUnit) {
      course = 'grammarElem';
      entry = { unit: selectedGrammarElemUnit, timestamp: Date.now() };
    } else {
      return;
    }
    setLastVisitedByCourse((prev) => {
      const next = { ...prev, [course]: entry };
      try {
        window.localStorage.setItem(userKey(userName, 'lastVisited'), JSON.stringify(next));
      } catch (error) {
        // Armazenamento indisponível — "Continue" some até a próxima visita.
      }
      return next;
    });
  }, [activePage, selectedUnit, selectedAmerican1Unit, selectedAmerican1Section, selectedGrammarElemUnit, userName]);

  // Restaurar posição ao recarregar (F5): sem router, um reload sempre
  // jogava de volta pra Home — grava a página atual + toda unit/seção
  // selecionada em sessionStorage a cada mudança, e RESTORED_POSITION (topo
  // do arquivo) relê isso nos useState iniciais. sessionStorage (não
  // localStorage) de propósito: é só a posição da aba atual, não progresso —
  // some sozinha ao fechar a aba, como uma URL de verdade faria.
  //
  // Mesmo efeito também alimenta o botão Voltar/Avançar do navegador (History
  // API): sem nunca chamar pushState, o app não tinha NENHUMA entrada de
  // histórico própria, então Voltar pulava direto pra página que estava
  // aberta antes de abrir o app. replaceState na 1ª vez (não empilha uma
  // entrada extra pro estado inicial); pushState nas mudanças seguintes.
  // isPopStateRef.current pula esse empilhamento quando a mudança de estado
  // veio DE um Voltar/Avançar (ver o listener de popstate logo abaixo) — sem
  // isso, cada clique em Voltar reempilharia uma entrada pra frente e o
  // usuário nunca conseguiria sair do lugar.
  useEffect(() => {
    if (!userName) return;
    const position = {
      activePage,
      activeCourseId,
      selectedUnit,
      selectedExercise,
      selectedAmerican1Unit,
      selectedAmerican1Section,
      selectedAmerican1Reference,
      selectedGrammarElemUnit,
      selectedGrammarElemAppendix,
      selectedGrammarElemAdditional,
      selectedListeningSource,
      selectedListeningTrack,
    };
    try {
      window.sessionStorage.setItem(SESSION_POSITION_KEY, JSON.stringify(position));
    } catch (error) {
      // Armazenamento indisponível — F5 volta pra Home, sem quebrar nada.
    }

    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    try {
      if (!hasPushedHistoryRef.current) {
        hasPushedHistoryRef.current = true;
        window.history.replaceState(position, '');
      } else {
        window.history.pushState(position, '');
      }
    } catch (error) {
      // History API indisponível — o app continua funcionando, só sem
      // integração com o botão Voltar/Avançar do navegador.
    }
  }, [
    activePage,
    activeCourseId,
    selectedUnit,
    selectedExercise,
    selectedAmerican1Unit,
    selectedAmerican1Section,
    selectedAmerican1Reference,
    selectedGrammarElemUnit,
    selectedGrammarElemAppendix,
    selectedGrammarElemAdditional,
    selectedListeningSource,
    selectedListeningTrack,
    userName,
  ]);

  // Aplica de volta o estado de uma entrada de histórico quando o usuário
  // clica Voltar/Avançar — o event.state é exatamente o objeto `position`
  // gravado pelo pushState/replaceState acima. Marca isPopStateRef ANTES de
  // disparar os setState (React 18+ agrupa tudo isso num commit só), pra o
  // efeito de cima ver a flag ligada quando rodar depois desse commit.
  useEffect(() => {
    const handlePopState = (event) => {
      if (!event.state) return;
      isPopStateRef.current = true;
      if (!userName) {
        // Voltar/Avançar depois de um logout (Switch user/Delete account):
        // a entrada de histórico pode ser de uma tela de curso de quando
        // ainda havia usuário ativo — mas sem login essas telas ficam
        // inconsistentes, então cai no gate de cadastro em vez de restaurar.
        setActivePage('register');
        return;
      }
      const state = event.state;
      setActivePage(state.activePage || 'home');
      setActiveCourseId(state.activeCourseId ?? null);
      setSelectedUnit(state.selectedUnit ?? null);
      setSelectedExercise(state.selectedExercise ?? null);
      setSelectedAmerican1Unit(state.selectedAmerican1Unit ?? null);
      setSelectedAmerican1Section(state.selectedAmerican1Section ?? null);
      setSelectedAmerican1Reference(state.selectedAmerican1Reference ?? null);
      setSelectedGrammarElemUnit(state.selectedGrammarElemUnit ?? null);
      setSelectedGrammarElemAppendix(state.selectedGrammarElemAppendix ?? null);
      setSelectedGrammarElemAdditional(state.selectedGrammarElemAdditional ?? null);
      setSelectedListeningSource(state.selectedListeningSource ?? null);
      setSelectedListeningTrack(state.selectedListeningTrack ?? null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [userName]);

  const handlePdfChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setPdfFileUrl((currentUrl) => {
      if (currentUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
      return URL.createObjectURL(file);
    });
    setPdfFileName(file.name);
    event.target.value = '';
  };

  const handleUnitSelect = (event, unit) => {
    event.preventDefault();
    setActivePage('unit');
    setSelectedUnit(unit);
  };

  const handleNextUnit = (event) => {
    event.preventDefault();
    if (!selectedUnit || selectedUnit >= 100) {
      return;
    }
    setSelectedUnit(selectedUnit + 1);
  };

  const handlePreviousUnit = (event) => {
    event.preventDefault();
    if (!selectedUnit || selectedUnit <= 1) {
      return;
    }
    setSelectedUnit(selectedUnit - 1);
  };

  const handleOpenExercises = () => {
    const ids = exercisesByUnit[selectedUnit] || [];
    setSelectedExercise(ids[0] || null);
    setActivePage('exercises');
  };

  const handleBackToUnit = () => {
    setActivePage('unit');
  };

  const handleHome = (event) => {
    event.preventDefault();
    setActivePage('home');
    setSelectedUnit(null);
    setSelectedAmerican1Unit(null);
    setSelectedAmerican1Section(null);
    setSelectedGrammarElemUnit(null);
    setSelectedGrammarElemAppendix(null);
    setSelectedGrammarElemAdditional(null);
    setActiveCourseId(null);
  };

  // Trava de acesso: só entra em "Courses" (e, por consequência, em
  // vocabulary/american1/unit/exercises, só alcançáveis a partir daqui) quem
  // já tem um nome cadastrado/ativo neste navegador.
  const handleCourses = (event) => {
    event.preventDefault();
    if (!userName) {
      setActivePage('register');
      return;
    }
    setActivePage('courses');
    setSelectedUnit(null);
    setSelectedAmerican1Unit(null);
    setSelectedAmerican1Section(null);
    setSelectedGrammarElemUnit(null);
    setSelectedGrammarElemAppendix(null);
    setSelectedGrammarElemAdditional(null);
    setActiveCourseId(null);
  };

  const handleVocabulary = (event) => {
    event.preventDefault();
    setActivePage('vocabulary');
    setSelectedUnit(null);
    setActiveCourseId('vocabulary');
    setUnitSearchQuery('');
  };

  const handleAmerican1 = (event) => {
    event.preventDefault();
    setActivePage('american1');
    setSelectedAmerican1Unit(null);
    setSelectedAmerican1Section(null);
    setActiveCourseId('american1');
    setUnitSearchQuery('');
  };

  const handleAmerican1UnitSelect = (event, unit) => {
    event.preventDefault();
    const sections = american1SectionsByUnit[unit] || [];
    setActivePage('american1-unit');
    setSelectedAmerican1Unit(unit);
    setSelectedAmerican1Section(sections[0]?.section ?? null);
    setShowAmerican1Answers(false);
  };

  const handlePreviousAmerican1Unit = () => {
    const index = american1UnitNumbers.indexOf(selectedAmerican1Unit);
    if (index <= 0) return;
    const previousUnit = american1UnitNumbers[index - 1];
    setSelectedAmerican1Unit(previousUnit);
    setSelectedAmerican1Section(american1SectionsByUnit[previousUnit]?.[0]?.section ?? null);
    setShowAmerican1Answers(false);
  };

  const handleNextAmerican1Unit = () => {
    const index = american1UnitNumbers.indexOf(selectedAmerican1Unit);
    if (index === -1 || index >= american1UnitNumbers.length - 1) return;
    const nextUnit = american1UnitNumbers[index + 1];
    setSelectedAmerican1Unit(nextUnit);
    setSelectedAmerican1Section(american1SectionsByUnit[nextUnit]?.[0]?.section ?? null);
    setShowAmerican1Answers(false);
  };

  const handleOpenAmerican1Reference = (ref) => {
    setSelectedAmerican1Reference(ref);
    setShowAmerican1ReferenceAnswers(false);
    setActivePage('american1-reference');
  };

  // "Sound Bank" no menu principal: mesma página de referência de sempre
  // (american1-pages/ref/sound/166, o par de páginas 166-167 — fixo, todo
  // american1_references.json aponta pro mesmo par pra todo unit/seção),
  // mas aberta sem unit/section (ref.unit fica undefined de propósito) —
  // é assim que a tela sabe que essa é uma consulta avulsa, não vinda de
  // dentro de uma unit, e esconde o botão "‹ Back to Unit" (ver JSX).
  const handleOpenAmerican1SoundBank = (event) => {
    event.preventDefault();
    setSelectedAmerican1Reference({ type: 'sound', pages: [166, 167] });
    setShowAmerican1ReferenceAnswers(false);
    setActivePage('american1-reference');
  };

  const handleGrammarElem = (event) => {
    event.preventDefault();
    setActivePage('grammarElem');
    setSelectedGrammarElemUnit(null);
    setSelectedGrammarElemAppendix(null);
    setSelectedGrammarElemAdditional(null);
    setActiveCourseId('grammarElem');
    setUnitSearchQuery('');
  };

  const handleGrammarElemUnitSelect = (event, unit) => {
    event.preventDefault();
    setActivePage('grammarElem-unit');
    setSelectedGrammarElemUnit(unit);
    setShowGrammarElemAnswers(false);
  };

  const handlePreviousGrammarElemUnit = () => {
    if (!selectedGrammarElemUnit || selectedGrammarElemUnit <= 1) return;
    setSelectedGrammarElemUnit(selectedGrammarElemUnit - 1);
    setShowGrammarElemAnswers(false);
  };

  const handleNextGrammarElemUnit = () => {
    if (!selectedGrammarElemUnit || selectedGrammarElemUnit >= GRAMMAR_ELEM_UNIT_COUNT) return;
    setSelectedGrammarElemUnit(selectedGrammarElemUnit + 1);
    setShowGrammarElemAnswers(false);
  };

  const handleOpenGrammarElemExercise = () => {
    setActivePage('grammarElem-exercise');
  };

  const handleBackToGrammarElemUnit = () => {
    setActivePage('grammarElem-unit');
  };

  // Appendixes: ficam depois da última unit na lista, mas são uma trilha à
  // parte — sem áudio, sem exercícios, e (de propósito) sem marcar
  // "visited" em nenhum lugar, então nunca entram na contabilidade de
  // "Your Progress" da unit.
  const handleGrammarElemAppendixSelect = (event, appendixNumber) => {
    event.preventDefault();
    setActivePage('grammarElem-appendix');
    setSelectedGrammarElemAppendix(appendixNumber);
    setSelectedGrammarElemUnit(null);
    setSelectedGrammarElemAdditional(null);
    setActiveCourseId('grammarElem');
  };

  const handlePreviousGrammarElemAppendix = () => {
    if (!selectedGrammarElemAppendix || selectedGrammarElemAppendix <= 1) return;
    setSelectedGrammarElemAppendix(selectedGrammarElemAppendix - 1);
  };

  const handleNextGrammarElemAppendix = () => {
    if (!selectedGrammarElemAppendix || selectedGrammarElemAppendix >= GRAMMAR_ELEM_APPENDIX_COUNT) return;
    setSelectedGrammarElemAppendix(selectedGrammarElemAppendix + 1);
  };

  // Additional Exercises: mesma ideia dos Appendixes — trilha à parte, sem
  // marcar "visited" em lugar nenhum, então nunca entra em "Your Progress".
  const handleGrammarElemAdditionalSelect = (event, additionalNumber) => {
    event.preventDefault();
    setActivePage('grammarElem-additional');
    setSelectedGrammarElemAdditional(additionalNumber);
    setSelectedGrammarElemUnit(null);
    setSelectedGrammarElemAppendix(null);
    setActiveCourseId('grammarElem');
  };

  const handlePreviousGrammarElemAdditional = () => {
    if (!selectedGrammarElemAdditional || selectedGrammarElemAdditional <= 1) return;
    setSelectedGrammarElemAdditional(selectedGrammarElemAdditional - 1);
  };

  const handleNextGrammarElemAdditional = () => {
    if (!selectedGrammarElemAdditional || selectedGrammarElemAdditional >= GRAMMAR_ELEM_ADDITIONAL_COUNT) return;
    setSelectedGrammarElemAdditional(selectedGrammarElemAdditional + 1);
  };

  const handleCloseAmerican1Reference = () => {
    setSelectedAmerican1Reference(null);
    setActivePage('american1-unit');
  };

  const handleOpenAmerican1Transcriptions = () => {
    setActivePage('american1-transcriptions');
  };

  const handleCloseAmerican1Transcriptions = () => {
    setActivePage('american1-unit');
  };

  // Tela "Listening" do menu principal: hub -> fonte -> track (ver
  // LISTENING_SOURCES/listening_american1.json). Link do menu abre sempre no
  // hub, mesmo se já havia uma fonte/track selecionada de uma visita anterior.
  const handleOpenListening = (event) => {
    event.preventDefault();
    setActivePage('listening');
    setActiveCourseId(null);
  };

  const handleOpenListeningSource = (source) => {
    setSelectedListeningSource(source.id);
    setActivePage('listening-tracks');
    setListeningSearchQuery('');
    setHideMasteredListening(false);
  };

  const handleOpenListeningTrack = (track) => {
    setSelectedListeningTrack(track.id);
    setActivePage('listening-exercise');
  };

  // "Next Listening": pula pro próximo exercício da MESMA fonte (a ordem de
  // `tracks` no JSON já é a ordem "number" exibida), sem passar pela lista.
  const handleNextListeningTrack = () => {
    const source = LISTENING_SOURCES.find((item) => item.id === selectedListeningSource);
    const tracks = source?.tracks || [];
    const index = tracks.findIndex((item) => item.id === selectedListeningTrack);
    if (index === -1 || index >= tracks.length - 1) return;
    setSelectedListeningTrack(tracks[index + 1].id);
  };

  const handleBackToListeningHub = () => {
    setActivePage('listening');
    setSelectedListeningSource(null);
    setSelectedListeningTrack(null);
  };

  const handleBackToListeningTracks = () => {
    setActivePage('listening-tracks');
    setSelectedListeningTrack(null);
  };

  // Abre um item vencido do "Today's Review" direto na tela onde ele é
  // estudado (e reavaliado — é a reavaliação que agenda a próxima repetição).
  const handleOpenReviewItem = (item) => {
    if (item.course === 'vocabulary') {
      const unit = Number(item.id.split('.')[0]);
      if (!exerciseCoords[item.id] || !unit) return;
      setSelectedUnit(unit);
      setSelectedExercise(item.id);
      setActiveCourseId('vocabulary');
      setActivePage('exercises');
    } else if (item.course === 'american1') {
      const unit = Number(item.id);
      const sections = american1SectionsByUnit[unit] || [];
      if (sections.length === 0) return;
      setSelectedAmerican1Unit(unit);
      setSelectedAmerican1Section(sections[0]?.section ?? null);
      setShowAmerican1Answers(false);
      setActiveCourseId('american1');
      setActivePage('american1-unit');
    } else if (item.course === 'grammarElem') {
      const unit = Number(item.id);
      if (!unit || unit > GRAMMAR_ELEM_UNIT_COUNT) return;
      setSelectedGrammarElemUnit(unit);
      setShowGrammarElemAnswers(false);
      setActiveCourseId('grammarElem');
      setActivePage('grammarElem-unit');
    }
  };

  // Navegação direta pro "Today's Plan" (Home) — pula a tela de lista do
  // curso, então (diferente de handleUnitSelect/handleAmerican1UnitSelect/
  // handleGrammarElemUnitSelect, que dependem da lista já ter marcado
  // activeCourseId um passo antes) precisam marcar activeCourseId elas
  // mesmas, senão o cabeçalho ("You are in the... Course") e o link
  // "All Units" ficam quebrados ao entrar direto pela Home.
  const openVocabularyUnit = (unit) => {
    setActivePage('unit');
    setSelectedUnit(unit);
    setActiveCourseId('vocabulary');
  };

  const openAmerican1Section = (unit, section) => {
    setActivePage('american1-unit');
    setSelectedAmerican1Unit(unit);
    setSelectedAmerican1Section(section);
    setShowAmerican1Answers(false);
    setActiveCourseId('american1');
  };

  const openGrammarElemUnit = (unit) => {
    setActivePage('grammarElem-unit');
    setSelectedGrammarElemUnit(unit);
    setShowGrammarElemAnswers(false);
    setActiveCourseId('grammarElem');
  };

  // Mesma trava de acesso de "Courses"/"My Profile": o caderno de palavras é
  // por usuário, então sem alguém logado cai na tela de registro.
  const handleOpenWordbook = (event) => {
    event.preventDefault();
    if (!userName) {
      setActivePage('register');
      return;
    }
    setActivePage('wordbook');
    setSelectedUnit(null);
    setSelectedAmerican1Unit(null);
    setSelectedAmerican1Section(null);
    setSelectedGrammarElemUnit(null);
    setSelectedGrammarElemAppendix(null);
    setSelectedGrammarElemAdditional(null);
    setActiveCourseId(null);
  };

  const handleOpenProfile = (event) => {
    event.preventDefault();
    if (!userName) {
      setActivePage('register');
      return;
    }
    setActivePage('profile');
    setSelectedUnit(null);
    setSelectedAmerican1Unit(null);
    setSelectedAmerican1Section(null);
    setSelectedGrammarElemUnit(null);
    setSelectedGrammarElemAppendix(null);
    setSelectedGrammarElemAdditional(null);
    setActiveCourseId(null);
  };

  // Cadastro é só-nome, sem senha: se o nome digitado já existe na lista
  // (case-insensitive), reaproveita o cadastro existente (== "login") em vez
  // de criar um duplicado — é assim que dá pra "trocar" para um usuário já
  // conhecido neste navegador sem precisar de uma tela de login separada.
  const handleRegisterSubmit = (event) => {
    event.preventDefault();
    const trimmed = registerNameInput.trim();
    if (!trimmed) {
      setRegisterError('Please enter your name.');
      return;
    }

    const existing = registeredUsers.find((name) => name.toLowerCase() === trimmed.toLowerCase());
    const canonicalName = existing || trimmed;

    if (!existing) {
      const isFirstEverUser = registeredUsers.length === 0;
      const nextUsers = [...registeredUsers, canonicalName];
      setRegisteredUsers(nextUsers);
      saveUsers(nextUsers);
      if (isFirstEverUser) {
        migrateLegacyDataToUser(canonicalName);
      }
    }

    setUserName(canonicalName);
    try {
      window.localStorage.setItem(ACTIVE_USER_KEY, canonicalName);
    } catch (error) {
      // Armazenamento indisponível — sessão fica só nesta aba.
    }
    setRegisterNameInput('');
    setRegisterError('');
    setActivePage('courses');
  };

  const handleContinueAs = (name) => {
    setUserName(name);
    try {
      window.localStorage.setItem(ACTIVE_USER_KEY, name);
    } catch (error) {
      // Armazenamento indisponível — sessão fica só nesta aba.
    }
    setActivePage('courses');
  };

  // "Log out": limpa só o ponteiro de usuário ativo — a lista de usuários e
  // o progresso de cada um continuam intactos no localStorage.
  const handleSwitchUser = () => {
    setUserName('');
    try {
      window.localStorage.removeItem(ACTIVE_USER_KEY);
      // Sem isso, um F5 depois do próximo login (mesma aba, outro usuário —
      // cenário comum de PC/pendrive compartilhado) restauraria a posição
      // de navegação de QUEM SAIU, já que sessionStorage não é namespaced
      // por usuário como o localStorage (ver userKey/RESTORED_POSITION).
      window.sessionStorage.removeItem(SESSION_POSITION_KEY);
    } catch (error) {
      // Armazenamento indisponível.
    }
    setActivePage('register');
    setSelectedUnit(null);
    setSelectedAmerican1Unit(null);
    setSelectedAmerican1Section(null);
    setSelectedGrammarElemUnit(null);
    setSelectedGrammarElemAppendix(null);
    setSelectedGrammarElemAdditional(null);
    setActiveCourseId(null);
  };

  // Diferente do "Switch user" (só desloga): apaga de vez o namespace
  // inteiro "u:<nome>:*" do usuário ativo (progresso, notas, respostas e
  // avaliações de todos os cursos) e a entrada dele na lista de usuários
  // registrados. Sem volta.
  const handleDeleteAccount = () => {
    if (!userName) return;
    if (!window.confirm(`Delete the registered user "${userName}" and ALL of their data (progress, scores, notes, answers) across every course? This cannot be undone.`)) {
      return;
    }
    try {
      const scopedPrefix = `u:${encodeURIComponent(userName)}:`;
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(scopedPrefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    } catch (error) {
      // Armazenamento indisponível.
    }

    const nextUsers = registeredUsers.filter((name) => name !== userName);
    setRegisteredUsers(nextUsers);
    saveUsers(nextUsers);

    setUserName('');
    try {
      window.localStorage.removeItem(ACTIVE_USER_KEY);
      window.sessionStorage.removeItem(SESSION_POSITION_KEY);
    } catch (error) {
      // Armazenamento indisponível.
    }
    setActivePage('register');
    setSelectedUnit(null);
    setSelectedAmerican1Unit(null);
    setSelectedAmerican1Section(null);
    setSelectedGrammarElemUnit(null);
    setSelectedGrammarElemAppendix(null);
    setSelectedGrammarElemAdditional(null);
    setActiveCourseId(null);
  };

  // Link discreto na tela de cadastro (só aparece se já houver algum usuário
  // registrado — é ali que a lista de "Continue as <nome>" aparece). Apaga
  // literalmente TODO o localStorage desta origem, todos os usuários de uma
  // vez, não só o ativo — pensado pra quando a lista de "Continue as" mostra
  // gente que você não reconhece (ex.: duas cópias do app rodando na mesma
  // porta por engano, ver StartLearning.bat) e entrar em cada usuário pra
  // apagar um por um seria chato. Diferente de handleDeleteAccount (que
  // exige estar logado num usuário específico), este funciona sem login.
  const handleResetAllBrowserData = () => {
    if (!window.confirm('Delete EVERY registered user and ALL of their data (progress, scores, notes, My Words) on this browser? This cannot be undone.')) {
      return;
    }
    try {
      window.localStorage.clear();
      window.sessionStorage.removeItem(SESSION_POSITION_KEY);
    } catch (error) {
      // Armazenamento indisponível.
    }
    setRegisteredUsers([]);
    setRegisterNameInput('');
    setRegisterError('');
  };

  // Remove do localStorage todas as chaves do usuário ativo que começam com
  // um prefixo (ex.: "answers:", "rating:", "notes:") — usado pelos botões
  // de reset do perfil. Escopado por usuário para não apagar o progresso de
  // outra pessoa que também usa este navegador.
  // `exclude`: pula chaves cujo restante (depois do prefixo) comece com esse
  // valor — usado só para separar o reset de notas do curso Vocabulary do
  // American English A1, já que as duas compartilham o mesmo prefixo
  // "notes:" (ver handleExportNotes).
  const removeLocalStorageKeysWithPrefix = (prefix, exclude) => {
    if (!userName) return;
    const excludeList = Array.isArray(exclude) ? exclude : exclude ? [exclude] : [];
    try {
      const scopedPrefix = userKey(userName, prefix);
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(scopedPrefix)) continue;
        const remainder = key.slice(scopedPrefix.length);
        if (excludeList.some((ex) => remainder.startsWith(ex))) continue;
        keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    } catch (error) {
      // Armazenamento indisponível — nada para limpar.
    }
  };

  // Se o progresso de um curso acabou de ser resetado, o "Continue where you
  // left off" desse curso fica órfão (levaria a uma unit "não visitada" com
  // um botão dizendo "continue"). Chamado pelos resets de progresso/"reset
  // all" dos 3 cursos.
  const clearLastVisitedForCourse = (course) => {
    setLastVisitedByCourse((prev) => {
      if (!prev[course]) return prev;
      const next = { ...prev };
      delete next[course];
      try {
        window.localStorage.setItem(userKey(userName, 'lastVisited'), JSON.stringify(next));
      } catch (error) {
        // Armazenamento indisponível.
      }
      return next;
    });
  };

  // Junta as anotações ("My Notes") de todas as units num único .txt e
  // dispara o download. As notas são salvas como HTML (negrito/marca-texto),
  // então convertemos para texto puro antes de exportar. `courseFilter`
  // ('vocabulary' | 'american1' | undefined) limita o export a um curso —
  // usado pelos botões de export separados por curso no Profile.
  const handleExportNotes = (courseFilter) => {
    if (!userName) return;
    try {
      const entries = [];
      const prefix = userKey(userName, 'notes:');
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;

        // Três notações possíveis depois do prefixo: "<unit>" (curso
        // Vocabulary), "american1:<unit>" (UnitNotes da seção) ou
        // "american1-ref:<type>:<page>" (UnitNotes de uma página de
        // referência — Grammar/Vocabulary/Sound Bank/Communication/Writing,
        // cada uma com sua própria anotação, independente da seção) — cada
        // uma vira um título diferente no export.
        const remainder = key.slice(prefix.length);
        const american1Match = remainder.match(/^american1:(\d+)$/);
        const american1RefMatch = remainder.match(/^american1-ref:([a-z]+):(\d+)$/);
        const html = window.localStorage.getItem(key) || '';

        if (american1RefMatch) {
          const [, refType, refPage] = american1RefMatch;
          entries.push({
            course: 'american1',
            unit: `ref-${refType}-${refPage}`,
            title: `American English A1 - ${AMERICAN1_REFERENCE_LABELS[refType] || refType} p.${refPage}`,
            html,
          });
        } else if (american1Match) {
          entries.push({
            course: 'american1',
            unit: Number(american1Match[1]),
            title: `American English A1 - Unit ${american1Match[1]}`,
            html,
          });
        } else if (remainder === 'american1-transcriptions') {
          entries.push({
            course: 'american1',
            unit: 'transcriptions',
            title: 'American English A1 - Transcriptions',
            html,
          });
        } else {
          const unit = Number(remainder);
          entries.push({
            course: 'vocabulary',
            unit,
            title: `Unit ${unit}${unitTable[unit] ? ` - ${unitTable[unit]}` : ''}`,
            html,
          });
        }
      }

      const filteredEntries = courseFilter
        ? entries.filter((entry) => entry.course === courseFilter)
        : entries;

      if (filteredEntries.length === 0) {
        window.alert('No lesson notes saved yet.');
        return;
      }

      filteredEntries.sort((a, b) => (
        a.course.localeCompare(b.course)
        || (typeof a.unit === 'number' && typeof b.unit === 'number' ? a.unit - b.unit : 0)
        || String(a.unit).localeCompare(String(b.unit))
      ));

      // O editor de notas quebra cada linha em uma <div> própria (e Shift+Enter
      // vira <br>) — textContent ignora essas fronteiras de bloco e junta tudo
      // sem espaço nenhum, então precisamos inserir "\n" nós mesmos antes de
      // extrair o texto.
      const htmlToText = (html) => {
        const container = document.createElement('div');
        container.innerHTML = html;
        container.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
        container.querySelectorAll('div, p').forEach((el) => el.append('\n'));
        return (container.textContent || '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      };

      const content = filteredEntries
        .map(({ title, html }) => {
          const text = htmlToText(html) || '(empty)';
          return `${title}\n${'-'.repeat(title.length)}\n${text}\n`;
        })
        .join('\n');

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = courseFilter === 'american1'
        ? 'my-notes-american-english-level-1.txt'
        : courseFilter === 'vocabulary'
          ? 'my-notes-vocabulary-pre-intermediate.txt'
          : 'my-notes.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert('Could not export your notes.');
    }
  };

  // Backup/restore completo do progresso de UM usuário (respostas, notas,
  // autoavaliações, units visitadas, My Words, "Continue where you left
  // off"...) — diferente do "Export lesson notes" acima (só notas, em
  // .txt, só pra leitura humana), este é um dump 1:1 de TODO o namespace
  // "u:<nome>:*" do localStorage, pensado pra restaurar depois de limpar o
  // cache ou trocar de navegador/computador (o localStorage nunca sai
  // daquele navegador — nem OneDrive nem git protegem isso, é local puro).
  // Dump genérico por chave, não uma lista hardcoded de prefixos — assim
  // qualquer chave nova que uma feature futura adicionar já entra no
  // backup de graça, sem precisar lembrar de atualizar esta função.
  const handleExportBackup = () => {
    if (!userName) return;
    try {
      const prefix = userKey(userName, '');
      const data = {};
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith(prefix)) continue;
        data[key.slice(prefix.length)] = window.localStorage.getItem(key);
      }
      if (Object.keys(data).length === 0) {
        window.alert('Nothing to back up yet — no progress saved for this user.');
        return;
      }
      const backup = {
        app: 'lets-learn-english-backup',
        version: 1,
        userName,
        exportedAt: new Date().toISOString(),
        data,
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const datePart = new Date().toISOString().slice(0, 10);
      link.download = `lets-learn-english-backup-${userName}-${datePart}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert('Could not export your backup.');
    }
  };

  // Restaura um backup gerado por handleExportBackup — sempre nas chaves do
  // usuário ATIVO agora (não necessariamente o mesmo "userName" salvo no
  // arquivo: o cenário típico é reinstalar/trocar de navegador, recadastrar
  // o mesmo nome ali, e importar por cima). Escreve direto no localStorage
  // e recarrega a página em vez de tentar sincronizar manualmente cada
  // pedaço de estado React espalhado pelo app — muito mais simples e sem
  // risco de esquecer algum setState.
  const handleImportBackupFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !userName) return;
    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch (error) {
        window.alert("Could not read this file — make sure it's a backup .json exported from this app.");
        return;
      }
      if (!parsed || typeof parsed.data !== 'object' || parsed.data === null) {
        window.alert("This file doesn't look like a Let's Learn English backup.");
        return;
      }
      const keys = Object.keys(parsed.data).filter((k) => typeof parsed.data[k] === 'string');
      if (keys.length === 0) {
        window.alert('This backup file is empty.');
        return;
      }
      const fromDifferentUser = parsed.userName && parsed.userName !== userName;
      const warning = fromDifferentUser
        ? `This backup was exported from "${parsed.userName}". `
        : '';
      if (!window.confirm(
        `${warning}Import ${keys.length} saved item(s) into "${userName}"? This will overwrite any matching progress, notes, answers and ratings already saved for this user on this browser. This cannot be undone.`,
      )) {
        return;
      }
      try {
        keys.forEach((relativeKey) => {
          window.localStorage.setItem(userKey(userName, relativeKey), parsed.data[relativeKey]);
        });
      } catch (error) {
        window.alert('Could not write the backup to this browser (storage may be full or unavailable).');
        return;
      }
      window.alert('Backup imported. The page will reload to apply it.');
      window.location.reload();
    };
    reader.onerror = () => {
      window.alert('Could not read this file.');
    };
    reader.readAsText(file);
  };

  const handleResetProgress = () => {
    if (!window.confirm('Reset your unit progress? This cannot be undone.')) {
      return;
    }
    setVisitedUnits({});
    clearLastVisitedForCourse('vocabulary');
    try {
      window.localStorage.removeItem(userKey(userName, 'visitedUnits'));
    } catch (error) {
      // Armazenamento indisponível.
    }
  };

  const handleResetSelfEvaluation = () => {
    if (!window.confirm('Reset your self-evaluation score and every star rating you gave? This cannot be undone.')) {
      return;
    }
    setExerciseRatings({});
    removeLocalStorageKeysWithPrefix('rating:');
    removeLocalStorageKeysWithPrefix('review:vocabulary:');
  };

  const handleResetLessonNotes = () => {
    if (!window.confirm('Reset your "My Notes" for every unit? This cannot be undone.')) {
      return;
    }
    // exclude 'american1' — essas notas têm seu próprio botão de reset, ver
    // handleResetAmerican1Notes.
    removeLocalStorageKeysWithPrefix('notes:', ['american1', 'grammarElem']);
  };

  const handleResetExerciseAnswers = () => {
    if (!window.confirm('Reset your written answers for every exercise? This cannot be undone.')) {
      return;
    }
    removeLocalStorageKeysWithPrefix('answers:');
  };

  const handleResetAll = () => {
    if (!window.confirm('Reset EVERYTHING for English Vocabulary B — progress, self-evaluation, lesson notes and exercise answers? This cannot be undone.')) {
      return;
    }
    setVisitedUnits({});
    setExerciseRatings({});
    clearLastVisitedForCourse('vocabulary');
    try {
      window.localStorage.removeItem(userKey(userName, 'visitedUnits'));
    } catch (error) {
      // Armazenamento indisponível.
    }
    removeLocalStorageKeysWithPrefix('rating:');
    removeLocalStorageKeysWithPrefix('review:vocabulary:');
    removeLocalStorageKeysWithPrefix('notes:', ['american1', 'grammarElem']);
    removeLocalStorageKeysWithPrefix('answers:');
  };

  // Equivalentes dos resets acima, só que para o American English A1 —
  // chaves totalmente separadas (ver american1UnitRatings/american1VisitedSections
  // e o comentário em removeLocalStorageKeysWithPrefix), então resetar um
  // curso nunca afeta o progresso do outro.
  const handleResetAmerican1Progress = () => {
    if (!window.confirm('Reset your American English A1 section progress? This cannot be undone.')) {
      return;
    }
    setAmerican1VisitedSections({});
    clearLastVisitedForCourse('american1');
    try {
      window.localStorage.removeItem(userKey(userName, 'american1-visitedUnits'));
    } catch (error) {
      // Armazenamento indisponível.
    }
  };

  const handleResetAmerican1SelfEvaluation = () => {
    if (!window.confirm('Reset your American English A1 self-evaluation score and every star rating you gave? This cannot be undone.')) {
      return;
    }
    setAmerican1UnitRatings({});
    removeLocalStorageKeysWithPrefix('american1-rating:');
    removeLocalStorageKeysWithPrefix('review:american1:');
  };

  const handleResetAmerican1Notes = () => {
    if (!window.confirm('Reset your American English A1 "My Notes" for every unit and reference page? This cannot be undone.')) {
      return;
    }
    removeLocalStorageKeysWithPrefix('notes:american1');
  };

  const handleResetAmerican1All = () => {
    if (!window.confirm('Reset EVERYTHING for American English A1 — progress, self-evaluation and lesson notes? This cannot be undone.')) {
      return;
    }
    setAmerican1VisitedSections({});
    setAmerican1UnitRatings({});
    clearLastVisitedForCourse('american1');
    try {
      window.localStorage.removeItem(userKey(userName, 'american1-visitedUnits'));
    } catch (error) {
      // Armazenamento indisponível.
    }
    removeLocalStorageKeysWithPrefix('american1-rating:');
    removeLocalStorageKeysWithPrefix('review:american1:');
    removeLocalStorageKeysWithPrefix('notes:american1');
  };

  const handleResetGrammarElemProgress = () => {
    if (!window.confirm('Reset your Grammar English A1 unit progress? This cannot be undone.')) {
      return;
    }
    setGrammarElemVisitedUnits({});
    clearLastVisitedForCourse('grammarElem');
    try {
      window.localStorage.removeItem(userKey(userName, 'grammarElem-visitedUnits'));
    } catch (error) {
      // Armazenamento indisponível.
    }
  };

  const handleResetGrammarElemSelfEvaluation = () => {
    if (!window.confirm('Reset your Grammar English A1 self-evaluation score and every star rating you gave? This cannot be undone.')) {
      return;
    }
    setGrammarElemUnitRatings({});
    removeLocalStorageKeysWithPrefix('grammarElem-rating:');
    removeLocalStorageKeysWithPrefix('review:grammarElem:');
  };

  const handleResetGrammarElemNotes = () => {
    if (!window.confirm('Reset your Grammar English A1 "My Notes" for every unit? This cannot be undone.')) {
      return;
    }
    removeLocalStorageKeysWithPrefix('notes:grammarElem');
  };

  const handleResetGrammarElemAnswers = () => {
    if (!window.confirm('Reset your Grammar English A1 written answers for every unit? This cannot be undone.')) {
      return;
    }
    removeLocalStorageKeysWithPrefix('answers:grammarElem');
  };

  const handleResetGrammarElemAll = () => {
    if (!window.confirm('Reset EVERYTHING for Grammar English A1 — progress, self-evaluation, lesson notes and answers? This cannot be undone.')) {
      return;
    }
    setGrammarElemVisitedUnits({});
    setGrammarElemUnitRatings({});
    clearLastVisitedForCourse('grammarElem');
    try {
      window.localStorage.removeItem(userKey(userName, 'grammarElem-visitedUnits'));
    } catch (error) {
      // Armazenamento indisponível.
    }
    removeLocalStorageKeysWithPrefix('grammarElem-rating:');
    removeLocalStorageKeysWithPrefix('review:grammarElem:');
    removeLocalStorageKeysWithPrefix('notes:grammarElem');
    removeLocalStorageKeysWithPrefix('answers:grammarElem');
  };

  const toggleProfileCourse = (courseId) => {
    setExpandedProfileCourses((prev) => ({ ...prev, [courseId]: !prev[courseId] }));
  };

  const clampPanelWidths = (nextRightWidth) => {
    const layoutWidth = layoutRef.current?.getBoundingClientRect().width || 0;
    const availableWidth = layoutWidth - 14;
    const maxRightWidth = Math.max(MIN_RIGHT_WIDTH, availableWidth - MIN_CENTER_WIDTH);
    return Math.min(Math.max(nextRightWidth, MIN_RIGHT_WIDTH), maxRightWidth);
  };

  const startPanelResize = (event) => {
    event.preventDefault();
    startDragRef.current = { startX: event.clientX, rightWidth };
    window.addEventListener('pointermove', resizePanel);
    window.addEventListener('pointerup', stopPanelResize);
  };

  const resizePanel = (event) => {
    const drag = startDragRef.current;
    if (!drag) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    setRightWidth(clampPanelWidths(drag.rightWidth - deltaX));
  };

  const stopPanelResize = () => {
    startDragRef.current = null;
    window.removeEventListener('pointermove', resizePanel);
    window.removeEventListener('pointerup', stopPanelResize);
  };

  const unitExercises = selectedUnit ? exercisesByUnit[selectedUnit] || [] : [];
  const activeExerciseId =
    selectedExercise && unitExercises.includes(selectedExercise)
      ? selectedExercise
      : unitExercises[0] || null;
  const activeCoords = activeExerciseId ? exerciseCoords[activeExerciseId] : null;
  const exerciseFileUrl = activeCoords
    ? `/materials/unit_${selectedUnit}/EVIU_PI-${selectedUnit}${activeCoords.suffix}.pdf`
    : '';
  const activeIndex = activeExerciseId ? unitExercises.indexOf(activeExerciseId) : -1;
  const answerCoords = activeExerciseId ? answersCoords[activeExerciseId] : null;

  // As respostas ficam ocultas por padrão; só aparecem ao clicar em "Show
  // answers". Ao trocar de exercício ou de unidade, esconde de novo.
  useEffect(() => {
    setShowAnswers(false);
  }, [activeExerciseId, selectedUnit]);

  const handlePreviousExercise = () => {
    if (activeIndex > 0) {
      setSelectedExercise(unitExercises[activeIndex - 1]);
    }
  };

  const handleNextExercise = () => {
    if (activeIndex >= 0 && activeIndex < unitExercises.length - 1) {
      setSelectedExercise(unitExercises[activeIndex + 1]);
    }
  };

  const isLastExercise = activeIndex >= 0 && activeIndex === unitExercises.length - 1;

  // Vai para a Unit de LEITURA seguinte (não os exercícios): abre a página da
  // unidade N+1 com o PDF _L, como na navegação normal de unidades.
  const handleGoToNextReadingUnit = () => {
    if (selectedUnit < 100) {
      setSelectedUnit(selectedUnit + 1);
      setActivePage('unit');
    }
  };

  // Player ancorado só aparece sobre o PDF _L carregado automaticamente pela
  // unit — some se o usuário substituir por um upload próprio.
  const unitMaterialPdfUrl = selectedUnit
    ? `/materials/unit_${selectedUnit}/EVIU_PI-${selectedUnit}_L.pdf`
    : null;
  const unitAudioAnchors =
    selectedUnit && pdfFileUrl === unitMaterialPdfUrl
      ? audioAnchorsCoords[String(selectedUnit)] || []
      : [];

  // Verdadeiro em qualquer tela "dentro" de um curso (unit, exercícios,
  // página de teste do Course 2...), não só nas telas de unit/exercícios.
  const insideCourse = Boolean(selectedUnit) || Boolean(selectedAmerican1Unit)
    || Boolean(selectedGrammarElemUnit) || Boolean(selectedGrammarElemAppendix)
    || Boolean(selectedGrammarElemAdditional);
  const visitedUnitsCount = Object.keys(visitedUnits).length;

  // "Today's Plan" (Home): um empurrão de "por onde começar" pra quem senta
  // pra estudar sem saber — mistura 1 sugestão de conteúdo novo + até 2
  // revisões vencidas (mesma fonte do ReviewCard) + 1 sugestão de listening.
  // "Novo" e "listening" apontam pra cursos DIFERENTES quando possível (só
  // repetem o mesmo curso se os outros dois já estiverem 100% visitados) —
  // dá pra reaproveitar a mesma busca de "próxima unit não visitada" pros
  // dois, só pegando o 1º e o 2º candidato da lista.
  const findNextUnvisitedByCourse = () => {
    const nextVocabUnit = unitItems.find((unit) => !visitedUnits[unit.number]);
    let nextAmerican1 = null;
    for (const unit of american1UnitNumbers) {
      const sections = american1SectionsByUnit[unit] || [];
      const section = sections.find((s) => !american1VisitedSections[`${unit}|${s.section}`]);
      if (section) {
        nextAmerican1 = { unit, section: section.section, title: section.title };
        break;
      }
    }
    const nextGrammarElemUnit = grammarElemUnitNumbers.find((unit) => !grammarElemVisitedUnits[unit]);

    const candidates = [];
    if (nextVocabUnit) {
      candidates.push({
        label: `Unit ${nextVocabUnit.number}: ${nextVocabUnit.label}`,
        sublabel: 'English Vocabulary B',
        onOpen: () => openVocabularyUnit(nextVocabUnit.number),
      });
    }
    if (nextAmerican1) {
      // Seções A/B/C ficam coladas no número ("Unit 2A"), igual ao resto do
      // app — mas as seções especiais ("Review and Check", "Practical
      // English") são palavras inteiras, não uma letra, e o título delas já
      // repete esse nome (ex. title "Review and Check 1&2") — colar direto
      // vira "Unit 2Review and Check: Review and Check 1&2".
      const isLetterSection = /^[A-C]$/.test(nextAmerican1.section);
      candidates.push({
        label: isLetterSection
          ? `Unit ${nextAmerican1.unit}${nextAmerican1.section}: ${nextAmerican1.title}`
          : `Unit ${nextAmerican1.unit}: ${nextAmerican1.title}`,
        sublabel: 'American English A1',
        onOpen: () => openAmerican1Section(nextAmerican1.unit, nextAmerican1.section),
      });
    }
    if (nextGrammarElemUnit) {
      candidates.push({
        label: `Unit ${nextGrammarElemUnit}`,
        sublabel: 'Grammar English A1',
        onOpen: () => openGrammarElemUnit(nextGrammarElemUnit),
      });
    }
    return candidates;
  };

  // Busca nas 3 grades de unit ("Em qual unit ficava phrasal verbs?"): filtra
  // pelo título/tópico já indexado (unitTable pro Vocabulary,
  // american1UnitSearchText — título+grammar+vocabulary+pronunciation de
  // TODAS as seções — pro American1, grammarElemIndex pro Grammar
  // Elementary) e também pelo número da unit em texto, pra "24" achar a
  // Unit 24 direto.
  const unitSearchNormalized = unitSearchQuery.trim().toLowerCase();
  const filteredUnitItems = unitSearchNormalized
    ? unitItems.filter((unit) => unit.label.toLowerCase().includes(unitSearchNormalized) || String(unit.number).includes(unitSearchNormalized))
    : unitItems;
  const filteredAmerican1UnitNumbers = unitSearchNormalized
    ? american1UnitNumbers.filter((unit) => (american1UnitSearchText[unit] || '').includes(unitSearchNormalized) || String(unit).includes(unitSearchNormalized))
    : american1UnitNumbers;
  const filteredGrammarElemUnitNumbers = unitSearchNormalized
    ? grammarElemUnitNumbers.filter((unit) => getGrammarElemUnitTitle(unit).toLowerCase().includes(unitSearchNormalized) || String(unit).includes(unitSearchNormalized))
    : grammarElemUnitNumbers;

  const unvisitedCandidates = userName ? findNextUnvisitedByCourse() : [];
  const planNewUnit = unvisitedCandidates[0] || null;
  const planListening = unvisitedCandidates[1] || null;

  // "Continue where you left off": um botão por curso (tela Courses, usa
  // lastVisitedByCourse[courseId] direto) + um só na Home (o curso com o
  // timestamp mais recente entre os 3 — "onde você parou", no singular).
  const openLastVisitedEntry = (course, entry) => {
    if (!entry) return;
    if (course === 'vocabulary') {
      openVocabularyUnit(entry.unit);
    } else if (course === 'american1') {
      openAmerican1Section(entry.unit, entry.section);
    } else if (course === 'grammarElem') {
      openGrammarElemUnit(entry.unit);
    }
  };
  const formatLastVisitedLabel = (course, entry) => {
    if (!entry) return '';
    if (course === 'vocabulary') return `Unit ${entry.unit} · ${courses.vocabulary.title}`;
    if (course === 'american1') {
      return /^[A-C]$/.test(entry.section)
        ? `Unit ${entry.unit}${entry.section} · ${courses.american1.title}`
        : `Unit ${entry.unit} (${entry.section}) · ${courses.american1.title}`;
    }
    return `Unit ${entry.unit} · ${courses.grammarElem.title}`;
  };
  const mostRecentLastVisited = Object.entries(lastVisitedByCourse).reduce(
    (best, curr) => (!best || curr[1].timestamp > best[1].timestamp ? curr : best),
    null,
  );
  const handleContinueLastVisited = () => {
    if (!mostRecentLastVisited) return;
    openLastVisitedEntry(mostRecentLastVisited[0], mostRecentLastVisited[1]);
  };
  const lastVisitedLabel = mostRecentLastVisited
    ? formatLastVisitedLabel(mostRecentLastVisited[0], mostRecentLastVisited[1])
    : '';

  // De onde a palavra foi salva (curso + unit) — gravado junto com a entrada
  // do "My Words" pelo botão flutuante "+ Word" das telas de estudo.
  const studyContextLabel = selectedUnit
    ? `Vocabulary Unit ${selectedUnit}`
    : selectedAmerican1Unit
      ? `American English 1 Unit ${selectedAmerican1Unit}${selectedAmerican1Section ? ` ${selectedAmerican1Section}` : ''}`
      : selectedGrammarElemUnit
        ? `Grammar Elementary Unit ${selectedGrammarElemUnit}`
        : selectedGrammarElemAppendix
          ? `Grammar Elementary Appendix ${selectedGrammarElemAppendix}`
          : selectedGrammarElemAdditional
            ? `Grammar Elementary Additional Exercise ${selectedGrammarElemAdditional}`
            : '';

  return (
    <div className={`app-shell${['vocabulary', 'american1', 'grammarElem', 'courses'].includes(activePage) ? ' app-shell--allow-grow' : ''}`}>
      <header className="app-header">
        {/* Left slide menu: o botão hambúrguer abre um painel deslizando da
            esquerda (.side-drawer), com um ícone por item — substitui o
            antigo menu inline/dropdown. Sempre visível, em qualquer largura
            de tela. */}
        <button
          type="button"
          className="menu-toggle"
          onClick={() => setMobileMenuOpen((value) => !value)}
          aria-expanded={mobileMenuOpen}
          aria-controls="main-menu"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
        >
          <IconMenuToggle open={mobileMenuOpen} />
        </button>

        <div className="brand">
          <span className="brand-mark"><img src="/logo192.png" alt="" className="brand-mark-icon" /></span>
          <span>Let's Learn English</span>
        </div>

        <div className={`side-drawer-backdrop${mobileMenuOpen ? ' is-visible' : ''}`} aria-hidden="true" />
        <nav
          id="main-menu"
          ref={mobileMenuRef}
          className={`side-drawer${mobileMenuOpen ? ' side-drawer--open' : ''}`}
          aria-label="Main links"
        >
          <div className="side-drawer-head">
            <span className="side-drawer-title">Menu</span>
            <button type="button" className="side-drawer-close" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
              ✕
            </button>
          </div>
          {/* Menu único e idêntico em qualquer lugar do app, dentro ou fora
              de um curso — não tem mais uma lista "insideCourse" diferente
              (que só tinha Courses/All Units/My Words/My Profile). */}
          <ol>
            <li className="side-drawer-item"><a href="#0" onClick={(event) => { handleHome(event); setMobileMenuOpen(false); }}><IconHome /><span>Home</span></a></li>
            <li className="side-drawer-item"><a href="#0" onClick={(event) => { handleCourses(event); setMobileMenuOpen(false); }}><IconCourses /><span>Courses</span></a></li>
            <li className="side-drawer-item"><a href="#0" onClick={(event) => { handleOpenWordbook(event); setMobileMenuOpen(false); }}><IconWords /><span>My Words</span></a></li>
            <li className="side-drawer-item"><a href="#0" onClick={(event) => { handleOpenListening(event); setMobileMenuOpen(false); }}><IconHeadphones /><span>Listening</span></a></li>
            <li className="side-drawer-item"><a href="#link-3" onClick={() => setMobileMenuOpen(false)}><IconMic /><span>Speaking</span></a></li>
            <li className="side-drawer-item"><a href="#0" onClick={(event) => { handleOpenAmerican1SoundBank(event); setMobileMenuOpen(false); }}><IconSound /><span>Sound Bank</span></a></li>
            <li className="side-drawer-divider" role="separator" />
            <li className="side-drawer-item"><a href="#0" onClick={(event) => { handleOpenProfile(event); setMobileMenuOpen(false); }}><IconProfile /><span>My Profile</span></a></li>
          </ol>
        </nav>
      </header>

      {activePage === 'exercises' ? (
        <main className="study-page">
          <div className="study-bar">
            <div className="study-bar-left">
              <button type="button" className="ghost-button" onClick={handleBackToUnit}>
                ‹ Back to Unit
              </button>
              <button type="button" className="ghost-button all-units-link" onClick={handleVocabulary}>
                All Units
              </button>
              <span className="study-unit-label">
                {courses.vocabulary.title} · Unit {selectedUnit}
                {unitTable[selectedUnit] ? ` - ${unitTable[selectedUnit]}` : null}
              </span>
            </div>

            <div className="exercise-tabs" role="tablist" aria-label="Unit exercises">
              {unitExercises.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={id === activeExerciseId}
                  className={`exercise-tab${id === activeExerciseId ? ' is-active' : ''}`}
                  onClick={() => setSelectedExercise(id)}
                >
                  {id}
                </button>
              ))}
            </div>
          </div>

          <div
            className="study-columns"
            ref={layoutRef}
            style={{
              gridTemplateColumns: sidePanelVisible
                ? `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`
                : `minmax(${MIN_CENTER_WIDTH}px, 1fr)`,
            }}
          >
            <div className="study-left">
              <section className="study-reader">
                {activeCoords ? (
                  <CroppedExerciseViewer
                    key={exerciseFileUrl}
                    fileUrl={exerciseFileUrl}
                    coords={activeCoords}
                  />
                ) : (
                  <div className="pdf-empty-state">
                    <p className="eyebrow">No exercise</p>
                    <h1>No exercise indexed</h1>
                    <p>This unit has no exercises in the index.</p>
                  </div>
                )}
              </section>

              <section className={`study-future-pdf${showAnswers && answerCoords ? ' has-pdf' : ''}`}>
                {showAnswers && answerCoords ? (
                  <CroppedExerciseViewer
                    key={`answers-${activeExerciseId}`}
                    fileUrl={ANSWERS_KEY_URL}
                    coords={answerCoords}
                  />
                ) : (
                  <span>FUTURE AREA TO SHOW ANSWERS</span>
                )}
              </section>
            </div>

            <button
              className={`resize-handle${sidePanelVisible ? '' : ' is-hidden'}`}
              type="button"
              aria-label="Resize right column"
              onPointerDown={startPanelResize}
            />

            <aside className={`study-answers${sidePanelVisible ? '' : ' is-hidden'}`}>
              {activeExerciseId && (
                <AnswerArea
                  exerciseId={activeExerciseId}
                  onPrevious={handlePreviousExercise}
                  onNext={handleNextExercise}
                  hasPrevious={activeIndex > 0}
                  hasNext={activeIndex >= 0 && activeIndex < unitExercises.length - 1}
                  isLastExercise={isLastExercise}
                  canGoNextUnit={selectedUnit < 100}
                  onNextReadingUnit={handleGoToNextReadingUnit}
                  showAnswers={showAnswers}
                  hasAnswer={Boolean(answerCoords)}
                  onToggleAnswers={() => setShowAnswers((value) => !value)}
                  rating={exerciseRatings[activeExerciseId] || 0}
                  onRate={(value) => handleRateExercise(activeExerciseId, value)}
                  userName={userName}
                />
              )}
            </aside>
          </div>
        </main>
      ) : activePage === 'unit' ? (
        <main
          className="main-panels"
          ref={layoutRef}
          style={{
            gridTemplateColumns: sidePanelVisible
                ? `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`
                : `minmax(${MIN_CENTER_WIDTH}px, 1fr)`,
          }}
        >
          <section className="pdf-panel">
            <div className="pdf-toolbar">
              {pdfFileName ? (
                <div className="pdf-toolbar-nav">
                  <button type="button" className="upload-button all-units-link" onClick={handleVocabulary}>
                    All Units
                  </button>
                  {selectedUnit > 1 && (
                    <button type="button" className="upload-button" onClick={handlePreviousUnit}>
                      Previous Unit
                    </button>
                  )}
                  {selectedUnit < 100 && (
                    <button type="button" className="upload-button" onClick={handleNextUnit}>
                      Next Unit
                    </button>
                  )}
                  {(exercisesByUnit[selectedUnit] || []).length > 0 && (
                    <button type="button" className="upload-button exercises-link" onClick={handleOpenExercises}>
                      Exercises
                    </button>
                  )}
                </div>
              ) : (
                renderPdfUpload(handlePdfChange, 'Load PDF')
              )}
            </div>

            {pdfFileName && (
              <div className="section-info">
                <strong>
                  {courses.vocabulary.title} · Unit {selectedUnit}
                  {unitTable[selectedUnit] ? ` — ${unitTable[selectedUnit]}` : ''}
                </strong>
              </div>
            )}

            {pdfFileUrl ? (
              <UnitAudioReader
                key={pdfFileUrl}
                fileUrl={pdfFileUrl}
                onPdfChange={handlePdfChange}
                anchors={unitAudioAnchors}
                unit={selectedUnit}
              />
            ) : (
              <div className="pdf-empty-state">
                <p className="eyebrow">Reader ready</p>
                <h1>Load your PDF</h1>
                <p>Select a file from your computer to open it in the center panel.</p>
                {renderPdfUpload(handlePdfChange)}
              </div>
            )}
          </section>

          <button
            className={`resize-handle${sidePanelVisible ? '' : ' is-hidden'}`}
            type="button"
            aria-label="Resize right column"
            onPointerDown={startPanelResize}
          />

          <aside className={`side-panel right-panel${sidePanelVisible ? '' : ' is-hidden'}`}>
            <div className="panel-content related-panel">
              <UnitNotes key={selectedUnit} unit={selectedUnit} userName={userName} />
            </div>
          </aside>
        </main>
      ) : activePage === 'vocabulary' ? (
        <main className="landing-page vocabulary-mode vocabulary-grid-mode" id="link-vocabulary">
          <div className="landing-panel vocabulary-page vocabulary-grid-mode">
            <h2 className="vocabulary-title">English Vocabulary B</h2>
            <UnitSearchBox value={unitSearchQuery} onChange={setUnitSearchQuery} placeholder="Search units... (e.g. phrasal verbs)" />
            <UnitBadgeLegend />
            {filteredUnitItems.length === 0 ? (
              <p className="unit-search-empty">No units match "{unitSearchQuery}".</p>
            ) : (
              <div className="vocabulary-list" role="list">
                {filteredUnitItems.map((unit) => (
                  <a key={unit.number} className="vocabulary-link" href={`#unit-${unit.number}`} onClick={(event) => handleUnitSelect(event, unit.number)}>
                    <UnitBadgeDot status={getVocabularyUnitBadgeStatus(unit.number, Boolean(visitedUnits[unit.number]), exerciseRatings)} />
                    <span>Unit {unit.number}</span>
                    <small>{unit.label}</small>
                  </a>
                ))}
              </div>
            )}
          </div>
        </main>
      ) : activePage === 'courses' ? (
        <main className="landing-page landing-page--courses">
          <div className="landing-panel course-links-panel">
            {userName && (
              <ReviewCard
                items={reviewQueue}
                dueWordsCount={wordbookDueCount}
                onOpenItem={handleOpenReviewItem}
                onOpenWords={handleOpenWordbook}
                embedded
              />
            )}
            <UnitSearchBox
              value={unitSearchQuery}
              onChange={setUnitSearchQuery}
              placeholder="Search all courses... (e.g. phrasal verbs)"
            />
            {unitSearchNormalized ? (
              <div className="unified-search-results">
                {filteredUnitItems.length === 0 && filteredAmerican1UnitNumbers.length === 0 && filteredGrammarElemUnitNumbers.length === 0 ? (
                  <p className="unit-search-empty">No units match "{unitSearchQuery}" in any course.</p>
                ) : (
                  <>
                    {filteredUnitItems.length > 0 && (
                      <section className="unified-search-group">
                        <h3 className="unified-search-group-title">{courses.vocabulary.title}</h3>
                        <div className="vocabulary-list" role="list">
                          {filteredUnitItems.map((unit) => (
                            <a
                              key={`vocabulary-${unit.number}`}
                              className="vocabulary-link"
                              href={`#unit-${unit.number}`}
                              onClick={(event) => { event.preventDefault(); openVocabularyUnit(unit.number); }}
                            >
                              <UnitBadgeDot status={getVocabularyUnitBadgeStatus(unit.number, Boolean(visitedUnits[unit.number]), exerciseRatings)} />
                              <span>Unit {unit.number}</span>
                              <small>{unit.label}</small>
                            </a>
                          ))}
                        </div>
                      </section>
                    )}
                    {filteredAmerican1UnitNumbers.length > 0 && (
                      <section className="unified-search-group">
                        <h3 className="unified-search-group-title">{courses.american1.title}</h3>
                        <div className="vocabulary-list" role="list">
                          {filteredAmerican1UnitNumbers.map((unit) => {
                            const sections = american1SectionsByUnit[unit] || [];
                            const theme = sections.find((section) => section.section === 'A')?.title || sections[0]?.title || '';
                            const visited = Object.keys(american1VisitedSections).some((key) => key.startsWith(`${unit}|`));
                            return (
                              <a
                                key={`american1-${unit}`}
                                className="vocabulary-link"
                                href={`#american1-unit-${unit}`}
                                onClick={(event) => { event.preventDefault(); openAmerican1Section(unit, sections[0]?.section ?? null); }}
                              >
                                <UnitBadgeDot status={getUnitBadgeStatus(visited, american1UnitRatings[unit] || 0)} />
                                <span>Unit {unit}</span>
                                <small>{theme}</small>
                              </a>
                            );
                          })}
                        </div>
                      </section>
                    )}
                    {filteredGrammarElemUnitNumbers.length > 0 && (
                      <section className="unified-search-group">
                        <h3 className="unified-search-group-title">{courses.grammarElem.title}</h3>
                        <div className="vocabulary-list" role="list">
                          {filteredGrammarElemUnitNumbers.map((unit) => (
                            <a
                              key={`grammarElem-${unit}`}
                              className="vocabulary-link"
                              href={`#grammarElem-unit-${unit}`}
                              onClick={(event) => { event.preventDefault(); openGrammarElemUnit(unit); }}
                            >
                              <UnitBadgeDot status={getUnitBadgeStatus(Boolean(grammarElemVisitedUnits[unit]), grammarElemUnitRatings[unit] || 0)} />
                              <span>Unit {unit}</span>
                              <small>{getGrammarElemUnitTitle(unit)}</small>
                            </a>
                          ))}
                        </div>
                      </section>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="course-links">
                <div className="course-link-row">
                  <a className="course-link" href="#link-vocabulary" onClick={handleVocabulary}>
                    <span>{courses.vocabulary.title}</span>
                    <small>{courses.vocabulary.description}</small>
                  </a>
                  {lastVisitedByCourse.vocabulary && (
                    <button
                      type="button"
                      className="continue-cta course-continue-cta"
                      onClick={() => openLastVisitedEntry('vocabulary', lastVisitedByCourse.vocabulary)}
                    >
                      Continue where you left off
                      <small>{formatLastVisitedLabel('vocabulary', lastVisitedByCourse.vocabulary)}</small>
                    </button>
                  )}
                </div>
                <div className="course-link-row">
                  <a className="course-link" href="#link-american1" onClick={handleAmerican1}>
                    <span>{courses.american1.title}</span>
                    <small>{courses.american1.description}</small>
                  </a>
                  {lastVisitedByCourse.american1 && (
                    <button
                      type="button"
                      className="continue-cta course-continue-cta"
                      onClick={() => openLastVisitedEntry('american1', lastVisitedByCourse.american1)}
                    >
                      Continue where you left off
                      <small>{formatLastVisitedLabel('american1', lastVisitedByCourse.american1)}</small>
                    </button>
                  )}
                </div>
                <div className="course-link-row">
                  <a className="course-link" href="#link-grammarElem" onClick={handleGrammarElem}>
                    <span>{courses.grammarElem.title}</span>
                    <small>{courses.grammarElem.description}</small>
                  </a>
                  {lastVisitedByCourse.grammarElem && (
                    <button
                      type="button"
                      className="continue-cta course-continue-cta"
                      onClick={() => openLastVisitedEntry('grammarElem', lastVisitedByCourse.grammarElem)}
                    >
                      Continue where you left off
                      <small>{formatLastVisitedLabel('grammarElem', lastVisitedByCourse.grammarElem)}</small>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      ) : activePage === 'american1' ? (
        <main className="landing-page vocabulary-mode vocabulary-grid-mode" id="link-american1">
          <div className="landing-panel vocabulary-page vocabulary-grid-mode">
            <h2 className="vocabulary-title">American English A1</h2>
            <UnitSearchBox value={unitSearchQuery} onChange={setUnitSearchQuery} placeholder="Search units... (e.g. phrasal verbs)" />
            <UnitBadgeLegend />
            {filteredAmerican1UnitNumbers.length === 0 ? (
              <p className="unit-search-empty">No units match "{unitSearchQuery}".</p>
            ) : (
              <div className="vocabulary-list" role="list">
                {filteredAmerican1UnitNumbers.map((unit) => {
                  const sections = american1SectionsByUnit[unit] || [];
                  const theme = sections.find((section) => section.section === 'A')?.title || sections[0]?.title || '';
                  const visited = Object.keys(american1VisitedSections).some((key) => key.startsWith(`${unit}|`));
                  return (
                    <a
                      key={unit}
                      className="vocabulary-link"
                      href={`#american1-unit-${unit}`}
                      onClick={(event) => handleAmerican1UnitSelect(event, unit)}
                    >
                      <UnitBadgeDot status={getUnitBadgeStatus(visited, american1UnitRatings[unit] || 0)} />
                      <span>Unit {unit}</span>
                      <small>{theme}</small>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      ) : activePage === 'grammarElem' ? (
        <main className="landing-page vocabulary-mode grammar-elem-landing" id="link-grammarElem">
          <div className="landing-panel vocabulary-page grammar-elem-landing-panel">
            <h2 className="vocabulary-title">{courses.grammarElem.title}</h2>
            <UnitSearchBox value={unitSearchQuery} onChange={setUnitSearchQuery} placeholder="Search units... (e.g. phrasal verbs)" />
            <UnitBadgeLegend />
            {filteredGrammarElemUnitNumbers.length === 0 ? (
              <p className="unit-search-empty">No units match "{unitSearchQuery}".</p>
            ) : (
              <div className="vocabulary-list" role="list">
                {filteredGrammarElemUnitNumbers.map((unit) => (
                  <a
                    key={unit}
                    className="vocabulary-link"
                    href={`#grammarElem-unit-${unit}`}
                    onClick={(event) => handleGrammarElemUnitSelect(event, unit)}
                  >
                    <UnitBadgeDot status={getUnitBadgeStatus(Boolean(grammarElemVisitedUnits[unit]), grammarElemUnitRatings[unit] || 0)} />
                    <span>Unit {unit}</span>
                    <small>{getGrammarElemUnitTitle(unit)}</small>
                  </a>
                ))}
              </div>
            )}
            <h2 className="vocabulary-title">Appendixes</h2>
            <div className="vocabulary-list" role="list">
              {grammarElemAppendixNumbers.map((appendixNumber) => (
                <a
                  key={appendixNumber}
                  className="vocabulary-link"
                  href={`#grammarElem-appendix-${appendixNumber}`}
                  onClick={(event) => handleGrammarElemAppendixSelect(event, appendixNumber)}
                >
                  <span>Appendix {appendixNumber}</span>
                  <small>{getGrammarElemAppendixTitle(appendixNumber)}</small>
                </a>
              ))}
            </div>
            <h2 className="vocabulary-title">Additional Exercises</h2>
            <div className="vocabulary-list" role="list">
              {grammarElemAdditionalNumbers.map((additionalNumber) => (
                <a
                  key={additionalNumber}
                  className="vocabulary-link"
                  href={`#grammarElem-additional-${additionalNumber}`}
                  onClick={(event) => handleGrammarElemAdditionalSelect(event, additionalNumber)}
                >
                  <span>Additional Exercise {additionalNumber}</span>
                </a>
              ))}
            </div>
          </div>
        </main>
      ) : activePage === 'grammarElem-unit' ? (() => {
        const unit = selectedGrammarElemUnit;
        const fileUrl = unit ? `/grammar-elem-pages/Unit-${unit}L.pdf` : '';
        const audioLetters = unit ? grammarElemAudio[String(unit)] || [] : [];

        return (
          <main
            className="main-panels"
            ref={layoutRef}
            style={{
              gridTemplateColumns: sidePanelVisible
                ? `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`
                : `minmax(${MIN_CENTER_WIDTH}px, 1fr)`,
            }}
          >
            <section className="pdf-panel">
              <div className="pdf-toolbar pdf-toolbar-left">
                <div className="pdf-toolbar-nav">
                  <button type="button" className="upload-button all-units-link" onClick={handleGrammarElem}>
                    All Units
                  </button>
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handlePreviousGrammarElemUnit}
                    disabled={!unit || unit <= 1}
                  >
                    Previous Unit
                  </button>
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handleNextGrammarElemUnit}
                    disabled={!unit || unit >= GRAMMAR_ELEM_UNIT_COUNT}
                  >
                    Next Unit
                  </button>
                  <button type="button" className="upload-button exercises-link" onClick={handleOpenGrammarElemExercise}>
                    Exercises
                  </button>
                </div>
                {audioLetters.length > 0 && (
                  <div className="reference-links" role="group" aria-label="Unit audio">
                    {audioLetters.map((letter) => (
                      <SimpleAudioPlayer
                        key={letter}
                        label={letter}
                        src={`/grammar-elem-audio/${unit}${letter}-elem_murph_merged.mp3`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {unit && (
                <div className="section-info">
                  <strong>
                    {courses.grammarElem.title} · Unit {unit}
                    {getGrammarElemUnitTitle(unit) ? ` — ${getGrammarElemUnitTitle(unit)}` : ''}
                  </strong>
                </div>
              )}

              {fileUrl ? (
                <PdfWorkspace key={fileUrl} fileUrl={fileUrl} defaultScale={1.3} />
              ) : (
                <div className="pdf-empty-state">
                  <p className="eyebrow">No unit</p>
                  <h1>No unit selected</h1>
                </div>
              )}
            </section>

            <button
              className={`resize-handle${sidePanelVisible ? '' : ' is-hidden'}`}
              type="button"
              aria-label="Resize right column"
              onPointerDown={startPanelResize}
            />

            <aside className={`side-panel right-panel${sidePanelVisible ? '' : ' is-hidden'}`}>
              <div className="panel-content related-panel">
                <UnitNotes
                  key={unit}
                  unit={unit}
                  userName={userName}
                  storageKeyBase={`notes:grammarElem:${unit}`}
                  rating={grammarElemUnitRatings[unit] || 0}
                  onRate={(value) => handleRateGrammarElemUnit(unit, value)}
                />
              </div>
            </aside>
          </main>
        );
      })() : activePage === 'grammarElem-exercise' ? (() => {
        const unit = selectedGrammarElemUnit;
        const fileUrl = unit ? `/grammar-elem-pages/Unit-${unit}E.pdf` : '';
        const answersUrl = unit ? `/grammar-elem-pages/answers/${unit}` : '';

        return (
          <main
            className="main-panels"
            ref={layoutRef}
            style={{
              gridTemplateColumns: sidePanelVisible
                ? `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`
                : `minmax(${MIN_CENTER_WIDTH}px, 1fr)`,
            }}
          >
            <section className="pdf-panel">
              <div className="pdf-toolbar pdf-toolbar-left">
                <div className="pdf-toolbar-nav">
                  <button type="button" className="upload-button" onClick={handleBackToGrammarElemUnit}>
                    ‹ Back to Unit
                  </button>
                  <button type="button" className="upload-button all-units-link" onClick={handleGrammarElem}>
                    All Units
                  </button>
                  <span className="study-unit-label">Unit {unit}</span>
                </div>
              </div>

              {unit && (
                <div className="section-info">
                  <strong>
                    {courses.grammarElem.title} · Unit {unit} Exercises
                    {getGrammarElemUnitTitle(unit) ? ` — ${getGrammarElemUnitTitle(unit)}` : ''}
                  </strong>
                </div>
              )}

              {fileUrl ? (
                <PdfWorkspace key={fileUrl} fileUrl={fileUrl} defaultScale={1.3} />
              ) : (
                <div className="pdf-empty-state">
                  <p className="eyebrow">No unit</p>
                  <h1>No unit selected</h1>
                </div>
              )}

              {showGrammarElemAnswers && answersUrl && (
                <div className="section-answers-strip">
                  <div className="section-answers-strip-head">
                    <span>Answer key</span>
                    <button
                      type="button"
                      className="section-answers-strip-close"
                      onClick={() => setShowGrammarElemAnswers(false)}
                      aria-label="Close answers"
                    >
                      ✕
                    </button>
                  </div>
                  <iframe
                    key={answersUrl}
                    src={answersUrl}
                    title="Answer key"
                    className="section-answers-strip-frame"
                  />
                </div>
              )}
            </section>

            <button
              className={`resize-handle${sidePanelVisible ? '' : ' is-hidden'}`}
              type="button"
              aria-label="Resize right column"
              onPointerDown={startPanelResize}
            />

            <aside className={`side-panel right-panel${sidePanelVisible ? '' : ' is-hidden'}`}>
              {unit && (
                <AnswerArea
                  exerciseId={`grammarElem-${unit}`}
                  heading={`Unit ${unit} Exercises`}
                  onPrevious={() => {}}
                  onNext={() => {}}
                  hasPrevious={false}
                  hasNext={false}
                  isLastExercise
                  canGoNextUnit={unit < GRAMMAR_ELEM_UNIT_COUNT}
                  onNextReadingUnit={() => {
                    handleNextGrammarElemUnit();
                    setActivePage('grammarElem-unit');
                  }}
                  showAnswers={showGrammarElemAnswers}
                  hasAnswer={Boolean(answersUrl)}
                  onToggleAnswers={() => setShowGrammarElemAnswers((prev) => !prev)}
                  rating={grammarElemUnitRatings[unit] || 0}
                  onRate={(value) => handleRateGrammarElemUnit(unit, value)}
                  userName={userName}
                />
              )}
            </aside>
          </main>
        );
      })() : activePage === 'grammarElem-appendix' ? (() => {
        const appendixNumber = selectedGrammarElemAppendix;
        const fileUrl = appendixNumber ? `/grammar-elem-pages/appendix/${appendixNumber}` : '';

        return (
          <main
            className="main-panels"
            ref={layoutRef}
            style={{
              gridTemplateColumns: sidePanelVisible
                ? `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`
                : `minmax(${MIN_CENTER_WIDTH}px, 1fr)`,
            }}
          >
            <section className="pdf-panel">
              <div className="pdf-toolbar pdf-toolbar-left">
                <div className="pdf-toolbar-nav">
                  <button type="button" className="upload-button all-units-link" onClick={handleGrammarElem}>
                    All Units
                  </button>
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handlePreviousGrammarElemAppendix}
                    disabled={!appendixNumber || appendixNumber <= 1}
                  >
                    Previous Appendix
                  </button>
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handleNextGrammarElemAppendix}
                    disabled={!appendixNumber || appendixNumber >= GRAMMAR_ELEM_APPENDIX_COUNT}
                  >
                    Next Appendix
                  </button>
                </div>
              </div>

              {appendixNumber && (
                <div className="section-info">
                  <strong>
                    {courses.grammarElem.title} · Appendix {appendixNumber}
                    {getGrammarElemAppendixTitle(appendixNumber) ? ` — ${getGrammarElemAppendixTitle(appendixNumber)}` : ''}
                  </strong>
                </div>
              )}

              {fileUrl ? (
                <PdfWorkspace key={fileUrl} fileUrl={fileUrl} defaultScale={1.3} />
              ) : (
                <div className="pdf-empty-state">
                  <p className="eyebrow">No appendix</p>
                  <h1>No appendix selected</h1>
                </div>
              )}
            </section>

            <button
              className={`resize-handle${sidePanelVisible ? '' : ' is-hidden'}`}
              type="button"
              aria-label="Resize right column"
              onPointerDown={startPanelResize}
            />

            <aside className={`side-panel right-panel${sidePanelVisible ? '' : ' is-hidden'}`}>
              <div className="panel-content related-panel">
                <UnitNotes
                  key={appendixNumber}
                  unit={`appendix-${appendixNumber}`}
                  userName={userName}
                  storageKeyBase={`notes:grammarElem:appendix-${appendixNumber}`}
                />
              </div>
            </aside>
          </main>
        );
      })() : activePage === 'grammarElem-additional' ? (() => {
        const additionalNumber = selectedGrammarElemAdditional;
        const fileUrl = additionalNumber ? `/grammar-elem-pages/additional/${additionalNumber}` : '';

        return (
          <main
            className="main-panels"
            ref={layoutRef}
            style={{
              gridTemplateColumns: sidePanelVisible
                ? `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`
                : `minmax(${MIN_CENTER_WIDTH}px, 1fr)`,
            }}
          >
            <section className="pdf-panel">
              <div className="pdf-toolbar pdf-toolbar-left">
                <div className="pdf-toolbar-nav">
                  <button type="button" className="upload-button all-units-link" onClick={handleGrammarElem}>
                    All Units
                  </button>
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handlePreviousGrammarElemAdditional}
                    disabled={!additionalNumber || additionalNumber <= 1}
                  >
                    Previous Additional Exercise
                  </button>
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handleNextGrammarElemAdditional}
                    disabled={!additionalNumber || additionalNumber >= GRAMMAR_ELEM_ADDITIONAL_COUNT}
                  >
                    Next Additional Exercise
                  </button>
                </div>
              </div>

              {additionalNumber && (
                <div className="section-info">
                  <strong>{courses.grammarElem.title} · Additional Exercise {additionalNumber}</strong>
                </div>
              )}

              {fileUrl ? (
                <PdfWorkspace key={fileUrl} fileUrl={fileUrl} defaultScale={1.3} />
              ) : (
                <div className="pdf-empty-state">
                  <p className="eyebrow">No additional exercise</p>
                  <h1>No additional exercise selected</h1>
                </div>
              )}
            </section>

            <button
              className={`resize-handle${sidePanelVisible ? '' : ' is-hidden'}`}
              type="button"
              aria-label="Resize right column"
              onPointerDown={startPanelResize}
            />

            <aside className={`side-panel right-panel${sidePanelVisible ? '' : ' is-hidden'}`}>
              <div className="panel-content related-panel">
                <UnitNotes
                  key={additionalNumber}
                  unit={`additional-${additionalNumber}`}
                  userName={userName}
                  storageKeyBase={`notes:grammarElem:additional-${additionalNumber}`}
                />
              </div>
            </aside>
          </main>
        );
      })() : activePage === 'american1-unit' ? (() => {
        const sections = american1SectionsByUnit[selectedAmerican1Unit] || [];
        const activeSection = sections.find((section) => section.section === selectedAmerican1Section) || sections[0];
        const fileUrl = activeSection
          ? `/american1-pages/section/${activeSection.pageStart}/${activeSection.pageEnd}`
          : '';
        const unitIndex = american1UnitNumbers.indexOf(selectedAmerican1Unit);
        const sectionAudioAnchors = (american1AudioAnchors[String(selectedAmerican1Unit)] || [])
          .filter((anchor) => anchor.section === activeSection?.section);
        const sectionReferences = activeSection
          ? american1ReferencesBySection[`${selectedAmerican1Unit}|${activeSection.section}`] || []
          : [];
        const sectionVideos = activeSection
          ? american1VideosBySection[`${selectedAmerican1Unit}|${activeSection.section}`] || null
          : null;
        const answersUrl = activeSection
          ? /^[A-C]$/.test(activeSection.section)
            ? `/american1-pages/answers/${selectedAmerican1Unit}/${activeSection.section}`
            : activeSection.section === 'Practical English'
              ? `/american1-pages/answers-pe/${selectedAmerican1Unit}`
              : activeSection.section === 'Review and Check'
                ? `/american1-pages/answers-revise/${selectedAmerican1Unit}`
                : ''
          : '';

        return (
          <main
            className="main-panels"
            ref={layoutRef}
            style={{
              gridTemplateColumns: sidePanelVisible
                ? `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`
                : `minmax(${MIN_CENTER_WIDTH}px, 1fr)`,
            }}
          >
            <section className="pdf-panel">
              <div className="pdf-toolbar pdf-toolbar-left">
                <div className="pdf-toolbar-nav">
                  <button type="button" className="upload-button all-units-link" onClick={handleAmerican1}>
                    All Units
                  </button>
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handlePreviousAmerican1Unit}
                    disabled={unitIndex <= 0}
                  >
                    Previous Unit
                  </button>
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handleNextAmerican1Unit}
                    disabled={unitIndex === -1 || unitIndex >= american1UnitNumbers.length - 1}
                  >
                    Next Unit
                  </button>
                </div>
                <div className="exercise-tabs" role="tablist" aria-label="Unit sections">
                  {sections.map((section) => (
                    <button
                      key={section.section}
                      type="button"
                      role="tab"
                      aria-selected={section.section === activeSection?.section}
                      className={`exercise-tab${section.section.length > 1 ? ' exercise-tab-wide' : ''}${section.section === activeSection?.section ? ' is-active' : ''}`}
                      title={section.title}
                      onClick={() => {
                        setSelectedAmerican1Section(section.section);
                        setShowAmerican1Answers(false);
                      }}
                    >
                      {section.section}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="exercise-tab exercise-tab-wide reference-link-btn reference-link-btn--transcriptions"
                    onClick={handleOpenAmerican1Transcriptions}
                  >
                    Transcriptions
                  </button>
                </div>
                {(sectionReferences.length > 0 || sectionVideos) && (
                  <div className="reference-links" role="group" aria-label="Section reference pages">
                    {sectionReferences.map((ref, index) => (
                      <button
                        key={`${ref.type}-${ref.pages[0]}-${index}`}
                        type="button"
                        className={`reference-link-btn reference-link-btn--${ref.type}`}
                        onClick={() => handleOpenAmerican1Reference({
                          ...ref,
                          unit: selectedAmerican1Unit,
                          section: activeSection.section,
                        })}
                      >
                        {AMERICAN1_REFERENCE_LABELS[ref.type]} p.{ref.pages[0]}
                      </button>
                    ))}
                    {sectionVideos?.videos.map((video) => (
                      <a
                        key={video.file}
                        className="reference-link-btn reference-link-btn--video"
                        href={`/american1-video/${sectionVideos.folder}/${encodeURIComponent(video.file)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {video.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              {activeSection && (
                <div className="section-info">
                  <strong>
                    {courses.american1.title} · Unit {selectedAmerican1Unit}{activeSection.section} — {activeSection.title}
                  </strong>
                  {(activeSection.grammar || activeSection.vocabulary || activeSection.pronunciation) && (
                    <span className="section-info-tags">
                      {activeSection.grammar && <span>Grammar: {activeSection.grammar}</span>}
                      {activeSection.vocabulary && <span>Vocabulary: {activeSection.vocabulary}</span>}
                      {activeSection.pronunciation && <span>Pronunciation: {activeSection.pronunciation}</span>}
                    </span>
                  )}
                </div>
              )}

              {fileUrl ? (
                <American1AudioReader key={fileUrl} fileUrl={fileUrl} anchors={sectionAudioAnchors} />
              ) : (
                <div className="pdf-empty-state">
                  <p className="eyebrow">No section</p>
                  <h1>No section indexed</h1>
                  <p>This unit has no sections in the index.</p>
                </div>
              )}

              {showAmerican1Answers && answersUrl && (
                <div className="section-answers-strip">
                  <div className="section-answers-strip-head">
                    <span>Teacher's Book answers</span>
                    <button
                      type="button"
                      className="section-answers-strip-close"
                      onClick={() => setShowAmerican1Answers(false)}
                      aria-label="Close answers"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="section-answers-strip-frame">
                    <PdfWorkspace key={answersUrl} fileUrl={answersUrl} initialTool="hand" />
                  </div>
                </div>
              )}
            </section>

            <button
              className={`resize-handle${sidePanelVisible ? '' : ' is-hidden'}`}
              type="button"
              aria-label="Resize right column"
              onPointerDown={startPanelResize}
            />

            <aside className={`side-panel right-panel${sidePanelVisible ? '' : ' is-hidden'}`}>
              <div className="panel-content related-panel">
                <UnitNotes
                  key={selectedAmerican1Unit}
                  unit={selectedAmerican1Unit}
                  userName={userName}
                  storageKeyBase={`notes:american1:${selectedAmerican1Unit}`}
                  hasAnswers={Boolean(answersUrl)}
                  showAnswers={showAmerican1Answers}
                  onToggleAnswers={() => setShowAmerican1Answers((prev) => !prev)}
                  rating={american1UnitRatings[selectedAmerican1Unit] || 0}
                  onRate={(value) => handleRateAmerican1Unit(selectedAmerican1Unit, value)}
                />
              </div>
            </aside>
          </main>
        );
      })() : activePage === 'american1-reference' ? (() => {
        const ref = selectedAmerican1Reference;
        const fileUrl = ref ? `/american1-pages/ref/${ref.type}/${ref.pages[0]}` : '';
        const label = ref ? `${AMERICAN1_REFERENCE_LABELS[ref.type]} p.${ref.pages[0]}` : '';
        const referenceAudioAnchors = ref
          ? american1ReferenceAudioAnchors[`${ref.type}:${ref.pages[0]}`] || []
          : [];
        // Mesmo gabarito do Teacher's Book da unit/seção de onde essa página de
        // referência foi aberta (ref.unit/ref.section, ver handleOpenAmerican1Reference)
        // — só existe para seções A/B/C (Practical English/Review and Check não têm link de
        // referência de qualquer forma).
        const referenceAnswersUrl = ref && /^[A-C]$/.test(ref.section || '')
          ? `/american1-pages/answers/${ref.unit}/${ref.section}`
          : '';

        return (
          <main
            className="main-panels"
            ref={layoutRef}
            style={{
              gridTemplateColumns: sidePanelVisible
                ? `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`
                : `minmax(${MIN_CENTER_WIDTH}px, 1fr)`,
            }}
          >
            <section className="pdf-panel">
              <div className="pdf-toolbar">
                <div className="pdf-toolbar-nav">
                  {ref?.unit ? (
                    <button
                      type="button"
                      className="upload-button"
                      onClick={handleCloseAmerican1Reference}
                    >
                      ‹ Back to Unit {ref.unit} {ref.section}
                    </button>
                  ) : (
                    // Aberta direto do menu (Sound Bank), sem vir de uma unit
                    // — não faz sentido um botão "Back to Unit" pra lugar
                    // nenhum, então só identifica a tela.
                    <span className="reference-standalone-label">Sound Bank</span>
                  )}
                  {ref?.unit && (
                    // Só faz sentido dentro do fluxo da unit — a consulta
                    // avulsa ao Sound Bank (sem ref.unit) não faz parte do
                    // curso, então não tem por que voltar pra grade de units.
                    <button type="button" className="upload-button all-units-link" onClick={handleAmerican1}>
                      All Units
                    </button>
                  )}
                </div>
                {ref?.unit && (
                  <span className="reference-page-label">{courses.american1.title} · {label}</span>
                )}
              </div>

              {fileUrl ? (
                <American1AudioReader
                  key={fileUrl}
                  fileUrl={fileUrl}
                  anchors={referenceAudioAnchors}
                />
              ) : (
                <div className="pdf-empty-state">
                  <p className="eyebrow">No reference</p>
                  <h1>Nothing to show</h1>
                </div>
              )}

              {showAmerican1ReferenceAnswers && referenceAnswersUrl && (
                <div className="section-answers-strip">
                  <div className="section-answers-strip-head">
                    <span>Teacher's Book answers</span>
                    <button
                      type="button"
                      className="section-answers-strip-close"
                      onClick={() => setShowAmerican1ReferenceAnswers(false)}
                      aria-label="Close answers"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="section-answers-strip-frame">
                    <PdfWorkspace key={referenceAnswersUrl} fileUrl={referenceAnswersUrl} initialTool="hand" />
                  </div>
                </div>
              )}
            </section>

            <button
              className={`resize-handle${sidePanelVisible ? '' : ' is-hidden'}`}
              type="button"
              aria-label="Resize right column"
              onPointerDown={startPanelResize}
            />

            <aside className={`side-panel right-panel${sidePanelVisible ? '' : ' is-hidden'}`}>
              <div className="panel-content related-panel">
                <UnitNotes
                  key={`${ref?.type}-${ref?.pages?.[0]}`}
                  unit={ref?.pages?.[0]}
                  userName={userName}
                  storageKeyBase={`notes:american1-ref:${ref?.type}:${ref?.pages?.[0]}`}
                  hasAnswers={Boolean(referenceAnswersUrl)}
                  showAnswers={showAmerican1ReferenceAnswers}
                  onToggleAnswers={() => setShowAmerican1ReferenceAnswers((prev) => !prev)}
                />
              </div>
            </aside>
          </main>
        );
      })() : activePage === 'american1-transcriptions' ? (
        <main
          className="main-panels"
          ref={layoutRef}
          style={{
            gridTemplateColumns: sidePanelVisible
                ? `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`
                : `minmax(${MIN_CENTER_WIDTH}px, 1fr)`,
          }}
        >
          <section className="pdf-panel">
            <div className="pdf-toolbar">
              <div className="pdf-toolbar-nav">
                <button
                  type="button"
                  className="upload-button"
                  onClick={handleCloseAmerican1Transcriptions}
                >
                  ‹ Back to Unit {selectedAmerican1Unit} {selectedAmerican1Section}
                </button>
                <button type="button" className="upload-button all-units-link" onClick={handleAmerican1}>
                  All Units
                </button>
              </div>
              <span className="reference-page-label">{courses.american1.title} · Transcriptions</span>
            </div>

            <American1AudioReader
              key="/american1-pages/transcriptions"
              fileUrl="/american1-pages/transcriptions"
              anchors={american1TranscriptionsAudioAnchors}
            />
          </section>

          <button
            className={`resize-handle${sidePanelVisible ? '' : ' is-hidden'}`}
            type="button"
            aria-label="Resize right column"
            onPointerDown={startPanelResize}
          />

          <aside className={`side-panel right-panel${sidePanelVisible ? '' : ' is-hidden'}`}>
            <div className="panel-content related-panel">
              <UnitNotes
                key="transcriptions"
                unit="transcriptions"
                userName={userName}
                storageKeyBase="notes:american1-transcriptions"
              />
            </div>
          </aside>
        </main>
      ) : activePage === 'listening' ? (
        <main className="landing-page landing-page--courses vocabulary-mode listening-mode">
          <div className="landing-panel course-links-panel listening-panel">
            <p className="eyebrow">Listening</p>
            <h1>Choose a listening source</h1>
            <div className="course-links">
              {LISTENING_SOURCES.map((source) => (
                <div className="course-link-row" key={source.id}>
                  <a
                    className="course-link"
                    href="#0"
                    onClick={(event) => { event.preventDefault(); handleOpenListeningSource(source); }}
                  >
                    <span>{source.title}</span>
                    <small>{source.description}</small>
                  </a>
                </div>
              ))}
            </div>
          </div>
        </main>
      ) : activePage === 'listening-tracks' ? (() => {
        const source = LISTENING_SOURCES.find((item) => item.id === selectedListeningSource);
        const listeningSearchNormalized = listeningSearchQuery.trim().toLowerCase();
        const allListeningTracks = (source?.tracks || []).map((track) => ({
          track,
          stats: loadListeningStats(userName, track.id),
        }));
        const visibleListeningTracks = allListeningTracks.filter(({ track, stats }) => {
          if (hideMasteredListening && stats?.lastScorePercent === 100) return false;
          if (!listeningSearchNormalized) return true;
          return (
            listeningTrackLabel(track).toLowerCase().includes(listeningSearchNormalized)
            || String(track.number).includes(listeningSearchNormalized)
          );
        });
        return (
          <main className="landing-page landing-page--courses vocabulary-mode listening-mode">
            <div className="landing-panel course-links-panel listening-panel">
              <button type="button" className="upload-button" onClick={handleBackToListeningHub}>
                ‹ Back to Listening
              </button>
              <p className="eyebrow">{source?.title || 'Listening'}</p>
              <h1>Choose an exercise</h1>
              <div className="listening-tracks-controls">
                <UnitSearchBox
                  value={listeningSearchQuery}
                  onChange={setListeningSearchQuery}
                  placeholder="Search by unit or exercise number..."
                />
                <button
                  type="button"
                  className={`upload-button listening-hide-mastered-toggle${hideMasteredListening ? ' is-active' : ''}`}
                  onClick={() => setHideMasteredListening((current) => !current)}
                >
                  {hideMasteredListening ? '✓ Hiding 100% score' : 'Hide 100% score'}
                </button>
              </div>
              {visibleListeningTracks.length === 0 && (
                <p className="unit-search-empty">No exercises match your filters.</p>
              )}
              <div className="course-links">
                {visibleListeningTracks.map(({ track, stats }) => {
                  return (
                    <div className="course-link-row" key={track.id}>
                      <a
                        className="course-link"
                        href="#0"
                        onClick={(event) => { event.preventDefault(); handleOpenListeningTrack(track); }}
                      >
                        <span>Listening Exercise n. {track.number} ({listeningTrackLabel(track)})</span>
                        <small>{track.sentences.length} sentences · fill in the blank</small>
                        {stats && (
                          <small className="listening-track-stats">
                            Done {stats.attempts}× · Last score: {stats.lastScorePercent}%
                          </small>
                        )}
                      </a>
                      {stats && (
                        <button
                          type="button"
                          className="continue-cta course-continue-cta"
                          onClick={() => handleOpenListeningTrack(track)}
                        >
                          Try again
                          <small>Last score: {stats.lastScorePercent}%</small>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </main>
        );
      })() : activePage === 'listening-exercise' ? (() => {
        const source = LISTENING_SOURCES.find((item) => item.id === selectedListeningSource);
        const tracks = source?.tracks || [];
        const track = tracks.find((item) => item.id === selectedListeningTrack);
        const trackIndex = tracks.findIndex((item) => item.id === selectedListeningTrack);
        const hasNextTrack = trackIndex !== -1 && trackIndex < tracks.length - 1;
        return (
          <main className="landing-page landing-page--courses vocabulary-mode listening-mode">
            <div className="landing-panel course-links-panel listening-panel listening-exercise-panel">
              <div className="listening-exercise-nav">
                <button type="button" className="upload-button" onClick={handleBackToListeningTracks}>
                  ‹ Back to Exercises
                </button>
                {hasNextTrack && (
                  <button type="button" className="upload-button" onClick={handleNextListeningTrack}>
                    Next Listening
                  </button>
                )}
              </div>
              <p className="eyebrow">{source?.title || 'Listening'}</p>
              <h1>
                {track ? (
                  <>
                    {`Listening Exercise n. ${track.number} (`}
                    {track.unit ? (
                      <span
                        className="listening-unit-link"
                        role="link"
                        tabIndex={0}
                        onClick={() => openVocabularyUnit(track.unit)}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          openVocabularyUnit(track.unit);
                        }}
                      >
                        {listeningTrackLabel(track)}
                      </span>
                    ) : listeningTrackLabel(track)}
                    {')'}
                  </>
                ) : 'Exercise'}
              </h1>
              {track ? (
                <ListeningClozeExercise key={track.id} track={track} userName={userName} />
              ) : (
                <p>Exercise not found.</p>
              )}
            </div>
          </main>
        );
      })() : activePage === 'wordbook' ? (
        <main className="landing-page vocabulary-mode">
          <WordbookPage
            entries={wordbookEntries}
            onAdd={handleAddWord}
            onDelete={handleDeleteWord}
            onGrade={handleGradeWord}
          />
        </main>
      ) : activePage === 'profile' ? (
        <main className="landing-page vocabulary-mode">
          <div className="landing-panel profile-panel">
            <p className="eyebrow">My Profile</p>
            <h1>{userName}</h1>

            <div className="profile-course-head">
              <h2 className="profile-course-heading">{courses.vocabulary.title}</h2>
              <button
                type="button"
                className="profile-course-toggle"
                onClick={() => toggleProfileCourse('vocabulary')}
                aria-expanded={Boolean(expandedProfileCourses.vocabulary)}
                aria-label={expandedProfileCourses.vocabulary ? 'Collapse' : 'Expand'}
              >
                {expandedProfileCourses.vocabulary ? '−' : '+'}
              </button>
            </div>
            <p className="landing-meta">
              Your Score: <strong>{overallScorePercent !== null ? `${overallScorePercent}%` : '—'}</strong>
              {' '}({ratingValues.length} exercise{ratingValues.length === 1 ? '' : 's'} self-rated)
              {' '}· Progress: <strong>{visitedUnitsCount}%</strong>
            </p>
            {expandedProfileCourses.vocabulary && (
              <div className="profile-reset-list">
                <button type="button" className="profile-reset-btn primary" onClick={() => handleExportNotes('vocabulary')}>
                  <span>Export lesson notes (.txt)</span>
                  <small>Downloads "My Notes" from every unit as a single plain-text file.</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetProgress}>
                  <span>Reset unit progress</span>
                  <small>Clears which units count toward "Your Progress".</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetSelfEvaluation}>
                  <span>Reset self-evaluation</span>
                  <small>Clears "Your Score" and every star rating given per exercise.</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetLessonNotes}>
                  <span>Reset lesson notes</span>
                  <small>Clears "My Notes" for every unit.</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetExerciseAnswers}>
                  <span>Reset exercise answers</span>
                  <small>Clears the written answer saved for every exercise.</small>
                </button>
                <button type="button" className="profile-reset-btn danger" onClick={handleResetAll}>
                  <span>Reset All</span>
                  <small>Everything above, all at once.</small>
                </button>
              </div>
            )}

            <div className="profile-course-head">
              <h2 className="profile-course-heading">{courses.american1.title}</h2>
              <button
                type="button"
                className="profile-course-toggle"
                onClick={() => toggleProfileCourse('american1')}
                aria-expanded={Boolean(expandedProfileCourses.american1)}
                aria-label={expandedProfileCourses.american1 ? 'Collapse' : 'Expand'}
              >
                {expandedProfileCourses.american1 ? '−' : '+'}
              </button>
            </div>
            <p className="landing-meta">
              Your Score: <strong>{american1ScorePercent !== null ? `${american1ScorePercent}%` : '—'}</strong>
              {' '}({american1RatingValues.length} unit{american1RatingValues.length === 1 ? '' : 's'} self-rated)
              {' '}· Progress: <strong>{american1ProgressPercent}%</strong>
            </p>
            {expandedProfileCourses.american1 && (
              <div className="profile-reset-list">
                <button type="button" className="profile-reset-btn primary" onClick={() => handleExportNotes('american1')}>
                  <span>Export lesson notes (.txt)</span>
                  <small>Downloads "My Notes" from every unit and reference page as a single plain-text file.</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetAmerican1Progress}>
                  <span>Reset section progress</span>
                  <small>Clears which sections count toward "Your Progress".</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetAmerican1SelfEvaluation}>
                  <span>Reset self-evaluation</span>
                  <small>Clears "Your Score" and every star rating given per unit.</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetAmerican1Notes}>
                  <span>Reset lesson notes</span>
                  <small>Clears "My Notes" for every unit and reference page.</small>
                </button>
                <button type="button" className="profile-reset-btn danger" onClick={handleResetAmerican1All}>
                  <span>Reset All</span>
                  <small>Everything above, all at once.</small>
                </button>
              </div>
            )}

            <div className="profile-course-head">
              <h2 className="profile-course-heading">{courses.grammarElem.title}</h2>
              <button
                type="button"
                className="profile-course-toggle"
                onClick={() => toggleProfileCourse('grammarElem')}
                aria-expanded={Boolean(expandedProfileCourses.grammarElem)}
                aria-label={expandedProfileCourses.grammarElem ? 'Collapse' : 'Expand'}
              >
                {expandedProfileCourses.grammarElem ? '−' : '+'}
              </button>
            </div>
            <p className="landing-meta">
              Your Score: <strong>{grammarElemScorePercent !== null ? `${grammarElemScorePercent}%` : '—'}</strong>
              {' '}({grammarElemRatingValues.length} unit{grammarElemRatingValues.length === 1 ? '' : 's'} self-rated)
              {' '}· Progress: <strong>{grammarElemProgressPercent}%</strong>
            </p>
            {expandedProfileCourses.grammarElem && (
              <div className="profile-reset-list">
                <button type="button" className="profile-reset-btn primary" onClick={() => handleExportNotes('grammarElem')}>
                  <span>Export lesson notes (.txt)</span>
                  <small>Downloads "My Notes" from every unit as a single plain-text file.</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetGrammarElemProgress}>
                  <span>Reset unit progress</span>
                  <small>Clears which units count toward "Your Progress".</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetGrammarElemSelfEvaluation}>
                  <span>Reset self-evaluation</span>
                  <small>Clears "Your Score" and every star rating given per unit.</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetGrammarElemNotes}>
                  <span>Reset lesson notes</span>
                  <small>Clears "My Notes" for every unit.</small>
                </button>
                <button type="button" className="profile-reset-btn" onClick={handleResetGrammarElemAnswers}>
                  <span>Reset exercise answers</span>
                  <small>Clears the written answer saved for every unit's exercises.</small>
                </button>
                <button type="button" className="profile-reset-btn danger" onClick={handleResetGrammarElemAll}>
                  <span>Reset All</span>
                  <small>Everything above, all at once.</small>
                </button>
              </div>
            )}

            <p className="landing-meta profile-section-divider">
              Everything below is stored only in this browser (no account, no server) — these
              buttons erase it for good.
            </p>
            <div className="profile-reset-list">
              <button type="button" className="profile-reset-btn" onClick={handleSwitchUser}>
                <span>Switch user</span>
                <small>Log out of "{userName}" and register or continue as someone else on this browser.</small>
              </button>
              <button type="button" className="profile-reset-btn danger" onClick={handleDeleteAccount}>
                <span>Delete this user</span>
                <small>Permanently erases "{userName}" and every course's progress, score, notes and answers.</small>
              </button>
            </div>

            <div className="profile-course-head">
              <h2 className="profile-course-heading">Backup &amp; Restore</h2>
              <button
                type="button"
                className="profile-course-toggle"
                onClick={() => toggleProfileCourse('backup')}
                aria-expanded={Boolean(expandedProfileCourses.backup)}
                aria-label={expandedProfileCourses.backup ? 'Collapse' : 'Expand'}
              >
                {expandedProfileCourses.backup ? '−' : '+'}
              </button>
            </div>
            <p className="landing-meta">
              Your progress lives only in this browser's storage — clearing the cache, a browser
              update, or moving to a new computer can erase it for good.
            </p>
            {expandedProfileCourses.backup && (
              <div className="profile-reset-list">
                <button type="button" className="profile-reset-btn primary" onClick={handleExportBackup}>
                  <span>Export full backup (.json)</span>
                  <small>Downloads everything for "{userName}": progress, notes, answers, ratings and My Words.</small>
                </button>
                <label className="profile-reset-btn primary">
                  <span>Import backup (.json)</span>
                  <small>Restores a backup file into "{userName}" on this browser. Overwrites matching data.</small>
                  <input type="file" accept="application/json,.json" onChange={handleImportBackupFile} />
                </label>
              </div>
            )}
          </div>
        </main>
      ) : activePage === 'register' ? (
        <main className="landing-page">
          <div className="landing-panel register-panel">
            <p className="eyebrow">Welcome</p>
            <h1>Let's set up your profile</h1>
            <p className="landing-meta">
              Just your name for now — it keeps your progress and score separate from anyone
              else who studies on this browser.
            </p>

            {registeredUsers.length > 0 && (
              <div className="register-existing">
                <span className="register-existing-label">Continue as</span>
                <div className="register-existing-list">
                  {registeredUsers.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="register-existing-btn"
                      onClick={() => handleContinueAs(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="register-reset-all-btn"
                  onClick={handleResetAllBrowserData}
                  title="Don't recognize these names? Erase every user and all of their data on this browser."
                >
                  Reset all data on this browser
                </button>
              </div>
            )}

            <form className="register-form" onSubmit={handleRegisterSubmit}>
              <label className="register-field">
                <span>{registeredUsers.length > 0 ? 'Or register a new name' : 'Your name'}</span>
                <input
                  type="text"
                  className="register-input"
                  value={registerNameInput}
                  onChange={(event) => setRegisterNameInput(event.target.value)}
                  placeholder="e.g. Alex Smith"
                  autoFocus
                />
              </label>
              {registerError && <p className="register-error">{registerError}</p>}
              <button type="submit" className="show-answers-btn">Start learning</button>
            </form>
          </div>
        </main>
      ) : (
        <main className="landing-page landing-page--home">
          <div className="home-hero">
            <img
              src="/openCourse.png"
              alt="Learn English. Open Your World. Confident communication for real life."
              className="home-hero-image"
            />
            <div className="home-hero-footer">
              <p className="home-hero-tagline">A self-guided English learning project.</p>
              <button type="button" className="landing-cta" onClick={handleCourses}>
                Start Learning
              </button>
              {mostRecentLastVisited && (
                <button type="button" className="landing-cta continue-cta" onClick={handleContinueLastVisited}>
                  Continue where you left off
                  <small>{lastVisitedLabel}</small>
                </button>
              )}
            </div>
            {userName && (
              // Único painel de orientação da Home — o ReviewCard "Today's
              // Review" completo (todos os itens vencidos, sem limite de 2)
              // fica só na tela Courses; repeti-lo aqui também deixava a
              // Home com os mesmos itens listados duas vezes seguidas.
              <TodayPlanCard
                newUnit={planNewUnit}
                listening={planListening}
                reviewQueue={reviewQueue}
                onOpenReviewItem={handleOpenReviewItem}
                onSeeAllReviews={handleCourses}
              />
            )}
          </div>
        </main>
      )}

      {PAGES_WITH_SIDE_PANEL.includes(activePage) && (
        <button
          type="button"
          className="panel-toggle-btn"
          style={{
            right: sidePanelVisible ? rightWidth - 1 : 0,
            top: panelCenterY ?? '50%',
          }}
          onClick={() => setSidePanelVisible((value) => !value)}
          aria-label={sidePanelVisible ? 'Hide notes and answers panel' : 'Show notes and answers panel'}
          title={sidePanelVisible ? 'Hide notes and answers panel' : 'Show notes and answers panel'}
        >
          <IconChevron direction={sidePanelVisible ? 'right' : 'left'} />
        </button>
      )}

      {userName && insideCourse && (!PAGES_WITH_SIDE_PANEL.includes(activePage) || sidePanelVisible) && (
        <WordQuickAdd contextLabel={studyContextLabel} onAdd={handleAddWord} />
      )}
    </div>
  );
}

// Card "Today's Plan" (só na Home): um empurrão de "por onde começar" pra
// quem senta pra estudar sem plano — até 3 sugestões concretas (aprender algo
// novo, revisar o que já venceu, praticar listening), cada uma um botão que
// leva direto pra tela certa. Cada linha some sozinha se não houver nada pra
// sugerir naquele slot; o card inteiro some se não sobrar nenhuma (ex.: todo
// o conteúdo dos 3 cursos já foi visitado e não há revisão vencida).
//
// Mostra no máx. 2 itens de revisão (o resto da fila — se houver — fica só
// no "Today's Review" completo da tela Courses, evitando repetir a mesma
// lista inteira duas vezes na Home).
const UNIT_BADGE_LABELS = {
  unvisited: 'Not visited',
  visited: 'Visited',
  rated: 'Rated',
  mastered: 'Mastered',
};

function UnitBadgeDot({ status }) {
  return <span className={`unit-badge-dot unit-badge-dot--${status}`} title={UNIT_BADGE_LABELS[status]} />;
}

// Caixa de busca das 3 grades de unit — só um input controlado por fora
// (value/onChange), pra o estado (unitSearchQuery) poder ser compartilhado
// e zerado ao trocar de curso (ver handleVocabulary/handleAmerican1/
// handleGrammarElem em App()).
function UnitSearchBox({ value, onChange, placeholder }) {
  return (
    <div className="unit-search-box">
      <IconSearch />
      <input
        type="search"
        className="unit-search-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder || 'Search units...'}
        aria-label="Search units by keyword"
      />
      {value && (
        <button
          type="button"
          className="unit-search-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          ×
        </button>
      )}
    </div>
  );
}

function UnitBadgeLegend() {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="unit-badge-legend">
      {Object.entries(UNIT_BADGE_LABELS).map(([status, label]) => (
        <span key={status} className="unit-badge-legend-item">
          <UnitBadgeDot status={status} />
          {label}
        </span>
      ))}
      <span className="unit-badge-legend-info-wrap">
        <button
          type="button"
          className="unit-badge-legend-info-btn"
          onClick={() => setShowInfo((value) => !value)}
          aria-expanded={showInfo}
          aria-label="What do these badges mean?"
        >
          i
        </button>
        {showInfo && (
          <div className="unit-badge-legend-info-popover" role="tooltip">
            <p><strong>Not visited</strong> — you haven't opened this unit yet.</p>
            <p><strong>Visited</strong> — opened, but not self-rated yet.</p>
            <p><strong>Rated</strong> — self-rated at least once, below the maximum.</p>
            <p>
              <strong>Mastered</strong> — rated 5★. For Vocabulary (rated per exercise, not
              per unit), every exercise in the unit must be rated 5★.
            </p>
          </div>
        )}
      </span>
    </div>
  );
}

function TodayPlanCard({ newUnit, listening, reviewQueue, onOpenReviewItem, onSeeAllReviews }) {
  const reviewItems = reviewQueue.slice(0, 2);
  const moreReviewCount = reviewQueue.length - reviewItems.length;

  if (!newUnit && !listening && reviewItems.length === 0) {
    return null;
  }

  return (
    <section className="plan-card" aria-label="Today's plan">
      <div className="plan-card-head">
        <h2>Today's Plan</h2>
      </div>
      <p className="plan-card-hint">
        Not sure where to start? Here's a simple plan for today's session.
      </p>
      <div className="plan-items">
        {newUnit && (
          <button type="button" className="plan-item" onClick={newUnit.onOpen}>
            <span className="plan-item-icon" aria-hidden="true">📘</span>
            <span className="plan-item-main">
              <span className="plan-item-title">Learn something new</span>
              <span className="plan-item-detail">{newUnit.label}</span>
              <span className="plan-item-sub">{newUnit.sublabel}</span>
            </span>
          </button>
        )}
        {reviewItems.map((item) => {
          const label = reviewItemLabel(item);
          return (
            <button
              key={`${item.course}:${item.id}`}
              type="button"
              className="plan-item"
              onClick={() => onOpenReviewItem(item)}
            >
              <span className="plan-item-icon" aria-hidden="true">🔁</span>
              <span className="plan-item-main">
                <span className="plan-item-title">Review</span>
                <span className="plan-item-detail">{label.title}</span>
                <span className="plan-item-sub">{label.subtitle}</span>
              </span>
            </button>
          );
        })}
        {listening && (
          <button type="button" className="plan-item" onClick={listening.onOpen}>
            <span className="plan-item-icon" aria-hidden="true">🎧</span>
            <span className="plan-item-main">
              <span className="plan-item-title">Practice listening</span>
              <span className="plan-item-detail">{listening.label}</span>
              <span className="plan-item-sub">{listening.sublabel}</span>
            </span>
          </button>
        )}
      </div>
      {moreReviewCount > 0 && (
        <button type="button" className="plan-more-link" onClick={onSeeAllReviews}>
          +{moreReviewCount} more review{moreReviewCount === 1 ? '' : 's'} due — see all in Courses
        </button>
      )}
    </section>
  );
}

// Título/subtítulo de um item da fila "Today's Review", conforme o curso.
const reviewItemLabel = (item) => {
  if (item.course === 'vocabulary') {
    const unit = Number(item.id.split('.')[0]);
    return {
      title: `Exercise ${item.id}`,
      subtitle: `English Vocabulary B${unitTable[unit] ? ` — ${unitTable[unit]}` : ''}`,
    };
  }
  if (item.course === 'american1') {
    return { title: `Unit ${item.id}`, subtitle: 'American English A1' };
  }
  if (item.course === 'grammarElem') {
    return { title: `Unit ${item.id}`, subtitle: 'Grammar English A1' };
  }
  return { title: item.id, subtitle: item.course };
};

// Card "Today's Review" (Home e Courses): lista os itens autoavaliados cuja
// revisão espaçada venceu + o atalho pros flashcards vencidos do "My Words".
// Some por completo quando não há nada a revisar — a Home continua limpa.
function ReviewCard({ items, dueWordsCount, onOpenItem, onOpenWords, embedded }) {
  const MAX_SHOWN = 8;
  if (items.length === 0 && dueWordsCount === 0) {
    return null;
  }
  const shown = items.slice(0, MAX_SHOWN);
  const hiddenCount = items.length - shown.length;

  return (
    <section className={`review-card${embedded ? ' review-card--embedded' : ''}`} aria-label="Today's review">
      <div className="review-card-head">
        <h2>Today's Review</h2>
        <span className="review-card-count">
          {items.length + (dueWordsCount > 0 ? 1 : 0)} item{items.length + (dueWordsCount > 0 ? 1 : 0) === 1 ? '' : 's'}
        </span>
      </div>
      <p className="review-card-hint">
        Revisit what you studied before you forget it — after reviewing, rate the item again to
        schedule the next repetition.
      </p>
      <div className="review-items">
        {dueWordsCount > 0 && (
          <button type="button" className="review-item review-item--words" onClick={onOpenWords}>
            <span className="review-item-main">
              <span className="review-item-title">
                Practice {dueWordsCount} word{dueWordsCount === 1 ? '' : 's'}
              </span>
              <span className="review-item-sub">My Words — flashcards</span>
            </span>
            <span className="review-item-badge">Practice</span>
          </button>
        )}
        {shown.map((item) => {
          const label = reviewItemLabel(item);
          return (
            <button
              key={`${item.course}:${item.id}`}
              type="button"
              className="review-item"
              onClick={() => onOpenItem(item)}
            >
              <span className="review-item-main">
                <span className="review-item-title">{label.title}</span>
                <span className="review-item-sub">{label.subtitle}</span>
              </span>
              <span className="review-item-badge">rated {item.rating}★</span>
            </button>
          );
        })}
      </div>
      {hiddenCount > 0 && (
        <p className="review-more">…and {hiddenCount} more waiting after these.</p>
      )}
    </section>
  );
}

// Área de imagem-mnemônica do "My Words": aceita as 3 formas pedidas —
// clique pra escolher um arquivo, arrastar-e-soltar, ou colar (Ctrl+V) uma
// imagem copiada de outro lugar. Sem imagem, mostra a área de captura vazia;
// com imagem, vira uma prévia com botão de remover (clicar na prévia não
// reabre o seletor — é preciso remover primeiro, pra não trocar sem querer).
//
// O colar NÃO é tratado aqui dentro: como esta div só recebe foco se o
// usuário clicar exatamente nela, um Ctrl+V com o cursor em "Word"/"Meaning"/
// "Example" nunca chegaria até aqui. Em vez disso, o formulário INTEIRO (ver
// WordbookPage/WordQuickAdd) escuta onPaste — o evento sobe (bubble) de
// qualquer campo de texto até o <form>, então colar uma imagem funciona não
// importa qual campo esteja focado no momento.
function ImageDropZone({ image, onChange, compact }) {
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const processFile = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      setError('Please use an image file.');
      return;
    }
    setError('');
    setIsProcessing(true);
    try {
      const dataUrl = await resizeImageFileToDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setError('Could not load that image.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileInput = (event) => {
    processFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragOver(false);
    processFile(event.dataTransfer?.files?.[0]);
  };

  if (image) {
    return (
      <div className={`image-dropzone image-dropzone--filled${compact ? ' image-dropzone--compact' : ''}`}>
        <img src={image} alt="" className="image-dropzone-preview" />
        <button
          type="button"
          className="image-dropzone-remove"
          onClick={() => onChange(null)}
          aria-label="Remove image"
          title="Remove image"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div
      className={`image-dropzone${isDragOver ? ' is-dragover' : ''}${compact ? ' image-dropzone--compact' : ''}`}
      tabIndex={0}
      role="button"
      aria-label="Add a picture: click to upload, drag a file here, or paste from the clipboard in any field of this form"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="image-dropzone-input"
        onChange={handleFileInput}
        tabIndex={-1}
      />
      {isProcessing ? (
        <span className="image-dropzone-hint">Processing…</span>
      ) : (
        <span className="image-dropzone-hint">
          Add a picture (optional)
          <small>Click to upload, drag a file here, or paste (Ctrl+V) in any field</small>
        </span>
      )}
      {error && <span className="image-dropzone-error">{error}</span>}
    </div>
  );
}

// Página "My Words": caderno de vocabulário pessoal do usuário. Lista as
// palavras salvas (com significado/exemplo/contexto/imagem), permite
// adicionar e apagar, e tem o modo de prática por flashcards. Again/Good/Easy
// agenda a próxima revisão (ver FLASHCARD_STEPS_DAYS).
//
// Direção do flashcard depende de ter imagem ou não:
// - Sem imagem: frente = palavra, verso = significado + exemplo (recall
//   tradicional, L2 → L1).
// - Com imagem: frente = imagem + significado JUNTOS, verso = a palavra —
//   invertido de propósito (pedido do usuário): força o aluno a olhar a
//   imagem, ler o significado, e tentar lembrar/reconhecer a palavra em
//   inglês antes de revelar, em vez de só reconhecer a tradução.
function WordbookPage({ entries, onAdd, onDelete, onGrade }) {
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [image, setImage] = useState(null);
  const [practiceIds, setPracticeIds] = useState(null);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [finished, setFinished] = useState(false);

  const now = Date.now();
  const dueEntries = entries.filter((entry) => (entry.due ?? 0) <= now);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!word.trim()) return;
    onAdd({ word, meaning, example, context: '', image });
    setWord('');
    setMeaning('');
    setExample('');
    setImage(null);
  };

  // Colar uma imagem com o cursor em QUALQUER campo do formulário (não só
  // dentro da ImageDropZone) já anexa a foto — pedido explícito do usuário
  // depois de notar que colar só funcionava com a caixinha de imagem focada.
  // O evento de paste sobe (bubble) de qualquer <input> até este <form>; só
  // interceptamos (preventDefault) quando o clipboard realmente tem uma
  // imagem, senão colar texto normal nos campos continua funcionando.
  const handleFormPaste = (event) => {
    const file = getImageFileFromClipboardEvent(event);
    if (!file) return;
    event.preventDefault();
    resizeImageFileToDataUrl(file)
      .then(setImage)
      .catch(() => window.alert('Could not read that image from the clipboard.'));
  };

  const startPractice = () => {
    setPracticeIds(dueEntries.map((entry) => entry.id));
    setPracticeIndex(0);
    setFlipped(false);
    setFinished(false);
  };

  const practicing = Array.isArray(practiceIds) && practiceIds.length > 0 && !finished;
  const currentCard = practicing ? entries.find((entry) => entry.id === practiceIds[practiceIndex]) : null;

  const gradeCard = (grade) => {
    if (!currentCard) return;
    onGrade(currentCard.id, grade);
    setFlipped(false);
    if (practiceIndex < practiceIds.length - 1) {
      setPracticeIndex(practiceIndex + 1);
    } else {
      setFinished(true);
      setPracticeIds(null);
    }
  };

  const formatDue = (entry) => {
    const due = entry.due ?? 0;
    if (due <= now) return 'review now';
    const days = Math.ceil((due - now) / DAY_MS);
    return `review in ${days} day${days === 1 ? '' : 's'}`;
  };

  const sortedEntries = [...entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <div className="landing-panel vocabulary-page wordbook-panel">
      <div className="wordbook-head">
        <h2 className="vocabulary-title">My Words</h2>
        <span className="wordbook-count">
          {entries.length} word{entries.length === 1 ? '' : 's'} saved
        </span>
      </div>

      {practicing && currentCard ? (() => {
        const hasImage = Boolean(currentCard.image);
        const gradeButtons = (
          <div className="flashcard-actions">
            <button type="button" className="flashcard-grade again" onClick={() => gradeCard('again')}>
              Again
              <small>1 day</small>
            </button>
            <button type="button" className="flashcard-grade good" onClick={() => gradeCard('good')}>
              Good
              <small>
                {FLASHCARD_STEPS_DAYS[Math.min(FLASHCARD_STEPS_DAYS.length - 1, (currentCard.step || 0) + 1)]} days
              </small>
            </button>
            <button type="button" className="flashcard-grade easy" onClick={() => gradeCard('easy')}>
              Easy
              <small>
                {FLASHCARD_STEPS_DAYS[Math.min(FLASHCARD_STEPS_DAYS.length - 1, (currentCard.step || 0) + 2)]} days
              </small>
            </button>
          </div>
        );

        return (
          <div className="flashcard">
            <p className="flashcard-progress">
              Card {practiceIndex + 1} of {practiceIds.length}
            </p>

            {hasImage ? (
              <>
                {/* Frente: imagem + significado juntos, palavra escondida —
                    força o aluno a identificar a palavra a partir dos dois,
                    em vez de só reconhecer a tradução (ver comentário acima
                    do componente). */}
                <img src={currentCard.image} alt="" className="flashcard-image" />
                <p className="flashcard-meaning flashcard-meaning--prompt">
                  {currentCard.meaning || '(no meaning saved)'}
                </p>
                {currentCard.context && <p className="flashcard-context">from {currentCard.context}</p>}
                {flipped ? (
                  <div className="flashcard-back">
                    <p className="flashcard-word">{currentCard.word}</p>
                    {currentCard.example && <p className="flashcard-example">“{currentCard.example}”</p>}
                    {gradeButtons}
                  </div>
                ) : (
                  <div className="flashcard-actions">
                    <button type="button" className="show-answers-btn" onClick={() => setFlipped(true)}>
                      Show word
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="flashcard-word">{currentCard.word}</p>
                {currentCard.context && <p className="flashcard-context">from {currentCard.context}</p>}
                {flipped ? (
                  <div className="flashcard-back">
                    <p className="flashcard-meaning">{currentCard.meaning || '(no meaning saved)'}</p>
                    {currentCard.example && <p className="flashcard-example">“{currentCard.example}”</p>}
                    {gradeButtons}
                  </div>
                ) : (
                  <div className="flashcard-actions">
                    <button type="button" className="show-answers-btn" onClick={() => setFlipped(true)}>
                      Show meaning
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="flashcard-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setPracticeIds(null);
                  setFlipped(false);
                }}
              >
                Stop practicing
              </button>
            </div>
          </div>
        );
      })() : (
        <>
          {finished && (
            <div className="flashcard flashcard--done">
              <p className="flashcard-word">Session complete! 🎉</p>
              <p className="flashcard-context">
                Every reviewed word was rescheduled — come back when they are due again.
              </p>
            </div>
          )}

          <div className="wordbook-practice-row">
            <button
              type="button"
              className="show-answers-btn"
              onClick={startPractice}
              disabled={dueEntries.length === 0}
              title={dueEntries.length === 0 ? 'No words due for review right now' : ''}
            >
              Practice {dueEntries.length > 0 ? `${dueEntries.length} word${dueEntries.length === 1 ? '' : 's'}` : 'words'}
            </button>
            <span className="wordbook-practice-hint">
              {dueEntries.length > 0
                ? 'These words are due for review today.'
                : 'Nothing due right now — add new words or come back later.'}
            </span>
          </div>

          <form className="wordbook-form" onSubmit={handleSubmit} onPaste={handleFormPaste}>
            <input
              type="text"
              className="wordbook-input"
              placeholder="Word or expression"
              value={word}
              onChange={(event) => setWord(event.target.value)}
            />
            <input
              type="text"
              className="wordbook-input"
              placeholder="Meaning / translation"
              value={meaning}
              onChange={(event) => setMeaning(event.target.value)}
            />
            <ImageDropZone image={image} onChange={setImage} />
            <input
              type="text"
              className="wordbook-input wordbook-input--wide"
              placeholder="Example sentence (optional)"
              value={example}
              onChange={(event) => setExample(event.target.value)}
            />
            <button type="submit" className="show-answers-btn" disabled={!word.trim()}>
              Add word
            </button>
          </form>

          <div className="wordbook-list">
            {sortedEntries.length === 0 ? (
              <p className="wordbook-empty">
                No words yet. Add one above, or use the “+ Word” button inside any unit — selecting
                text in the reading PDF first fills the word in for you.
              </p>
            ) : (
              sortedEntries.map((entry) => (
                <div key={entry.id} className="wordbook-entry">
                  {entry.image && <img src={entry.image} alt="" className="wordbook-entry-thumb" />}
                  <div className="wordbook-entry-main">
                    <span className="wordbook-entry-word">{entry.word}</span>
                    {entry.meaning && <p className="wordbook-entry-meaning">{entry.meaning}</p>}
                    {entry.example && <p className="wordbook-entry-example">“{entry.example}”</p>}
                    <p className="wordbook-entry-meta">
                      {entry.context ? `${entry.context} · ` : ''}
                      {formatDue(entry)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="wordbook-delete"
                    title={`Delete "${entry.word}"`}
                    aria-label={`Delete "${entry.word}"`}
                    onClick={() => onDelete(entry.id)}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Botão flutuante "+ Word", presente em toda tela de estudo: abre um mini
// formulário pra salvar uma palavra no "My Words" sem sair da leitura. O
// mousedown é engolido (preventDefault) pra NÃO desfazer a seleção de texto
// no PDF — assim o texto selecionado no leitor entra como a palavra.
function WordQuickAdd({ contextLabel, onAdd }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [image, setImage] = useState(null);
  const [justAdded, setJustAdded] = useState(false);

  const handleOpen = () => {
    if (!open) {
      const selection = (window.getSelection?.().toString() || '').trim().replace(/\s+/g, ' ');
      if (selection && selection.length <= 120) {
        setWord(selection);
      }
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!word.trim()) return;
    onAdd({ word, meaning, example, context: contextLabel, image });
    setWord('');
    setMeaning('');
    setExample('');
    setImage(null);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  // Mesma ideia do WordbookPage: colar uma imagem com o cursor em qualquer
  // campo deste mini-formulário já anexa a foto (o evento sobe até o form).
  const handleFormPaste = (event) => {
    const file = getImageFileFromClipboardEvent(event);
    if (!file) return;
    event.preventDefault();
    resizeImageFileToDataUrl(file)
      .then(setImage)
      .catch(() => window.alert('Could not read that image from the clipboard.'));
  };

  return (
    <>
      {open && (
        <form className="word-quickadd" onSubmit={handleSubmit} onPaste={handleFormPaste}>
          <div className="word-quickadd-head">
            <strong>Add to My Words</strong>
            <button
              type="button"
              className="word-quickadd-close"
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <input
            type="text"
            className="wordbook-input"
            placeholder="Word or expression"
            value={word}
            onChange={(event) => setWord(event.target.value)}
            autoFocus
          />
          <input
            type="text"
            className="wordbook-input"
            placeholder="Meaning / translation"
            value={meaning}
            onChange={(event) => setMeaning(event.target.value)}
          />
          <ImageDropZone image={image} onChange={setImage} compact />
          <input
            type="text"
            className="wordbook-input"
            placeholder="Example sentence (optional)"
            value={example}
            onChange={(event) => setExample(event.target.value)}
          />
          {contextLabel && <span className="word-quickadd-context">from {contextLabel}</span>}
          <button type="submit" className="show-answers-btn" disabled={!word.trim()}>
            {justAdded ? 'Added ✓' : 'Save word'}
          </button>
        </form>
      )}
      <button
        type="button"
        className="word-fab"
        title="Save a word to My Words (select text in the PDF first to fill it in)"
        onMouseDown={(event) => event.preventDefault()}
        onClick={handleOpen}
      >
        + Word
      </button>
    </>
  );
}

function PdfWorkspace({ fileUrl, onPdfChange, defaultScale, initialPage, initialTool }) {
  const [activeTool, setActiveTool] = useState(initialTool || 'text');
  // Substitui o "Full screen" nativo (Fullscreen API do navegador) por um
  // "maximizar" só com CSS: o botão da própria lib deixava o leitor preso
  // com o spinner de carregamento girando pra sempre em telas reais fora do
  // DevTools (a virtualização interna da lib não reagia direito à promoção
  // pro "top layer" do navegador — várias tentativas de contornar isso por
  // fora não resolveram de forma confiável). Um resize comum de DOM, que é o
  // que isMaximized causa, é exatamente o tipo de mudança de tamanho que o
  // leitor já lida bem em todo o resto do app (painel de notas, redimensionar
  // janela etc.), então evita a classe inteira do problema.
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isMaximized) return undefined;
    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsMaximized(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMaximized]);

  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: () => [],
    toolbarPlugin: {
      selectionModePlugin: {
        selectionMode: initialTool === 'hand' ? SelectionMode.Hand : SelectionMode.Text,
      },
    },
    renderToolbar: (Toolbar) => (
      <Toolbar>
        {(slots) => {
          const {
            CurrentPageInput,
            GoToNextPage,
            GoToPreviousPage,
            NumberOfPages,
            Zoom,
            ZoomIn,
            ZoomOut,
            SwitchSelectionMode,
            ShowSearchPopover,
          } = slots;

          const separator = (
            <div style={{ width: '1px', height: '24px', background: '#ddd', margin: '0 4px' }} />
          );

          const toolButton = (mode, icon, label) => (
            <SwitchSelectionMode mode={mode}>
              {(props) => (
                <button
                  title={label}
                  onClick={() => {
                    props.onClick();
                    setActiveTool(mode.toLowerCase());
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '32px',
                    height: '32px',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: activeTool === mode.toLowerCase()
                      ? 'rgba(109, 66, 216, 0.15)'
                      : 'transparent',
                    color: activeTool === mode.toLowerCase() ? '#6d42d8' : '#444',
                    outline: activeTool === mode.toLowerCase()
                      ? '2px solid rgba(109, 66, 216, 0.35)'
                      : 'none',
                    transition: 'background 120ms, color 120ms',
                  }}
                >
                  {icon}
                </button>
              )}
            </SwitchSelectionMode>
          );

          return (
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '0 8px', gap: '4px' }}>
              <ShowSearchPopover />
              <GoToPreviousPage />
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CurrentPageInput />
                <span style={{ color: '#6f6689' }}>/</span>
                <NumberOfPages />
              </div>
              <GoToNextPage />
              {separator}
              <ZoomOut />
              <Zoom />
              <ZoomIn />
              {separator}
              {toolButton('Text', <IconText />, 'Select text')}
              {toolButton('Hand', <IconHand />, 'Hand tool')}
              <div style={{ flex: 1 }} />
              <button
                title={isMaximized ? 'Exit full screen' : 'Full screen'}
                onClick={() => setIsMaximized((prev) => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: 'transparent',
                  color: '#444',
                }}
              >
                {isMaximized ? <IconMinimize /> : <IconMaximize />}
              </button>
            </div>
          );
        }}
      </Toolbar>
    ),
  });

  return (
    <div className={`pdf-viewer-stage${isMaximized ? ' pdf-viewer-stage--maximized' : ''}`}>
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
        <Viewer
          fileUrl={fileUrl}
          defaultScale={defaultScale}
          initialPage={initialPage}
          plugins={[defaultLayoutPluginInstance]}
          renderError={(error) => (
            <div className="pdf-empty-state pdf-error-state">
              <p className="eyebrow">Invalid PDF</p>
              <h2>{error.message || 'Invalid PDF structure.'}</h2>
              <p>Choose another PDF file to continue reading.</p>
              {renderPdfUpload(onPdfChange, 'Load another PDF')}
            </div>
          )}
        />
      </Worker>
    </div>
  );
}

// Envolve o PdfWorkspace da tela de unit e sobrepõe um player compacto na
// margem esquerda da página, alinhado com cada letra de seção (A, B, C...),
// ancorado na página do próprio leitor via portal — não recorta nem substitui
// o leitor, só adiciona uma camada por cima. As coordenadas vêm de
// audio_anchors_coords.json (ver gerar_indice_audio.py). Reposiciona no
// zoom/resize através de um ResizeObserver na página renderizada.
// Espera um pouco depois da página do PDF aparecer no DOM antes de revelar os
// players (fade-in), porque o overlay costumava "piscar" pronto antes do
// canvas do PDF terminar de desenhar — dava impressão de que o áudio carrega
// antes do PDF. O valor foi calibrado a olho (~0.5s de diferença percebida).
const AUDIO_REVEAL_DELAY_MS = 200;

function UnitAudioReader({ fileUrl, onPdfChange, anchors, unit }) {
  const shellRef = useRef(null);
  const [overlayHost, setOverlayHost] = useState(null);
  const [scale, setScale] = useState(1);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setOverlayHost(null);
    setScale(1);
    setRevealed(false);

    const shell = shellRef.current;
    if (!shell || !anchors || anchors.length === 0) {
      return undefined;
    }

    const targetPage = anchors[0].page || 0;
    const pageWidth = anchors[0].pageWidth;

    let rafId = null;
    let resizeObserver = null;
    let revealTimeoutId = null;
    let lastPageLayer = null;

    const attach = () => {
      const pageLayer = shell.querySelector(`[data-testid="core__page-layer-${targetPage}"]`);
      if (!pageLayer) {
        rafId = requestAnimationFrame(attach);
        return;
      }

      if (pageLayer !== lastPageLayer) {
        lastPageLayer = pageLayer;
        if (resizeObserver) {
          resizeObserver.disconnect();
        }

        let host = Array.from(pageLayer.children).find((el) =>
          el.classList.contains('audio-anchor-host')
        );
        if (!host) {
          host = document.createElement('div');
          host.className = 'audio-anchor-host';
          pageLayer.appendChild(host);
        }
        setOverlayHost(host);

        const updateScale = () => {
          const width = pageLayer.getBoundingClientRect().width;
          if (width) {
            setScale(width / pageWidth);
          }
        };
        updateScale();

        resizeObserver = new ResizeObserver(updateScale);
        resizeObserver.observe(pageLayer);

        revealTimeoutId = setTimeout(() => setRevealed(true), AUDIO_REVEAL_DELAY_MS);
      }
    };

    const mutationObserver = new MutationObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(attach);
    });
    mutationObserver.observe(shell, { childList: true, subtree: true });
    attach();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (revealTimeoutId) clearTimeout(revealTimeoutId);
      mutationObserver.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [fileUrl, anchors]);

  return (
    <div className="unit-reader-shell" ref={shellRef}>
      <PdfWorkspace fileUrl={fileUrl} onPdfChange={onPdfChange} defaultScale={1.5} />
      {overlayHost && anchors && anchors.length > 0
        ? createPortal(
            <div className={`audio-anchor-layer${revealed ? ' is-visible' : ''}`}>
              {anchors.map((anchor) => (
                <AudioAnchorPlayer key={anchor.letter} anchor={anchor} scale={scale} unit={unit} />
              ))}
            </div>,
            overlayHost
          )
        : null}
    </div>
  );
}

// Miolo compartilhado pelos três players de áudio do app (o <audio> + a
// pílula de botões): play/pause, voltar 5s, stop, loop A-B e menu de
// velocidade — antes cada player duplicava tudo isso; agora só muda o
// wrapper/posicionamento de cada um.
//
// Loop A-B (repetir um trecho, essencial pra ditado/shadowing): o mesmo
// botão marca o início (A) no primeiro clique, o fim (B) no segundo (e já
// volta pro A tocando em loop), e desliga no terceiro. "Stop" também limpa o
// loop, já que zera a posição.
function AudioPlayerControls({ src }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loopStart, setLoopStart] = useState(null);
  const [loopEnd, setLoopEnd] = useState(null);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }
    const closeMenu = () => setMenuOpen(false);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [menuOpen]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  };

  const stop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setLoopStart(null);
    setLoopEnd(null);
  };

  const rewindFive = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  };

  const cycleLoop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loopStart === null) {
      setLoopStart(audio.currentTime);
    } else if (loopEnd === null) {
      // Marcar B praticamente em cima do A não forma um trecho tocável —
      // trata como desistência e desarma o A.
      if (audio.currentTime > loopStart + 0.5) {
        setLoopEnd(audio.currentTime);
        audio.currentTime = loopStart;
        if (audio.paused) {
          audio.play();
        }
      } else {
        setLoopStart(null);
      }
    } else {
      setLoopStart(null);
      setLoopEnd(null);
    }
  };

  const handleTimeUpdate = () => {
    const audio = audioRef.current;
    if (!audio || loopStart === null || loopEnd === null) return;
    if (audio.currentTime >= loopEnd) {
      audio.currentTime = loopStart;
    }
  };

  const changeRate = (speed) => {
    setRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setMenuOpen(false);
  };

  const loopTitle = loopStart === null
    ? 'Repeat a passage: click to mark the start (A)'
    : loopEnd === null
      ? 'Click to mark the end (B) and start repeating'
      : 'Stop repeating this passage';

  return (
    <>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
      />
      <button type="button" className="ap-btn" title="Play/Pause" onClick={togglePlay}>
        {isPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <button type="button" className="ap-btn" title="Back 5 seconds" onClick={rewindFive}>
        <IconBack5 />
      </button>
      <button type="button" className="ap-btn" title="Stop" onClick={stop}>
        <IconStop />
      </button>
      <button
        type="button"
        className={`ap-btn ap-btn-ab${loopEnd !== null ? ' is-looping' : loopStart !== null ? ' is-armed' : ''}`}
        title={loopTitle}
        onClick={cycleLoop}
      >
        {loopStart !== null && loopEnd === null ? 'A·' : 'A·B'}
      </button>
      <div className="ap-wrap">
        <button
          type="button"
          className="ap-btn"
          title="Speed"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        >
          <IconDots />
        </button>
        {menuOpen && (
          <div className="ap-menu open">
            {AUDIO_SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={speed === rate ? 'active' : ''}
                onClick={() => changeRate(speed)}
              >
                {speed}x
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// Player compacto ancorado a um ponto (x, y) da página do PDF, em pontos,
// escalado para o tamanho renderizado atual (controles: AudioPlayerControls).
function AudioAnchorPlayer({ anchor, scale, unit }) {
  // Ancorado na margem esquerda da página (sempre vazia), com a borda direita
  // encostando pouco antes da letra e centralizado na sua altura — a faixa
  // colorida da própria letra é estreita demais para caber o player, e
  // colocá-lo abaixo cobriria o título/corpo do texto.
  const anchorMidY = (anchor.yTop + anchor.yBottom) / 2;
  return (
    <div
      className="audio-anchor"
      style={{
        left: `${(anchor.x0 - 4) * scale}px`,
        top: `${anchorMidY * scale}px`,
        transform: 'translate(-100%, -50%)',
      }}
    >
      <AudioPlayerControls src={`/audio/unit_${unit}/${anchor.audio}`} />
    </div>
  );
}

// Mesmo player do curso Vocabulary (controles: AudioPlayerControls), mas sem
// ancoragem num ponto (x, y) da página: fica no fluxo normal da toolbar, ao
// lado da letra (A, B, C...) do Grammar English A1 — não tem PDF pra
// ancorar em cima, é só um link de áudio simples.
function SimpleAudioPlayer({ src, label }) {
  return (
    <div className="audio-anchor audio-anchor-inline">
      <span className="audio-anchor-inline-label">{label}</span>
      <AudioPlayerControls src={src} />
    </div>
  );
}

// Palavras curtas/funcionais que não viram lacuna (artigo, pronome, verbo
// auxiliar...) — a ideia é sortear palavras de conteúdo (substantivos,
// verbos, números "grandes"), como no exemplo original ("cheese" em vez de
// "a"/"and"), não palavras triviais demais pra reconhecer de ouvido.
const LISTENING_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'am',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'and', 'but', 'or', 'so', 'if',
  'this', 'that', 'these', 'those', 'there', 'here',
  'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  'yes', 'no', 'not', 'please', 'thank', 'thanks', 'ok', 'oh',
]);

// Tira um rótulo de falante do início da fala (ex.: "A: ", "Teacher: ",
// "Student 1: ") — nunca vira lacuna nem conta pro tamanho da fala.
function splitListeningSpeakerLabel(text) {
  const match = text.match(/^([A-Z][a-zA-Z]*(?:\s\d+)?:\s+)/);
  if (!match) return { label: '', rest: text };
  return { label: match[1], rest: text.slice(match[1].length) };
}

// Preserva os espaços como tokens próprios, pra recompor o texto original
// trocando só as palavras sorteadas por <input> sem perder espaçamento.
function tokenizeListeningText(text) {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}

function isListeningBlankCandidate(token) {
  const stripped = token.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
  if (stripped.length < 3) return false;
  return /^\d+$/.test(stripped) || !LISTENING_STOPWORDS.has(stripped.toLowerCase());
}

function pickRandomIndices(candidates, count) {
  const pool = [...candidates];
  const picked = [];
  while (pool.length > 0 && picked.length < count) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool[i]);
    pool.splice(i, 1);
  }
  return picked.sort((a, b) => a - b);
}

// Monta o modelo de uma fala: quantas lacunas ela ganha depende do tamanho
// (falas curtas — menos de 10 palavras — ganham 1; falas mais longas ganham
// mais, cerca de 1 a cada 6 palavras) e QUAIS palavras viram lacuna é
// sorteado toda vez que a função roda — chamada de dentro de um useMemo sem
// dependência persistida, então cada visita à tela sorteia palavras
// diferentes, evitando que o usuário decore a resposta certa.
function buildListeningSentenceModel(text) {
  const { label, rest } = splitListeningSpeakerLabel(text);
  const tokens = tokenizeListeningText(rest);
  const wordIndices = [];
  tokens.forEach((token, i) => {
    if (!/^\s+$/.test(token)) wordIndices.push(i);
  });

  let candidates = wordIndices.filter((i) => isListeningBlankCandidate(tokens[i]));
  if (candidates.length === 0) candidates = wordIndices;

  const blankCount = Math.max(
    1,
    Math.min(candidates.length, wordIndices.length < 10 ? 1 : Math.ceil(wordIndices.length / 6))
  );
  const blankTokenIndices = new Set(pickRandomIndices(candidates, blankCount));

  const parts = tokens.map((token, i) => {
    if (!blankTokenIndices.has(i)) return { type: 'text', value: token };
    const match = token.match(/^([^a-zA-Z0-9]*)([a-zA-Z0-9]+)([^a-zA-Z0-9]*)$/);
    return match
      ? { type: 'blank', before: match[1], word: match[2], after: match[3] }
      : { type: 'blank', before: '', word: token, after: '' };
  });

  return { label, parts };
}

const normalizeListeningAnswer = (text) => text.trim().toLowerCase().replace(/[.,!?"'’]/g, '');

// Histórico de tentativas de um exercício de Listening (quantas vezes o
// usuário conferiu as respostas e a pontuação da última vez) — mostrado na
// tela "Choose an exercise" antes mesmo de abrir o exercício de novo.
const listeningStatsKey = (userName, trackId) => userKey(userName, `listening:${trackId}:stats`);

function loadListeningStats(userName, trackId) {
  if (!userName) return null;
  try {
    const raw = window.localStorage.getItem(listeningStatsKey(userName, trackId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function saveListeningAttempt(userName, trackId, scorePercent) {
  if (!userName) return;
  try {
    const prev = loadListeningStats(userName, trackId);
    const next = {
      attempts: (prev?.attempts || 0) + 1,
      lastScorePercent: scorePercent,
      lastAttemptAt: new Date().toISOString(),
    };
    window.localStorage.setItem(listeningStatsKey(userName, trackId), JSON.stringify(next));
  } catch (error) {
    // Armazenamento indisponível — segue funcionando, só sem estatística.
  }
}

// Tela do exercício de um track (ex.: CD1 Track 13): player de áudio no topo
// (SimpleAudioPlayer — reaproveita o botão de repetir A-B, essencial pra
// ouvir uma palavra difícil de novo) e a lista de falas com lacuna(s) abaixo,
// corrigidas todas de uma vez pelo botão "Check answers" no final. A barra de
// espaço toca/pausa o áudio sempre que o foco não estiver num campo de texto
// (senão digitar um espaço dentro de uma resposta pausaria o áudio).
function ListeningClozeExercise({ track, userName }) {
  // regenerateKey só existe pra forçar o useMemo a sortear de novo — não
  // representa nenhum dado real, só entra na dependência pra invalidar o
  // cache quando o usuário pede "Do it again with other words".
  const [regenerateKey, setRegenerateKey] = useState(0);
  const sentenceModels = useMemo(
    () => track.sentences.map((text) => buildListeningSentenceModel(text)),
    [track.id, regenerateKey]
  );
  const [answers, setAnswers] = useState({});
  const [checked, setChecked] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const audioBarRef = useRef(null);

  useEffect(() => {
    setAnswers({});
    setChecked(false);
    setShowAnswers(false);
  }, [track.id, regenerateKey]);

  const handleRegenerate = () => {
    setRegenerateKey((key) => key + 1);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code !== 'Space') return;
      // Dentro de um campo de resposta (ou botão focado), o Space sozinho
      // precisa continuar digitando um espaço normal (respostas de mais de
      // uma palavra) — só Ctrl+Space pausa/toca ali. Fora de campo de
      // texto, o Space sozinho já basta, sem precisar do Ctrl.
      // (Alt+Space foi tentado antes, mas no Windows o Alt sozinho já ativa
      // o menu do navegador antes do evento chegar aqui — Ctrl não tem esse
      // problema.)
      const tag = document.activeElement?.tagName;
      const blocksPlainSpace = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON';
      if (!event.ctrlKey && blocksPlainSpace) return;
      const audio = audioBarRef.current?.querySelector('audio');
      if (!audio) return;
      event.preventDefault();
      if (audio.paused) {
        audio.play();
      } else {
        audio.pause();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleChange = (key, value) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    if (checked) setChecked(false);
  };

  const handleCheckAll = () => {
    setChecked(true);
    let total = 0;
    let correct = 0;
    sentenceModels.forEach((model, sentenceIndex) => {
      let blankIdx = -1;
      model.parts.forEach((part) => {
        if (part.type !== 'blank') return;
        blankIdx += 1;
        total += 1;
        const value = answers[`${sentenceIndex}:${blankIdx}`] || '';
        if (value.trim() && normalizeListeningAnswer(value) === normalizeListeningAnswer(part.word)) {
          correct += 1;
        }
      });
    });
    if (total > 0) {
      saveListeningAttempt(userName, track.id, Math.round((correct / total) * 100));
    }
  };

  let totalBlanks = 0;
  let correctBlanks = 0;

  return (
    <div className="listening-exercise">
      <div className="listening-audio-bar" ref={audioBarRef}>
        <SimpleAudioPlayer src={track.audio} label={track.audioLabel || `${track.cd.replace(/^CD/i, '')}-${track.track}`} />
        <p className="listening-instructions">
          Listen to the audio and type the missing word(s) in each sentence — press Space (or
          Ctrl+Space while typing in a blank) to pause/play the audio, then press Check answers.
        </p>
      </div>
      <ol className="listening-sentences">
        {sentenceModels.map((model, sentenceIndex) => {
          let blankIndexInSentence = -1;
          return (
            <li key={sentenceIndex} className="listening-sentence">
              <span className="listening-sentence-number">{sentenceIndex + 1}</span>
              <span className="listening-sentence-text">
                {model.label}
                {model.parts.map((part, partIndex) => {
                  if (part.type === 'text') {
                    return <span key={partIndex}>{part.value}</span>;
                  }
                  blankIndexInSentence += 1;
                  const key = `${sentenceIndex}:${blankIndexInSentence}`;
                  const value = answers[key] || '';
                  totalBlanks += 1;
                  let stateClass = '';
                  if (checked) {
                    if (!value.trim()) {
                      stateClass = ' is-empty';
                    } else if (normalizeListeningAnswer(value) === normalizeListeningAnswer(part.word)) {
                      stateClass = ' is-correct';
                      correctBlanks += 1;
                    } else {
                      stateClass = ' is-incorrect';
                    }
                  }
                  // Piso de 8ch (não 4ch): pra palavras curtas tipo "is"/"a", o
                  // padding do input sozinho já comia quase toda a largura,
                  // deixando pouco espaço até pra digitar a resposta certa.
                  return (
                    <span key={partIndex}>
                      {part.before}
                      <input
                        type="text"
                        className={`listening-blank-input${stateClass}`}
                        value={value}
                        onChange={(event) => handleChange(key, event.target.value)}
                        style={{ width: `${Math.max(8, part.word.length + 3)}ch` }}
                        aria-label={`Blank ${blankIndexInSentence + 1} of sentence ${sentenceIndex + 1}`}
                        autoComplete="off"
                        spellCheck="false"
                      />
                      {showAnswers && (
                        <span className="listening-answer-hint">{part.word}</span>
                      )}
                      {part.after}
                    </span>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="listening-check-all">
        <button type="button" className="show-answers-btn" onClick={handleCheckAll}>
          Check answers
        </button>
        <button
          type="button"
          className="show-answers-btn secondary"
          onClick={() => setShowAnswers((prev) => !prev)}
        >
          {showAnswers ? 'Hide answers' : 'Show answers'}
        </button>
        <button type="button" className="show-answers-btn secondary" onClick={handleRegenerate}>
          Do it again with other words
        </button>
        {checked && (
          <span className="listening-check-summary">
            {correctBlanks} / {totalBlanks} correct
          </span>
        )}
      </div>
    </div>
  );
}

// Curso "American English A1": ancora um player compacto sobre cada selo
// de áudio impresso no PDF (ver american1_audio_anchors.json — gerado por
// casamento de template + inferência de faixa, já que esse PDF não tem
// nenhuma camada de texto, é tudo imagem escaneada; detalhes no
// PROJECT_SUMMARY.md). Diferente do UnitAudioReader (que só ancora na margem
// de UMA página), aqui os anchors de uma seção podem cair em qualquer uma das
// 2 páginas do PDF mesclado — por isso observa e injeta um host em cada
// page-layer que tiver pelo menos um anchor, não só o primeiro.
function American1AudioReader({ fileUrl, anchors }) {
  const shellRef = useRef(null);
  const [pageHosts, setPageHosts] = useState({});
  const [scales, setScales] = useState({});
  const [revealedPages, setRevealedPages] = useState({});

  const anchorsByPage = {};
  (anchors || []).forEach((anchor) => {
    (anchorsByPage[anchor.page] = anchorsByPage[anchor.page] || []).push(anchor);
  });
  const pagesNeeded = Object.keys(anchorsByPage).map(Number);
  const anyPageRevealed = Object.keys(revealedPages).length > 0;

  useEffect(() => {
    setPageHosts({});
    setScales({});
    setRevealedPages({});

    const shell = shellRef.current;
    if (!shell || pagesNeeded.length === 0) {
      return undefined;
    }

    let rafId = null;
    const revealTimeouts = {};
    const resizeObservers = [];

    // Não usa um Set de "página já anexada" para pular checagens futuras:
    // com muitas páginas (ex.: Transcriptions, 8 páginas), o visualizador
    // pode desmontar/remontar o node de uma página distante ao rolar
    // (virtualização), trocando o elemento por um novo sem o host de áudio —
    // se a página já tivesse sido marcada como "anexada" permanentemente,
    // ela ficaria sem player pra sempre. Por isso toda passada de attach()
    // reavalia o pageLayer atual de cada página e recria o host se preciso;
    // só evita recriar o ResizeObserver quando o MESMO node (marcado via
    // dataset) já está sendo observado.
    //
    // A revelação (fade-in) também é por página, não um único gate global:
    // com muitas páginas, o visualizador só monta as próximas conforme o
    // usuário rola (virtualização) — esperar TODAS as páginas do documento
    // ficarem prontas antes de mostrar qualquer player faria os players da
    // página 1 nunca aparecerem até o usuário rolar até o fim do documento.
    const attach = () => {
      let missing = false;
      pagesNeeded.forEach((pageIndex) => {
        const pageLayer = shell.querySelector(`[data-testid="core__page-layer-${pageIndex}"]`);
        if (!pageLayer) {
          missing = true;
          return;
        }

        let host = Array.from(pageLayer.children).find((el) => el.classList.contains('audio-anchor-host'));
        if (!host) {
          host = document.createElement('div');
          host.className = 'audio-anchor-host';
          pageLayer.appendChild(host);
          setPageHosts((prev) => ({ ...prev, [pageIndex]: host }));
        }

        if (!pageLayer.dataset.audioAnchorObserved) {
          pageLayer.dataset.audioAnchorObserved = 'true';
          const pageWidth = anchorsByPage[pageIndex][0].pageWidth;
          const updateScale = () => {
            const width = pageLayer.getBoundingClientRect().width;
            if (width) {
              setScales((prev) => ({ ...prev, [pageIndex]: width / pageWidth }));
            }
          };
          updateScale();
          const resizeObserver = new ResizeObserver(updateScale);
          resizeObserver.observe(pageLayer);
          resizeObservers.push(resizeObserver);
        }

        if (!revealTimeouts[pageIndex]) {
          revealTimeouts[pageIndex] = setTimeout(() => {
            setRevealedPages((prev) => ({ ...prev, [pageIndex]: true }));
          }, AUDIO_REVEAL_DELAY_MS);
        }
      });

      if (missing) {
        rafId = requestAnimationFrame(attach);
      }
    };

    const mutationObserver = new MutationObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(attach);
    });
    mutationObserver.observe(shell, { childList: true, subtree: true });
    attach();

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      Object.values(revealTimeouts).forEach((id) => clearTimeout(id));
      mutationObserver.disconnect();
      resizeObservers.forEach((ro) => ro.disconnect());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  return (
    <div className="unit-reader-shell" ref={shellRef}>
      {/* Só mostra a barra enquanto realmente existe algo pra ancorar —
          sem essa checagem, uma página sem nenhum áudio (ex.: Sound Bank)
          nunca marca nenhuma página como "revealed" (o efeito acima nem
          roda, pagesNeeded fica vazio) e a barra ficava girando pra sempre,
          parecendo que a página está travada carregando. */}
      {pagesNeeded.length > 0 && !anyPageRevealed && (
        <div className="audio-anchors-loading" role="status" aria-label="Loading audio players">
          <div className="audio-anchors-loading-bar" />
        </div>
      )}
      <PdfWorkspace fileUrl={fileUrl} defaultScale={1.5} />
      {Object.entries(pageHosts).map(([pageIndex, host]) => createPortal(
        <div key={pageIndex} className={`audio-anchor-layer${revealedPages[pageIndex] ? ' is-visible' : ''}`}>
          {(anchorsByPage[pageIndex] || []).map((anchor) => (
            <American1AudioAnchorPlayer
              key={`${anchor.page}:${anchor.track}`}
              anchor={anchor}
              scale={scales[pageIndex] || 1}
            />
          ))}
        </div>,
        host
      ))}
    </div>
  );
}

// Mesmo player do curso Vocabulary (controles: AudioPlayerControls), só que
// centralizado exatamente em cima do selo impresso (não ancorado numa
// margem) e um pouco menor/translúcido (ver .american1-audio-anchor no CSS),
// já que aqui ele fica sobre texto corrido.
function American1AudioAnchorPlayer({ anchor, scale }) {
  return (
    <div
      className="american1-audio-anchor"
      style={{
        left: `${anchor.x * scale}px`,
        top: `${anchor.y * scale}px`,
      }}
    >
      <AudioPlayerControls src={anchor.audio} />
    </div>
  );
}

// Envolve o leitor PDF existente e o recorta (crop) para mostrar SOMENTE a faixa
// vertical [top, bottom] do exercício. Não altera o leitor: apenas ajusta, via
// DOM, a altura visível do scroller e a posição de rolagem, reagindo a zoom e
// redimensionamento. O PDF original continua sendo o arquivo carregado.
function CroppedExerciseViewer({ fileUrl, coords }) {
  const shellRef = useRef(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !coords) {
      return undefined;
    }

    let cancelled = false;
    let rafId = null;
    // Detecta o loop infinito de zoom (ver comentário em .study-reader no
    // App.css): se a largura calculada agora é igual à de duas aplicações
    // atrás (ping-pong entre 2 valores, ex. 168%/170%), para de reagir a
    // novos resizes/mutations em vez de ficar alternando pra sempre — o
    // recorte já foi aplicado corretamente, só a reatividade é encerrada.
    let recentWidths = [];
    let oscillationBroken = false;

    const targetPage = coords.page || 0;

    const applyCrop = () => {
      if (cancelled) {
        return;
      }
      const scroller = shell.querySelector('.rpv-core__inner-pages');
      // Página-alvo pelo data-testid (funciona mesmo com PDF multipágina e
      // virtualização, desde que initialPage a tenha renderizado).
      const pageLayer = shell.querySelector(
        `[data-testid="core__page-layer-${targetPage}"]`
      );
      const width = pageLayer ? pageLayer.getBoundingClientRect().width : 0;
      if (!scroller || !width) {
        rafId = requestAnimationFrame(applyCrop);
        return;
      }

      const roundedWidth = Math.round(width);
      if (recentWidths.includes(roundedWidth) && recentWidths.length >= 2) {
        oscillationBroken = true;
      }
      recentWidths = [...recentWidths.slice(-2), roundedWidth];

      const scale = width / coords.pageWidth;
      const bandHeight = Math.max(48, (coords.bottom - coords.top) * scale);
      // Deslocamento real do topo da página-alvo dentro do scroller.
      const pageTopInScroller =
        pageLayer.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      const bandTop = pageTopInScroller + coords.top * scale;

      scroller.style.setProperty('height', `${bandHeight}px`, 'important');
      scroller.style.setProperty('max-height', `${bandHeight}px`, 'important');
      scroller.style.setProperty('flex', '0 0 auto', 'important');
      scroller.style.setProperty('overflow', 'hidden', 'important');
      scroller.scrollTop = bandTop;

      // Encolhe o leitor para envolver apenas a barra + a banda do exercício,
      // evitando uma grande área vazia abaixo (as bandas são largas e baixas).
      const toolbar = shell.querySelector('.rpv-default-layout__toolbar');
      const toolbarH = toolbar ? toolbar.getBoundingClientRect().height : 40;
      const viewerRoot = shell.querySelector('.rpv-core__viewer');
      if (viewerRoot) {
        viewerRoot.style.setProperty('height', `${toolbarH + bandHeight + 2}px`, 'important');
      }

      if (oscillationBroken) {
        mo.disconnect();
        ro.disconnect();
      }
    };

    // Reaplica o recorte quando o conteúdo muda (zoom troca o canvas) ou o
    // painel é redimensionado.
    const mo = new MutationObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(applyCrop);
    });
    mo.observe(shell, { childList: true, subtree: true });

    const ro = new ResizeObserver(() => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(applyCrop);
    });
    ro.observe(shell);

    applyCrop();

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      mo.disconnect();
      ro.disconnect();
    };
  }, [fileUrl, coords]);

  return (
    <div className="crop-shell" ref={shellRef}>
      <PdfWorkspace
        fileUrl={fileUrl}
        defaultScale={SpecialZoomLevel.PageWidth}
        initialPage={coords.page || 0}
      />
    </div>
  );
}

// Coluna direita: resposta do aluno, persistida por exercício em localStorage.
function AnswerArea({
  exerciseId,
  heading,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  isLastExercise,
  canGoNextUnit,
  onNextReadingUnit,
  showAnswers,
  hasAnswer,
  onToggleAnswers,
  rating,
  onRate,
  userName,
}) {
  const storageKey = userKey(userName, `answers:${exerciseId}`);
  const [answer, setAnswer] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      setAnswer(raw || '');
    } catch (error) {
      setAnswer('');
    }
  }, [storageKey]);

  const handleChange = (value) => {
    setAnswer(value);
    try {
      window.localStorage.setItem(storageKey, value);
    } catch (error) {
      // Armazenamento indisponível — mantém apenas em memória.
    }
  };

  return (
    <div className="answers-inner">
      <div className="answers-head">
        <h2>{heading || `Exercise ${exerciseId}`}</h2>
        <div className="answers-nav">
          <button type="button" className="ghost-button" onClick={onPrevious} disabled={!hasPrevious}>
            ‹ Previous
          </button>
          <button type="button" className="ghost-button" onClick={onNext} disabled={!hasNext}>
            Next ›
          </button>
        </div>
      </div>

      <label className="answer-field">
        <span>Your answer</span>
        <textarea
          className="answer-box"
          value={answer}
          placeholder="Type your answer..."
          onChange={(event) => handleChange(event.target.value)}
        />
      </label>

      <div className="rating-field">
        <span>Self-evaluation</span>
        <div className="rating-stars" role="radiogroup" aria-label="Rate your own performance on this exercise, from 1 to 5 stars">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} star${value > 1 ? 's' : ''}`}
              className={`rating-star${rating >= value ? ' is-filled' : ''}`}
              onClick={() => onRate(value)}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <div className="answers-actions">
        <button
          type="button"
          className={`show-answers-btn${showAnswers ? ' is-active' : ''}`}
          onClick={onToggleAnswers}
          disabled={!hasAnswer}
          title={hasAnswer ? '' : 'No answer key for this exercise'}
        >
          {showAnswers ? 'Hide answers' : 'Show answers'}
        </button>
        <button type="button" className="show-answers-btn secondary" onClick={onNext} disabled={!hasNext}>
          Next ›
        </button>
        {isLastExercise && canGoNextUnit && (
          <button type="button" className="show-answers-btn secondary" onClick={onNextReadingUnit}>
            Next Unit
          </button>
        )}
      </div>
    </div>
  );
}

// Painel direito da tela de unit: bloco de anotações livres do aluno, com
// formatação simples (negrito, marca-texto, tamanho de letra). O botão
// "Save" persiste no localStorage do navegador, por unit (`notes:<unit>`) —
// mesmo padrão já usado nas respostas dos exercícios. Ainda não é um banco de
// dados de verdade (não sincroniza entre dispositivos), mas sobrevive a
// fechar a aba/navegador.
const NOTES_HIGHLIGHT_COLOR = '#ffe066';
const NOTES_HIGHLIGHT_RGB = 'rgb(255, 224, 102)';

function UnitNotes({
  unit,
  userName,
  storageKeyBase,
  hasAnswers,
  showAnswers,
  onToggleAnswers,
  rating,
  onRate,
}) {
  const editorRef = useRef(null);
  const [justSaved, setJustSaved] = useState(false);
  const storageKey = userKey(userName, storageKeyBase || `notes:${unit}`);

  // Carrega a anotação salva desta unit (se houver) ao entrar na tela.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    try {
      el.innerHTML = window.localStorage.getItem(storageKey) || '';
    } catch (error) {
      el.innerHTML = '';
    }
  }, [storageKey]);

  const handleSave = () => {
    const el = editorRef.current;
    if (!el) return;
    try {
      window.localStorage.setItem(storageKey, el.innerHTML);
    } catch (error) {
      // Armazenamento indisponível — a nota fica só na tela até recarregar.
    }
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1500);
  };

  // Garante que exista uma seleção dentro do editor antes de aplicar um
  // comando — se o usuário clicou num botão sem ter focado o texto antes, o
  // cursor vai para o fim do que já foi escrito, em vez de o comando falhar
  // ou afetar outra parte da página.
  const focusEditorSelection = () => {
    const el = editorRef.current;
    if (!el) return null;
    el.focus();
    const selection = window.getSelection();
    if (selection && el.contains(selection.anchorNode)) {
      return selection;
    }
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return selection;
  };

  const exec = (command, value) => {
    focusEditorSelection();
    document.execCommand(command, false, value);
  };

  // O texto copiado do leitor de PDF (pdf.js) vem com uma camada de spans
  // posicionados em absolute (usada só para permitir selecionar o texto por
  // cima do desenho da página) — colando isso como HTML "rico" no editor,
  // o navegador insere esses spans com position:absolute, o que faz o texto
  // colado sumir (fica fora do fluxo normal) e quebra a edição depois (o
  // cursor fica preso dentro de um desses spans deslocados). Forçamos a
  // colagem como texto puro para evitar isso.
  const handlePaste = (event) => {
    event.preventDefault();
    const text = event.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  };

  // Alterna o marca-texto do trecho selecionado (como negrito): se já está
  // destacado, remove; senão, aplica. Só age se houver texto selecionado —
  // aplicar com o cursor "piscando" (sem seleção) faz o navegador ligar um
  // modo "marca-texto permanente" que passa a valer pra tudo que for digitado
  // depois, e não tem como desligar depois (era essa a causa do travamento).
  //
  // Detecta se já está destacado olhando o estilo computado do início da
  // seleção, em vez de document.queryCommandValue('hiliteColor') — esse
  // comando é pouco confiável entre navegadores e não refletia o estado real
  // (por isso clicar em cima de um trecho já marcado não removia).
  const toggleHighlight = () => {
    const selection = focusEditorSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }
    const range = selection.getRangeAt(0);
    const node = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
    const currentBg = node ? window.getComputedStyle(node).backgroundColor : '';
    const isHighlighted = currentBg === NOTES_HIGHLIGHT_RGB;
    document.execCommand('hiliteColor', false, isHighlighted ? 'transparent' : NOTES_HIGHLIGHT_COLOR);
  };

  // Aumenta/diminui o tamanho só do trecho selecionado, como no Word — não
  // mexe no resto do texto. Usa o truque de marcar a seleção com
  // execCommand('fontSize', '7') e depois trocar o <font size="7"> resultante
  // por um <span> com o tamanho em px que a gente quer.
  const changeFontSize = (delta) => {
    const el = editorRef.current;
    const selection = focusEditorSelection();
    if (!el || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const container = selection.getRangeAt(0).startContainer;
    const startEl = container.nodeType === 3 ? container.parentElement : container;
    const currentPx = parseInt(window.getComputedStyle(startEl).fontSize, 10) || 15;
    const nextPx = Math.min(28, Math.max(10, currentPx + delta * 2));

    document.execCommand('fontSize', false, '7');
    el.querySelectorAll('font[size="7"]').forEach((fontEl) => {
      fontEl.removeAttribute('size');
      fontEl.style.fontSize = `${nextPx}px`;
    });
  };

  return (
    <div className="notes-inner">
      <div className="answers-head">
        <h2>My Notes</h2>
      </div>

      <div className="notes-toolbar">
        <button type="button" className="notes-toolbar-btn" title="Smaller text" onClick={() => changeFontSize(-1)}>
          A-
        </button>
        <button type="button" className="notes-toolbar-btn" title="Bigger text" onClick={() => changeFontSize(1)}>
          A+
        </button>
        <button type="button" className="notes-toolbar-btn" title="Bold" onClick={() => exec('bold')}>
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="notes-toolbar-btn is-highlight"
          title="Highlight (click again to remove)"
          onClick={toggleHighlight}
        >
          H
        </button>
      </div>

      <div
        ref={editorRef}
        className="notes-editor"
        contentEditable
        suppressContentEditableWarning
        onPaste={handlePaste}
        data-placeholder="Write anything you want to remember about this unit..."
      />

      {onRate && (
        <div className="rating-field">
          <span>Self-evaluation for this unit</span>
          <div className="rating-stars" role="radiogroup" aria-label="Rate your own performance on this unit, from 1 to 5 stars">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value > 1 ? 's' : ''}`}
                className={`rating-star${rating >= value ? ' is-filled' : ''}`}
                onClick={() => onRate(value)}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="answers-actions">
        <button
          type="button"
          className={`show-answers-btn${justSaved ? ' is-active' : ''}`}
          onClick={handleSave}
        >
          {justSaved ? 'Saved' : 'Save'}
        </button>
        {hasAnswers && (
          <button
            type="button"
            className={`show-answers-btn secondary${showAnswers ? ' is-active' : ''}`}
            onClick={onToggleAnswers}
          >
            {showAnswers ? 'Hide Answers' : 'Show Answers'}
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
