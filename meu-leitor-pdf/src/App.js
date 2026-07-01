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
          <ol>
            <li className="menu-item"><a href="#0">Home</a></li>
            <li className="menu-item"><a href="#0">About</a></li>
            <li className="menu-item has-submenu">
              <a href="#0">
                Vocabulary
                <span className="dropdown-arrow" aria-hidden="true">▾</span>
              </a>
              <ol className="sub-menu">
                {Array.from({ length: 10 }, (_, groupIndex) => {
                  const start = groupIndex * 10 + 1;
                  const end = (groupIndex + 1) * 10;
                  return (
                    <li key={groupIndex} className="menu-item has-submenu">
                      <a href={`#unit-${start}`}>Unit {start}-{end}</a>
                      <ol className="sub-menu">
                        {Array.from({ length: 10 }, (_, index) => {
                          const unit = start + index;
                          return (
                            <li key={unit} className="menu-item">
                              <a href={`#unit-${unit}`}>Unit {unit}</a>
                            </li>
                          );
                        })}
                      </ol>
                    </li>
                  );
                })}
              </ol>
            </li>
            <li className="menu-item"><a href="#link-2">LINK 2</a></li>
            <li className="menu-item"><a href="#link-3">LINK 3</a></li>
          </ol>
        </nav>
      </header>

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