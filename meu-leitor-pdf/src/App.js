import { useEffect, useRef, useState } from 'react';
import { Viewer, Worker } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import { highlightPlugin, Trigger } from '@react-pdf-viewer/highlight';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import '@react-pdf-viewer/highlight/lib/styles/index.css';
import './App.css';

const MIN_LEFT_WIDTH = 240;
const MIN_CENTER_WIDTH = 420;
const MIN_RIGHT_WIDTH = 260;

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

const renderPdfUpload = (onChange, label = 'Carregar PDF') => (
  <label className="upload-button">
    {label}
    <input
      type="file"
      accept="application/pdf,.pdf"
      onChange={onChange}
    />
  </label>
);

// Ícone de aprendizado de línguas
const IconLanguage = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" />
    <path d="M7 9h10" />
    <path d="M7 12h10" />
    <path d="M7 15h6" />
  </svg>
);

// Ícone de selecao de texto
const IconText = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16" />
    <path d="M8 11h8" />
    <path d="M8 15h8" />
    <path d="M8 19h8" />
  </svg>
);

// Ícone de mão
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
  const [activePage, setActivePage] = useState('home');
  const [leftWidth, setLeftWidth] = useState(300);
  const [rightWidth, setRightWidth] = useState(300);
  const layoutRef = useRef(null);
  const startDragRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pdfFileUrl) URL.revokeObjectURL(pdfFileUrl);
    };
  }, [pdfFileUrl]);

  const handlePdfChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPdfFileUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
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
    if (!drag) return;
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark"><IconLanguage /></span>
          <span>Let's Learning English</span>
        </div>
        <nav className="menu" aria-label="Links principais">
          {selectedUnit ? (
            <ol>
              <li className="menu-item"><a href="#0" onClick={handleHome}>Home</a></li>
            </ol>
          ) : (
            <ol>
              <li className="menu-item"><a href="#0" onClick={handleHome}>Home</a></li>
              <li className="menu-item"><a href="#0" onClick={handleCourses}>Courses</a></li>
              <li className="menu-item has-submenu">
                <a href="#0" onClick={handleVocabulary}>
                  Link 1
                  <span className="dropdown-arrow" aria-hidden="true">▾</span>
                </a>
                <ol className="sub-menu">
                  {Array.from({ length: 10 }, (_, groupIndex) => {
                    const start = groupIndex * 10 + 1;
                    const end = (groupIndex + 1) * 10;
                    return (
                      <li key={groupIndex} className="menu-column">
                        <div className="column-title">Unit {start}-{end}</div>
                        {Array.from({ length: 10 }, (_, index) => {
                          const unit = start + index;
                          return (
                            <a key={unit} href={`#unit-${unit}`} onClick={(event) => handleUnitSelect(event, unit)}>
                              Unit {unit}
                            </a>
                          );
                        })}
                      </li>
                    );
                  })}
                </ol>
              </li>
              <li className="menu-item"><a href="#link-2">LINK 2</a></li>
              <li className="menu-item"><a href="#link-3">LINK 3</a></li>
            </ol>
          )}
        </nav>
      </header>

      {activePage === 'unit' ? (
        <main
          className="main-panels"
          ref={layoutRef}
          style={{
            gridTemplateColumns: `${leftWidth}px 14px minmax(${MIN_CENTER_WIDTH}px, 1fr) 14px ${rightWidth}px`,
          }}
        >
          <aside className="side-panel left-panel">
          <div className="panel-content info-panel">
            <p className="eyebrow">Livro aberto</p>
            <h2>Conteudo Esquerdo</h2>
            <p>Info do livro, notas, capitulos e detalhes importantes ficam aqui.</p>
            {pdfFileName && <span className="file-pill">{pdfFileName}</span>}
          </div>
        </aside>

        <button
          className="resize-handle"
          type="button"
          aria-label="Redimensionar coluna esquerda"
          onPointerDown={(event) => startPanelResize('left', event)}
        />

        <section className="pdf-panel">
          <div className="pdf-toolbar">
            <span>{pdfFileName || 'Nenhum PDF carregado'}</span>
            {renderPdfUpload(handlePdfChange, pdfFileName ? 'Trocar PDF' : 'Carregar PDF')}
          </div>

          {pdfFileUrl ? (
            <PdfWorkspace fileUrl={pdfFileUrl} onPdfChange={handlePdfChange} />
          ) : (
            <div className="pdf-empty-state">
              <p className="eyebrow">Leitor pronto</p>
              <h1>Carregue seu PDF</h1>
              <p>Selecione um arquivo do computador para abrir no painel central.</p>
              {renderPdfUpload(handlePdfChange)}
            </div>
          )}
        </section>

        <button
          className="resize-handle"
          type="button"
          aria-label="Redimensionar coluna direita"
          onPointerDown={(event) => startPanelResize('right', event)}
        />

        <aside className="side-panel right-panel">
          <div className="panel-content related-panel">
            <p className="eyebrow">Relacionados</p>
            <p>Linha 1: Documentos Relacionados</p>
            <p>Linha 2: Sugestao de leitura</p>
            <p>Linha 3: Outros arquivos</p>
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
            <p className="landing-note">a English Learning by Yourself Project</p>
          </div>
        </main>
      )}
    </div>
  );
}

function PdfWorkspace({ fileUrl, onPdfChange }) {
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

          const sep = (
            <div style={{ width: '1px', height: '24px', background: '#ddd', margin: '0 4px' }} />
          );

          const toolBtn = (mode, icon, label) => (
            <SwitchSelectionMode mode={mode}>
              {(props) => (
                <button
                  title={label}
                  onClick={() => { props.onClick(); setActiveTool(mode.toLowerCase()); }}
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
              {sep}
              <ZoomOut />
              <Zoom />
              <ZoomIn />
              {sep}
              {toolBtn('Text', <IconText />, 'Selecionar texto')}
              {toolBtn('Hand', <IconHand />, 'Ferramenta mão')}
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
          plugins={[defaultLayoutPluginInstance, highlightPluginInstance]}
          renderError={(error) => (
            <div className="pdf-empty-state pdf-error-state">
              <p className="eyebrow">PDF invalido</p>
              <h2>{error.message || 'Invalid PDF structure.'}</h2>
              <p>Escolha outro arquivo PDF para continuar a leitura.</p>
              {renderPdfUpload(onPdfChange, 'Carregar outro PDF')}
            </div>
          )}
        />
      </Worker>
    </div>
  );
}

export default App;