import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Wand2, Search, FileCheck, Check, Loader2, RefreshCw } from 'lucide-react';
import UploadZone from '../components/UploadZone';
import RequirementCard from '../components/RequirementCard';
import ProductCard from '../components/ProductCard';
import QuoteBuilder from '../components/QuoteBuilder';
import QuotePreview from '../components/QuotePreview';
import { extractFromImage, searchProducts, updateRequirement, createQuote, refreshCatalog } from '../services/api';

const STEPS = [
  { id: 1, label: 'Subir Imagen', icon: '📎' },
  { id: 2, label: 'Revisar Extracción', icon: '🔍' },
  { id: 3, label: 'Seleccionar Productos', icon: '🛒' },
  { id: 4, label: 'Generar Cotización', icon: '📄' },
];

export default function NewQuote() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1
  const [file, setFile] = useState(null);

  // Step 2
  const [requirementId, setRequirementId] = useState(null);
  const [equipos, setEquipos] = useState([]);
  const [notasAdicionales, setNotasAdicionales] = useState('');

  // Step 3
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [activeTab, setActiveTab] = useState({});
  const [refreshingBrand, setRefreshingBrand] = useState(null);

  // Step 4
  const [generatedQuote, setGeneratedQuote] = useState(null);

  // ============================================
  // STEP 1: Extract
  // ============================================
  const handleExtract = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      const data = await extractFromImage(file);
      setRequirementId(data.requirement_id);
      setEquipos(data.equipos || []);
      setNotasAdicionales(data.notas_adicionales || '');
      setStep(2);
    } catch (err) {
      setError(err.message || 'Error al extraer especificaciones. Verifica tu API key.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // STEP 2: Update & Search
  // ============================================
  const handleUpdateEquipo = (index, updatedEquipo) => {
    setEquipos((prev) => {
      const updated = [...prev];
      updated[index] = updatedEquipo;
      return updated;
    });
  };

  const handleSearch = async () => {
    setLoading(true);
    setError(null);

    try {
      // Guardar las modificaciones del usuario
      if (requirementId) {
        await updateRequirement(requirementId, { equipos, notas_adicionales: notasAdicionales });
      }

      const data = await searchProducts(requirementId, equipos);
      setSearchResults(data.resultados || []);
      
      // Inicializar tabs activos
      const tabs = {};
      data.resultados.forEach((_, i) => { tabs[i] = 'kenya'; });
      setActiveTab(tabs);
      
      setStep(3);
    } catch (err) {
      setError(err.message || 'Error al buscar productos en PeruCompras.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // STEP 3: Select products
  // ============================================
  const handleSelectProduct = (product) => {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => (p.ficha_id || p.id) === (product.ficha_id || product.id));
      if (exists) {
        return prev.filter((p) => (p.ficha_id || p.id) !== (product.ficha_id || product.id));
      }
      return [...prev, product];
    });
  };

  const isProductSelected = (product) => {
    return selectedProducts.some((p) => (p.ficha_id || p.id) === (product.ficha_id || product.id));
  };

  const handleRefreshBrand = async (marca, tipo) => {
    setRefreshingBrand(marca);
    try {
      await refreshCatalog(marca, tipo);
      // Re-search
      const data = await searchProducts(requirementId, equipos);
      setSearchResults(data.resultados || []);
    } catch (err) {
      setError(`Error actualizando catálogo de ${marca}: ${err.message}`);
    } finally {
      setRefreshingBrand(null);
    }
  };

  // ============================================
  // STEP 4: Generate quote
  // ============================================
  const handleGenerateQuote = async ({ cliente, ruc, items, notas }) => {
    setLoading(true);
    setError(null);

    try {
      const data = await createQuote({
        cliente,
        ruc,
        requirementId,
        items,
        notas,
      });
      setGeneratedQuote(data.quote);
      setStep(5); // Preview state
    } catch (err) {
      setError(err.message || 'Error al generar la cotización.');
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================
  const getProductsForTab = (resultIndex, marca) => {
    const result = searchResults[resultIndex];
    if (!result) return [];
    return result[`productos_${marca}`] || [];
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => step === 1 || step === 5 ? navigate('/') : setStep(step - 1)}
        className="btn-ghost flex items-center gap-1 -ml-2"
      >
        <ArrowLeft className="w-4 h-4" />
        {step === 1 || step === 5 ? 'Volver al inicio' : 'Paso anterior'}
      </button>

      {/* Stepper */}
      {step <= 4 && (
        <div className="flex items-center justify-between bg-white rounded-xl p-4 border border-gray-200">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className="flex items-center gap-2">
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                  ${step === s.id ? 'stepper-active' : step > s.id ? 'stepper-completed' : 'stepper-inactive'}
                `}>
                  {step > s.id ? <Check className="w-4 h-4" /> : s.id}
                </div>
                <span className={`text-sm hidden sm:inline ${step === s.id ? 'font-medium text-gray-800' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 sm:w-16 h-0.5 mx-2 ${step > s.id ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 animate-fade-in">
          <p className="font-medium">Error</p>
          <p className="text-sm mt-1">{error}</p>
          <button onClick={() => setError(null)} className="text-sm underline mt-2">Cerrar</button>
        </div>
      )}

      {/* ============================================ */}
      {/* STEP 1: Upload Image */}
      {/* ============================================ */}
      {step === 1 && (
        <div className="card space-y-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Paso 1: Subir Imagen</h2>
            <p className="text-gray-500 text-sm mt-1">
              Sube una imagen del requerimiento (correo, captura, documento) y la IA extraerá las especificaciones automáticamente.
            </p>
          </div>

          <UploadZone onFileSelect={setFile} disabled={loading} />

          <div className="flex justify-between">
            <button onClick={() => navigate('/')} className="btn-secondary">
              Cancelar
            </button>
            <button
              onClick={handleExtract}
              disabled={!file || loading}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extrayendo...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Extraer con IA
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* STEP 2: Review Extraction */}
      {/* ============================================ */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-800">Paso 2: Revisión de Extracción</h2>
            <p className="text-gray-500 text-sm mt-1">
              Revisa y corrige las especificaciones extraídas por la IA antes de buscar productos.
            </p>
            {notasAdicionales && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                <strong>Notas de la IA:</strong> {notasAdicionales}
              </div>
            )}
          </div>

          {equipos.length === 0 ? (
            <div className="card text-center py-8 text-gray-400">
              <p className="font-medium">No se encontraron requerimientos de equipos en la imagen.</p>
              <p className="text-sm mt-1">Intenta con otra imagen más clara.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {equipos.map((equipo, index) => (
                <RequirementCard
                  key={index}
                  equipo={equipo}
                  index={index}
                  onUpdate={handleUpdateEquipo}
                  editable={true}
                />
              ))}
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-secondary">
              <ArrowLeft className="w-4 h-4 mr-1 inline" /> Volver
            </button>
            <button
              onClick={handleSearch}
              disabled={equipos.length === 0 || loading}
              className="btn-primary flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Buscando en PeruCompras...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Buscar Productos
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* STEP 3: Select Products */}
      {/* ============================================ */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-800">Paso 3: Selección de Productos</h2>
            <p className="text-gray-500 text-sm mt-1">
              Selecciona los productos más compatibles con el requerimiento. Prioridad: Kenya → Lenovo → HP
            </p>
            {selectedProducts.length > 0 && (
              <p className="text-sm text-kenya-600 font-medium mt-2">
                {selectedProducts.length} producto{selectedProducts.length > 1 ? 's' : ''} seleccionado{selectedProducts.length > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {searchResults.map((result, rIndex) => (
            <div key={rIndex} className="card">
              <h3 className="font-semibold text-gray-800 mb-4">
                Equipo #{rIndex + 1}: <span className="capitalize">{result.equipo?.tipo_equipo || 'laptop'}</span>
              </h3>

              {/* Brand tabs */}
              <div className="flex gap-1 mb-4 border-b border-gray-200">
                {['kenya', 'lenovo', 'hp'].map((marca) => {
                  const products = getProductsForTab(rIndex, marca);
                  const isActive = activeTab[rIndex] === marca;
                  return (
                    <button
                      key={marca}
                      onClick={() => setActiveTab((prev) => ({ ...prev, [rIndex]: marca }))}
                      className={`
                        px-4 py-2 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors
                        flex items-center gap-2
                        ${isActive
                          ? marca === 'kenya' ? 'border-red-500 text-red-600 bg-red-50'
                          : marca === 'lenovo' ? 'border-blue-500 text-blue-600 bg-blue-50'
                          : 'border-cyan-500 text-cyan-600 bg-cyan-50'
                          : 'border-transparent text-gray-400 hover:text-gray-600'
                        }
                      `}
                    >
                      <span className="uppercase">{marca}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white' : 'bg-gray-100'}`}>
                        {products.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Refresh button */}
              <div className="flex justify-end mb-3">
                <button
                  onClick={() => handleRefreshBrand(activeTab[rIndex], result.equipo?.tipo_equipo)}
                  disabled={refreshingBrand !== null}
                  className="btn-ghost text-xs flex items-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshingBrand === activeTab[rIndex] ? 'animate-spin' : ''}`} />
                  Actualizar catálogo
                </button>
              </div>

              {/* Products grid */}
              {(() => {
                const products = getProductsForTab(rIndex, activeTab[rIndex]);
                if (products.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-400">
                      <p className="font-medium">
                        No se encontraron fichas de {(activeTab[rIndex] || '').toUpperCase()} en PeruCompras
                      </p>
                      <p className="text-sm mt-1">Prueba actualizando el catálogo o selecciona otra marca</p>
                    </div>
                  );
                }
                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.map((product, pIndex) => (
                      <ProductCard
                        key={product.ficha_id || product.id || pIndex}
                        product={product}
                        requerimiento={result.equipo}
                        onSelect={handleSelectProduct}
                        selected={isProductSelected(product)}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
          ))}

          {searchResults.length === 0 && (
            <div className="card text-center py-8 text-gray-400">
              <p className="font-medium">No se encontraron resultados en PeruCompras</p>
              <p className="text-sm mt-1">Intenta con otros términos de búsqueda o actualiza el catálogo</p>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="btn-secondary">
              <ArrowLeft className="w-4 h-4 mr-1 inline" /> Volver
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={selectedProducts.length === 0}
              className="btn-primary flex items-center gap-2"
            >
              <FileCheck className="w-4 h-4" />
              Configurar Cotización ({selectedProducts.length})
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* STEP 4: Generate Quote */}
      {/* ============================================ */}
      {step === 4 && (
        <div className="space-y-6">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-800">Paso 4: Generar Cotización</h2>
            <p className="text-gray-500 text-sm mt-1">
              Completa los datos del cliente, ajusta cantidades y precios, y genera la cotización final.
            </p>
          </div>

          <QuoteBuilder
            selectedProducts={selectedProducts}
            onSubmit={handleGenerateQuote}
            loading={loading}
          />
        </div>
      )}

      {/* ============================================ */}
      {/* STEP 5: Preview */}
      {/* ============================================ */}
      {step === 5 && generatedQuote && (
        <div className="space-y-6">
          <QuotePreview quote={generatedQuote} />
          
          <div className="flex justify-center gap-3">
            <button onClick={() => navigate('/')} className="btn-secondary">
              Ir al Historial
            </button>
            <button
              onClick={() => {
                setStep(1);
                setFile(null);
                setEquipos([]);
                setSearchResults([]);
                setSelectedProducts([]);
                setGeneratedQuote(null);
              }}
              className="btn-primary"
            >
              Nueva Cotización
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
