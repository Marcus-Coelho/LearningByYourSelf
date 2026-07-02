import { useEffect, useRef, useState } from 'react';
import { SpecialZoomLevel, Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';
import exerciseCoords from './exercises_coords.json';
import answersCoords from './answers_coords.json';
import './App.css';

// URL do gabarito único (multipágina), servido por src/setupProxy.js.
const ANSWERS_KEY_URL = '/answers-key.pdf';

const MIN_LEFT_WIDTH = 240;
const MIN_CENTER_WIDTH = 420;
const MIN_RIGHT_WIDTH = 260;

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

const formatAudioTitle = (src, unitNumber) => {
  const fileName = src.split('/').pop() || '';
  const stem = fileName.replace(/\.(mp3|m4a|wav|ogg)$/i, '');
  const letter = stem.split('.').pop()?.toUpperCase() || '';
  return `Unit ${unitNumber} - ${letter || 'Audio'}`;
};

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

function App() {
  const [pdfFileUrl, setPdfFileUrl] = useState('');
  const [pdfFileName, setPdfFileName] = useState('');
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [activePage, setActivePage] = useState('home');
  const [unitAudios, setUnitAudios] = useState([]);
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(300);
  const layoutRef = useRef(null);
  const startDragRef = useRef(null);

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

  useEffect(() => {
    if (activePage !== 'unit' || !selectedUnit) {
      setUnitAudios([]);
      return;
    }

    const loadAudioList = async () => {
      const basePath = `/audio/unit_${selectedUnit}`;
      const manifestUrl = `${basePath}/manifest.json`;
      try {
        const res = await fetch(manifestUrl);
        if (res.ok) {
          const list = await res.json();
          setUnitAudios(list.map((fileName) => `${basePath}/${fileName}`));
          return;
        }
      } catch (error) {
        // Ignore and fall back to the default probing pattern.
      }

      const padded = String(selectedUnit).padStart(3, '0');
      const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
      const found = [];
      for (const letter of letters) {
        const candidate = `${basePath}/U_${padded}.${letter}.mp3`;
        try {
          const response = await fetch(candidate, { method: 'HEAD' });
          if (response.ok) {
            found.push(candidate);
          }
        } catch (error) {
          // Ignore missing files.
        }
      }
      setUnitAudios(found);
    };

    loadAudioList();
  }, [selectedUnit, activePage]);

  function AudioPlayer({ src, title }) {
    return (
      <div className="audio-player simple">
        <div className="audio-title">{title || src.split('/').pop()}</div>
        <audio controls src={src} preload="metadata">
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }

  const handleHome = (event) => {
    event.preventDefault();
    setActivePage('home');
    setSelectedUnit(null);
  };

  const handleCourses = (event) => {
    event.preventDefault();
    setActivePage('courses');
    setSelectedUnit(null);
  };

  const handleVocabulary = (event) => {
    event.preventDefault();
    setActivePage('vocabulary');
    setSelectedUnit(null);
  };

  const clampPanelWidths = (nextLeftWidth, nextRightWidth) => {
    const layoutWidth = layoutRef.current?.getBoundingClientRect().width || 0;
    const availableWidth = layoutWidth - 28;
    const maxLeftWidth = Math.max(MIN_LEFT_WIDTH, availableWidth - nextRightWidth - MIN_CENTER_WIDTH);
    const left = Math.min(Math.max(nextLeftWidth, MIN_LEFT_WIDTH), maxLeftWidth);
    const maxRightWidth = Math.max(MIN_RIGHT_WIDTH, availableWidth - left - MIN_CENTER_WIDTH);
    const right = Math.min(Math.max(nextRightWidth, MIN_RIGHT_WIDTH), maxRightWidth);
    return { left, right };
  };

  const startPanelResize = (panel, event) => {
    event.preventDefault();
    startDragRef.current = { panel, startX: event.clientX, leftWidth, rightWidth };
    window.addEventListener('pointermove', resizePanel);
    window.addEventListener('pointerup', stopPanelResize);
  };

  const resizePanel = (event) => {
    const drag = startDragRef.current;
    if (!drag) {
      return;
    }

    const deltaX = event.clientX - drag.startX;
    const nextWidths = drag.panel === 'left'
      ? clampPanelWidths(drag.leftWidth + deltaX, drag.rightWidth)
      : clampPanelWidths(drag.leftWidth, drag.rightWidth - deltaX);
    setLeftWidth(nextWidths.left);
    setRightWidth(nextWidths.right);
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><IconLanguage /></span>
          <span>Let's Learn English</span>
        </div>
        <nav className="menu" aria-label="Main links">
          {selectedUnit ? (
            <ol>
              <li className="menu-item"><a href="#0" onClick={handleHome}>Home</a></li>
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
                {unitTable[selectedUnit] ? <small>{unitTable[selectedUnit]}</small> : null}
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
            gridTemplateColumns: `${leftWidth}px 14px minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`,
          }}
        >
          <aside className="side-panel left-panel">
            <div className="panel-content info-panel">
              <p className="eyebrow">Unit {selectedUnit}</p>
              {unitAudios.length === 0 ? (
                <p className="muted">No audio found for this unit.</p>
              ) : (
                <div className="audio-list">
                  {unitAudios.map((audioPath) => (
                    <AudioPlayer key={audioPath} src={audioPath} title={formatAudioTitle(audioPath, selectedUnit)} />
                  ))}
                </div>
              )}
            </div>
          </aside>

          <button
            className="resize-handle"
            type="button"
            aria-label="Resize left column"
            onPointerDown={(event) => startPanelResize('left', event)}
          />

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
              <PdfWorkspace fileUrl={pdfFileUrl} onPdfChange={handlePdfChange} />
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
            onPointerDown={(event) => startPanelResize('right', event)}
          />

          <aside className="side-panel right-panel">
            <div className="panel-content related-panel">
              <p className="eyebrow">Related</p>
              <p>Line 1: Related documents</p>
              <p>Line 2: Reading suggestion</p>
              <p>Line 3: Other files</p>
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
                <span>Vocabulary - English Pre Intermediate</span>
                <small>Explore pre-intermediate vocabulary practice and lessons.</small>
              </a>
              <a className="course-link" href="#link-course-2">
                <span>Course 2</span>
                <small>Continue with the next course and improve your fluency.</small>
              </a>
            </div>
          </div>
        </main>
      ) : (
        <main className="landing-page">
          <div className="landing-panel">
            <p className="eyebrow">Hello !</p>
            <h1>So tell me… how’s your English these days?</h1>
            <p className="landing-meta">Is it just enough to get by, or are you ready to surprise yourself with how far you can go?</p>
            <p className="landing-note">Because every word you learn opens a new door — to conversations, to opportunities, to the world.</p>
            <p className="landing-note">Your English isn’t just a skill… it’s your passport to something bigger.</p>
            <p className="landing-note">An English Learning by Yourself Project</p>
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
            Download,
            Print,
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
              <Download />
              <Print />
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
}) {
  const storageKey = `answers:${exerciseId}`;
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
        {isLastExercise && canGoNextUnit && (
          <button type="button" className="show-answers-btn secondary" onClick={onNextReadingUnit}>
            Next Unit
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
