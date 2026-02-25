import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import QuotePreview from '../components/QuotePreview';
import { getQuote } from '../services/api';

export default function History() {
  const { id } = useParams();
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    const fetchQuote = async () => {
      setLoading(true);
      try {
        const data = await getQuote(id);
        setQuote(data);
      } catch (err) {
        setError(err.message || 'Error al cargar la cotización');
      } finally {
        setLoading(false);
      }
    };
    fetchQuote();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-kenya-500 mx-auto mb-3" />
          <p className="text-gray-500">Cargando cotización...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <Link to="/" className="btn-ghost flex items-center gap-1 mb-6 -ml-2">
          <ArrowLeft className="w-4 h-4" /> Volver al inicio
        </Link>
        <div className="card text-center py-8">
          <p className="text-red-500 font-medium">{error}</p>
          <Link to="/" className="btn-primary inline-block mt-4">Volver al inicio</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/" className="btn-ghost flex items-center gap-1 -ml-2">
        <ArrowLeft className="w-4 h-4" /> Volver al inicio
      </Link>

      {quote && <QuotePreview quote={quote} />}
    </div>
  );
}
