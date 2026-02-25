import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { FileText } from 'lucide-react';
import Home from './pages/Home';
import NewQuote from './pages/NewQuote';
import History from './pages/History';

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 bg-kenya-600 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-kenya-600 leading-none">KENYA</h1>
                <p className="text-[10px] text-gray-400 leading-none mt-0.5">Cotización Inteligente</p>
              </div>
            </a>
            
            <div className="flex items-center gap-4">
              <a href="/" className="text-sm text-gray-600 hover:text-kenya-600 transition-colors">
                Inicio
              </a>
              <a href="/new" className="btn-primary text-sm py-1.5 px-4">
                + Nueva
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-gray-400">
          <p>Kenya - Distribuidora de Tecnología | Sistema de Cotización Inteligente</p>
          <p className="mt-1">Powered by IA Vision + PeruCompras</p>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<NewQuote />} />
          <Route path="/quote/:id" element={<History />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
