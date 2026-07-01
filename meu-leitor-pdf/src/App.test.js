import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('@react-pdf-viewer/core', () => ({
  Viewer: ({ fileUrl }) => <div>PDF: {fileUrl}</div>,
  Worker: ({ children }) => <div>{children}</div>,
}));

jest.mock('@react-pdf-viewer/default-layout', () => ({
  defaultLayoutPlugin: () => ({}),
}));

jest.mock('react-resizable-panels', () => ({
  Group: ({ children }) => <div>{children}</div>,
  Panel: ({ children }) => <div>{children}</div>,
  Separator: () => <div />,
}));

test('renders the PDF reader layout', () => {
  render(<App />);

  expect(screen.getByText(/cabecalho da pagina/i)).toBeInTheDocument();
  expect(screen.getByText(/link 1/i)).toBeInTheDocument();
  expect(screen.getByText(/link 2/i)).toBeInTheDocument();
  expect(screen.getByText(/link 3/i)).toBeInTheDocument();
  expect(screen.getByText(/conteudo esquerdo/i)).toBeInTheDocument();
  expect(screen.getByText(/documentos relacionados/i)).toBeInTheDocument();
  expect(screen.getByText(/carregue seu pdf/i)).toBeInTheDocument();
  expect(screen.getAllByText(/carregar pdf/i)).toHaveLength(2);
});
