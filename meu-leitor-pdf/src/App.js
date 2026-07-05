import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SpecialZoomLevel, Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';
import exerciseCoords from './exercises_coords.json';
import answersCoords from './answers_coords.json';
import audioAnchorsCoords from './audio_anchors_coords.json';
import american1Index from './american1_index.json';
import american1AudioAnchors from './american1_audio_anchors.json';
import american1ReferenceAudioAnchors from './american1_reference_audio_anchors.json';
import american1TranscriptionsAudioAnchors from './american1_transcriptions_audio_anchors.json';
import american1References from './american1_references.json';
import american1Videos from './american1_videos.json';
import './App.css';

// URL do gabarito único (multipágina), servido por src/setupProxy.js.
const ANSWERS_KEY_URL = '/answers-key.pdf';

const MIN_CENTER_WIDTH = 420;
const MIN_RIGHT_WIDTH = 260;

// Velocidades disponíveis no player de áudio ancorado.
const AUDIO_SPEEDS = [0.75, 1, 1.25, 1.5, 2];

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

// Curso "American English Level 1": american1_index.json é a leitura direta
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

// Cursos listados na página "Courses". headerLabel é o texto exibido no topo
// enquanto o usuário está dentro do curso (unit, exercícios, página de
// teste...).
const courses = {
  vocabulary: {
    title: 'Vocabulary - English Pre Intermediate',
    description: 'Explore pre-intermediate vocabulary practice and lessons.',
    headerLabel: 'You are in the English Vocabulary Pre Intermediate Course',
  },
  american1: {
    title: 'American English Level 1',
    description: 'Read through American English File Book 1, unit by unit, section by section.',
    headerLabel: 'You are in the American English Level 1 Course',
  },
};

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

const IconLanguage = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" />
    <path d="M7 9h10" />
    <path d="M7 12h10" />
    <path d="M7 15h6" />
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

function App() {
  const [pdfFileUrl, setPdfFileUrl] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [selectedAmerican1Unit, setSelectedAmerican1Unit] = useState(null);
  const [selectedAmerican1Section, setSelectedAmerican1Section] = useState(null);
  const [selectedAmerican1Reference, setSelectedAmerican1Reference] = useState(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [activePage, setActivePage] = useState('home');
  const [activeCourseId, setActiveCourseId] = useState(null);
  const [rightWidth, setRightWidth] = useState(650);
  const [exerciseRatings, setExerciseRatings] = useState({});
  const [visitedUnits, setVisitedUnits] = useState({});
  const layoutRef = useRef(null);
  const startDragRef = useRef(null);

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
  };

  const ratingValues = Object.values(exerciseRatings);
  const overallScorePercent = ratingValues.length > 0
    ? Math.round((ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length / 5) * 100)
    : null;

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
    setActiveCourseId(null);
  };

  const handleVocabulary = (event) => {
    event.preventDefault();
    setActivePage('vocabulary');
    setSelectedUnit(null);
    setActiveCourseId('vocabulary');
  };

  const handleAmerican1 = (event) => {
    event.preventDefault();
    setActivePage('american1');
    setSelectedAmerican1Unit(null);
    setSelectedAmerican1Section(null);
    setActiveCourseId('american1');
  };

  const handleAmerican1UnitSelect = (event, unit) => {
    event.preventDefault();
    const sections = american1SectionsByUnit[unit] || [];
    setActivePage('american1-unit');
    setSelectedAmerican1Unit(unit);
    setSelectedAmerican1Section(sections[0]?.section ?? null);
  };

  const handlePreviousAmerican1Unit = () => {
    const index = american1UnitNumbers.indexOf(selectedAmerican1Unit);
    if (index <= 0) return;
    const previousUnit = american1UnitNumbers[index - 1];
    setSelectedAmerican1Unit(previousUnit);
    setSelectedAmerican1Section(american1SectionsByUnit[previousUnit]?.[0]?.section ?? null);
  };

  const handleNextAmerican1Unit = () => {
    const index = american1UnitNumbers.indexOf(selectedAmerican1Unit);
    if (index === -1 || index >= american1UnitNumbers.length - 1) return;
    const nextUnit = american1UnitNumbers[index + 1];
    setSelectedAmerican1Unit(nextUnit);
    setSelectedAmerican1Section(american1SectionsByUnit[nextUnit]?.[0]?.section ?? null);
  };

  const handleOpenAmerican1Reference = (ref) => {
    setSelectedAmerican1Reference(ref);
    setActivePage('american1-reference');
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

  const handleOpenProfile = (event) => {
    event.preventDefault();
    if (!userName) {
      setActivePage('register');
      return;
    }
    setActivePage('profile');
    setSelectedUnit(null);
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
    } catch (error) {
      // Armazenamento indisponível.
    }
    setActivePage('register');
    setSelectedUnit(null);
    setActiveCourseId(null);
  };

  // Remove do localStorage todas as chaves do usuário ativo que começam com
  // um prefixo (ex.: "answers:", "rating:", "notes:") — usado pelos botões
  // de reset do perfil. Escopado por usuário para não apagar o progresso de
  // outra pessoa que também usa este navegador.
  const removeLocalStorageKeysWithPrefix = (prefix) => {
    if (!userName) return;
    try {
      const scopedPrefix = userKey(userName, prefix);
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (key && key.startsWith(scopedPrefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => window.localStorage.removeItem(key));
    } catch (error) {
      // Armazenamento indisponível — nada para limpar.
    }
  };

  // Junta as anotações ("My Notes") de todas as units num único .txt e
  // dispara o download. As notas são salvas como HTML (negrito/marca-texto),
  // então convertemos para texto puro antes de exportar.
  const handleExportNotes = () => {
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
            title: `American English Level 1 - ${AMERICAN1_REFERENCE_LABELS[refType] || refType} p.${refPage}`,
            html,
          });
        } else if (american1Match) {
          entries.push({
            course: 'american1',
            unit: Number(american1Match[1]),
            title: `American English Level 1 - Unit ${american1Match[1]}`,
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

      if (entries.length === 0) {
        window.alert('No lesson notes saved yet.');
        return;
      }

      entries.sort((a, b) => (
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

      const content = entries
        .map(({ title, html }) => {
          const text = htmlToText(html) || '(empty)';
          return `${title}\n${'-'.repeat(title.length)}\n${text}\n`;
        })
        .join('\n');

      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'my-notes.txt';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert('Could not export your notes.');
    }
  };

  const handleResetProgress = () => {
    if (!window.confirm('Reset your unit progress? This cannot be undone.')) {
      return;
    }
    setVisitedUnits({});
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
  };

  const handleResetLessonNotes = () => {
    if (!window.confirm('Reset your "My Notes" for every unit? This cannot be undone.')) {
      return;
    }
    removeLocalStorageKeysWithPrefix('notes:');
  };

  const handleResetExerciseAnswers = () => {
    if (!window.confirm('Reset your written answers for every exercise? This cannot be undone.')) {
      return;
    }
    removeLocalStorageKeysWithPrefix('answers:');
  };

  const handleResetAll = () => {
    if (!window.confirm('Reset EVERYTHING — progress, self-evaluation, lesson notes and exercise answers? This cannot be undone.')) {
      return;
    }
    setVisitedUnits({});
    setExerciseRatings({});
    try {
      window.localStorage.removeItem(userKey(userName, 'visitedUnits'));
    } catch (error) {
      // Armazenamento indisponível.
    }
    removeLocalStorageKeysWithPrefix('rating:');
    removeLocalStorageKeysWithPrefix('notes:');
    removeLocalStorageKeysWithPrefix('answers:');
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
  const insideCourse = Boolean(selectedUnit) || Boolean(selectedAmerican1Unit);
  const activeCourse = activeCourseId ? courses[activeCourseId] : null;
  const visitedUnitsCount = Object.keys(visitedUnits).length;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><IconLanguage /></span>
          <span>Let's Learn English</span>
        </div>
        <nav className="menu" aria-label="Main links">
          {insideCourse ? (
            <ol>
              <li className="menu-item"><a href="#0" onClick={handleCourses}>Courses</a></li>
            </ol>
          ) : (
            <ol>
              <li className="menu-item"><a href="#0" onClick={handleHome}>Home</a></li>
              <li className="menu-item"><a href="#0" onClick={handleCourses}>Courses</a></li>
              <li className="menu-item"><a href="#link-1">Link 1</a></li>
              <li className="menu-item"><a href="#link-2">LINK 2</a></li>
              <li className="menu-item"><a href="#link-3">LINK 3</a></li>
            </ol>
          )}
        </nav>

        {insideCourse && activeCourse && (
          <div className="header-course-info">
            <span>{activeCourse.headerLabel}</span>
          </div>
        )}

        {selectedUnit && (
          <div className="header-stats-card">
            <div className="header-stat-cell" title={`${visitedUnitsCount} of 100 units visited`}>
              <span className="header-stat-label">Your Progress</span>
              <span className="header-stat-value">{visitedUnitsCount}%</span>
            </div>
            <div
              className="header-stat-cell"
              title={
                overallScorePercent !== null
                  ? `Average of ${ratingValues.length} self-rated exercise${ratingValues.length > 1 ? 's' : ''}`
                  : 'No exercise self-rated yet'
              }
            >
              <span className="header-stat-label">Your Score</span>
              <span className="header-stat-value">
                {overallScorePercent !== null ? `${overallScorePercent}%` : '—'}
              </span>
            </div>
          </div>
        )}

        <div className="header-profile-link">
          <a href="#0" onClick={handleOpenProfile}>My Profile</a>
        </div>
      </header>

      {activePage === 'exercises' ? (
        <main className="study-page">
          <div className="study-bar">
            <div className="study-bar-left">
              <button type="button" className="ghost-button" onClick={handleBackToUnit}>
                ‹ Back to Unit
              </button>
              <span className="study-unit-label">
                Unit {selectedUnit}
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

          <div className="study-columns">
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

            <aside className="study-answers">
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
            gridTemplateColumns: `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`,
          }}
        >
          <section className="pdf-panel">
            <div className="pdf-toolbar">
              {pdfFileName ? (
                <div className="pdf-toolbar-nav">
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
            className="resize-handle"
            type="button"
            aria-label="Resize right column"
            onPointerDown={startPanelResize}
          />

          <aside className="side-panel right-panel">
            <div className="panel-content related-panel">
              <UnitNotes key={selectedUnit} unit={selectedUnit} userName={userName} />
            </div>
          </aside>
        </main>
      ) : activePage === 'vocabulary' ? (
        <main className="landing-page vocabulary-mode" id="link-vocabulary">
          <div className="landing-panel vocabulary-page">
            <h2 className="vocabulary-title">Vocabulary - English Pre Intermediate</h2>
            <div className="vocabulary-list" role="list">
              {unitItems.map((unit) => (
                <a key={unit.number} className="vocabulary-link" href={`#unit-${unit.number}`} onClick={(event) => handleUnitSelect(event, unit.number)}>
                  <span>Unit {unit.number}</span>
                  <small>{unit.label}</small>
                </a>
              ))}
            </div>
          </div>
        </main>
      ) : activePage === 'courses' ? (
        <main className="landing-page">
          <div className="landing-panel course-links-panel">
            <div className="course-links">
              <a className="course-link" href="#link-vocabulary" onClick={handleVocabulary}>
                <span>{courses.vocabulary.title}</span>
                <small>{courses.vocabulary.description}</small>
              </a>
              <a className="course-link" href="#link-american1" onClick={handleAmerican1}>
                <span>{courses.american1.title}</span>
                <small>{courses.american1.description}</small>
              </a>
            </div>
          </div>
        </main>
      ) : activePage === 'american1' ? (
        <main className="landing-page vocabulary-mode" id="link-american1">
          <div className="landing-panel vocabulary-page">
            <h2 className="vocabulary-title">American English Level 1</h2>
            <div className="vocabulary-list" role="list">
              {american1UnitNumbers.map((unit) => {
                const sections = american1SectionsByUnit[unit] || [];
                const theme = sections.find((section) => section.section === 'A')?.title || sections[0]?.title || '';
                return (
                  <a
                    key={unit}
                    className="vocabulary-link"
                    href={`#american1-unit-${unit}`}
                    onClick={(event) => handleAmerican1UnitSelect(event, unit)}
                  >
                    <span>Unit {unit}</span>
                    <small>{theme}</small>
                  </a>
                );
              })}
            </div>
          </div>
        </main>
      ) : activePage === 'american1-unit' ? (() => {
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

        return (
          <main
            className="main-panels"
            ref={layoutRef}
            style={{
              gridTemplateColumns: `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`,
            }}
          >
            <section className="pdf-panel">
              <div className="pdf-toolbar pdf-toolbar-left">
                <div className="pdf-toolbar-nav">
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
                      onClick={() => setSelectedAmerican1Section(section.section)}
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
                  <strong>{activeSection.title}</strong>
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
            </section>

            <button
              className="resize-handle"
              type="button"
              aria-label="Resize right column"
              onPointerDown={startPanelResize}
            />

            <aside className="side-panel right-panel">
              <div className="panel-content related-panel">
                <UnitNotes
                  key={selectedAmerican1Unit}
                  unit={selectedAmerican1Unit}
                  userName={userName}
                  storageKeyBase={`notes:american1:${selectedAmerican1Unit}`}
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

        return (
          <main
            className="main-panels"
            ref={layoutRef}
            style={{
              gridTemplateColumns: `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`,
            }}
          >
            <section className="pdf-panel">
              <div className="pdf-toolbar">
                <div className="pdf-toolbar-nav">
                  <button
                    type="button"
                    className="upload-button"
                    onClick={handleCloseAmerican1Reference}
                  >
                    ‹ Back to Unit {ref?.unit} {ref?.section}
                  </button>
                </div>
                <span className="reference-page-label">{label}</span>
              </div>

              {fileUrl ? (
                <American1AudioReader key={fileUrl} fileUrl={fileUrl} anchors={referenceAudioAnchors} />
              ) : (
                <div className="pdf-empty-state">
                  <p className="eyebrow">No reference</p>
                  <h1>Nothing to show</h1>
                </div>
              )}
            </section>

            <button
              className="resize-handle"
              type="button"
              aria-label="Resize right column"
              onPointerDown={startPanelResize}
            />

            <aside className="side-panel right-panel">
              <div className="panel-content related-panel">
                <UnitNotes
                  key={`${ref?.type}-${ref?.pages?.[0]}`}
                  unit={ref?.pages?.[0]}
                  userName={userName}
                  storageKeyBase={`notes:american1-ref:${ref?.type}:${ref?.pages?.[0]}`}
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
            gridTemplateColumns: `minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`,
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
              </div>
              <span className="reference-page-label">Transcriptions</span>
            </div>

            <American1AudioReader
              key="/american1-pages/transcriptions"
              fileUrl="/american1-pages/transcriptions"
              anchors={american1TranscriptionsAudioAnchors}
            />
          </section>

          <button
            className="resize-handle"
            type="button"
            aria-label="Resize right column"
            onPointerDown={startPanelResize}
          />

          <aside className="side-panel right-panel">
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
      ) : activePage === 'profile' ? (
        <main className="landing-page">
          <div className="landing-panel profile-panel">
            <p className="eyebrow">My Profile</p>
            <h1>{userName}</h1>
            <p className="landing-meta">
              Your Score: <strong>{overallScorePercent !== null ? `${overallScorePercent}%` : '—'}</strong>
              {' '}({ratingValues.length} exercise{ratingValues.length === 1 ? '' : 's'} self-rated)
            </p>
            <p className="landing-meta">
              Everything below is stored only in this browser (no account, no server) — these
              buttons erase it for good.
            </p>

            <div className="profile-reset-list">
              <button type="button" className="profile-reset-btn" onClick={handleSwitchUser}>
                <span>Switch user</span>
                <small>Log out of "{userName}" and register or continue as someone else on this browser.</small>
              </button>
              <button type="button" className="profile-reset-btn primary" onClick={handleExportNotes}>
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
        <main className="landing-page">
          <div className="landing-hero">
            <div className="landing-panel">
              <p className="eyebrow">Hello !</p>
              <h1>So tell me… how’s your English these days?</h1>
              <p className="landing-meta">Is it just enough to get by, or are you ready to surprise yourself with how far you can go?</p>
              <p className="landing-note">Because every word you learn opens a new door — to conversations, to opportunities, to the world.</p>
              <p className="landing-note">Your English isn’t just a skill… it’s your passport to something bigger.</p>
              <p className="landing-note">An English Learning by Yourself Project</p>
            </div>
            <button type="button" className="landing-cta" onClick={handleCourses}>
              Start Learning
            </button>
          </div>
        </main>
      )}
    </div>
  );
}

function PdfWorkspace({ fileUrl, onPdfChange, defaultScale, initialPage }) {
  const [activeTool, setActiveTool] = useState('text');

  const highlightPluginInstance = highlightPlugin({
    trigger: Trigger.TextSelection,
  });

  const defaultLayoutPluginInstance = defaultLayoutPlugin({
    sidebarTabs: () => [],
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
            EnterFullScreen,
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
              <EnterFullScreen />
            </div>
          );
        }}
      </Toolbar>
    ),
  });

  return (
    <div className="pdf-viewer-stage">
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
        <Viewer
          fileUrl={fileUrl}
          defaultScale={defaultScale}
          initialPage={initialPage}
          plugins={[defaultLayoutPluginInstance, highlightPluginInstance]}
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

// Player compacto (play/pause, stop, velocidade) ancorado a um ponto (x, y)
// da página do PDF, em pontos, escalado para o tamanho renderizado atual.
function AudioAnchorPlayer({ anchor, scale, unit }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);

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
  };

  const changeRate = (speed) => {
    setRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setMenuOpen(false);
  };

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
      <audio
        ref={audioRef}
        src={`/audio/unit_${unit}/${anchor.audio}`}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button type="button" className="ap-btn" title="Play/Pause" onClick={togglePlay}>
        {isPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <button type="button" className="ap-btn" title="Stop" onClick={stop}>
        <IconStop />
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
    </div>
  );
}

// Curso "American English Level 1": ancora um player compacto sobre cada selo
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
      {!anyPageRevealed && (
        <div className="audio-anchors-loading" role="status" aria-label="Loading audio players">
          <div className="audio-anchors-loading-bar" />
        </div>
      )}
      <PdfWorkspace fileUrl={fileUrl} defaultScale={1.5} />
      {Object.entries(pageHosts).map(([pageIndex, host]) => createPortal(
        <div key={pageIndex} className={`audio-anchor-layer${revealedPages[pageIndex] ? ' is-visible' : ''}`}>
          {(anchorsByPage[pageIndex] || []).map((anchor) => (
            <American1AudioAnchorPlayer
              key={`${anchor.cd}-${anchor.track}`}
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

// Mesmo player do curso Vocabulary (play/pause, stop, menu de velocidade —
// ver AudioAnchorPlayer), só que centralizado exatamente em cima do selo
// impresso (não ancorado numa margem) e um pouco menor/translúcido (ver
// .american1-audio-anchor no CSS), já que aqui ele fica sobre texto corrido.
function American1AudioAnchorPlayer({ anchor, scale }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const [menuOpen, setMenuOpen] = useState(false);

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
  };

  const changeRate = (speed) => {
    setRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
    setMenuOpen(false);
  };

  return (
    <div
      className="american1-audio-anchor"
      style={{
        left: `${anchor.x * scale}px`,
        top: `${anchor.y * scale}px`,
      }}
    >
      <audio
        ref={audioRef}
        src={anchor.audio}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button type="button" className="ap-btn" title="Play/Pause" onClick={togglePlay}>
        {isPlaying ? <IconPause /> : <IconPlay />}
      </button>
      <button type="button" className="ap-btn" title="Stop" onClick={stop}>
        <IconStop />
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
        <h2>Exercise {exerciseId}</h2>
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

function UnitNotes({ unit, userName, storageKeyBase }) {
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
        data-placeholder="Write anything you want to remember about this unit..."
      />

      <div className="answers-actions">
        <button
          type="button"
          className={`show-answers-btn${justSaved ? ' is-active' : ''}`}
          onClick={handleSave}
        >
          {justSaved ? 'Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default App;
