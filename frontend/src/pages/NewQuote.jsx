import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Wand2, Search, FileCheck, Check, CheckCircle, Loader2, RefreshCw, ShoppingCart, ChevronUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import UploadZone from '../components/UploadZone';
import RequirementCard from '../components/RequirementCard';
import ProductCard from '../components/ProductCard';
import QuoteBuilder from '../components/QuoteBuilder';
import QuotePreview from '../components/QuotePreview';
import QuoteRequestForm from '../components/QuoteRequestForm';
import LoadingOverlay from '../components/LoadingOverlay';
import { useToast } from '../components/Toast';
import { extractFromImage, searchProducts, updateRequirement, createQuote, refreshCatalog } from '../services/api';

const STEPS = [
  { id: 1, label: 'Subir Imagen', icon: '📎', description: 'Carga tu requerimiento' },
  { id: 2, label: 'Revisar Extracción', icon: '🔍', description: 'Verifica las especificaciones' },
  { id: 3, label: 'Seleccionar Productos', icon: '🛒', description: 'Elige los productos compatibles' },
  { id: 4, label: 'Generar Cotización', icon: '📄', description: 'Completa y genera el documento' },
];

export default function NewQuote() {
  const navigate = useNavigate();
  const { isAdmin, isTrial } = useAuth();
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState(null);
  const [error, setError] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

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

  // Scroll to top detection
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges && step > 1 && step < 5) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, step]);

  // Scroll to top on step change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [step]);

  // Track unsaved changes
  useEffect(() => {
    if (step > 1) setHasUnsavedChanges(true);
  }, [step]);

  // ============================================
  // STEP 1: Extract
  // ============================================
  const handleExtract = async () => {
    if (!file) return;
    setLoading(true);
    setLoadingType('extract');
    setError(null);

    try {
      const data = await extractFromImage(file);
      setRequirementId(data.requirement_id);
      setEquipos(data.equipos || []);
      setNotasAdicionales(data.notas_adicionales || '');
      setStep(2);

      const count = (data.equipos || []).length;
      toast.success(
        `Se ${count === 1 ? 'identificó' : 'identificaron'} ${count} equipo${count !== 1 ? 's' : ''} en tu imagen`,
        { title: '¡Extracción completada!' }
      );
    } catch (err) {
      setError(err.message || 'Error al extraer especificaciones. Verifica tu API key.');
      toast.error('No pudimos procesar la imagen. Intenta con otra.', { title: 'Error de extracción' });
    } finally {
      setLoading(false);
      setLoadingType(null);
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

  const handleRemoveEquipo = (index) => {
    setEquipos((prev) => prev.filter((_, i) => i !== index));
    toast.info('Equipo eliminado de la lista');
  };

  const handleSearch = async () => {
    setLoading(true);
    setLoadingType('search');
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

      const totalProducts = (data.resultados || []).reduce((sum, r) => {
        return sum + (r.productos_kenya?.length || 0) + (r.productos_lenovo?.length || 0) + (r.productos_hp?.length || 0);
      }, 0);
      toast.success(
        `Se encontraron ${totalProducts} productos compatibles con tu requerimiento`,
        { title: '¡Búsqueda completada!' }
      );
    } catch (err) {
      setError(err.message || 'Error al buscar productos en PeruCompras.');
      toast.error('Error al conectar con el catálogo. Intenta de nuevo.', { title: 'Error de búsqueda' });
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  // ============================================
  // STEP 3: Select products
  // ============================================
  const getProductId = (product) => {
    return product.ficha_id || product.id || product.numeroParte || product.numero_parte || product.part_number || product.nombre;
  };

  const handleSelectProduct = (product) => {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => getProductId(p) === getProductId(product));
      if (exists) {
        toast.info(`${product.nombre || 'Producto'} removido de la selección`);
        return prev.filter((p) => getProductId(p) !== getProductId(product));
      }
      toast.success(`${product.nombre || 'Producto'} agregado a la cotización`);
      return [...prev, product];
    });
  };

  const isProductSelected = (product) => {
    return selectedProducts.some((p) => getProductId(p) === getProductId(product));
  };

  const handleRefreshBrand = async (marca, tipo) => {
    setRefreshingBrand(marca);
    toast.info(`Actualizando catálogo de ${marca.toUpperCase()}...`);
    try {
      await refreshCatalog(marca, tipo);
      // Re-search
      const data = await searchProducts(requirementId, equipos);
      setSearchResults(data.resultados || []);
      toast.success(`Catálogo de ${marca.toUpperCase()} actualizado correctamente`);
    } catch (err) {
      setError(`Error actualizando catálogo de ${marca}: ${err.message}`);
      toast.error(`No se pudo actualizar el catálogo de ${marca.toUpperCase()}`);
    } finally {
      setRefreshingBrand(null);
    }
  };

  // ============================================
  // STEP 4: Generate quote
  // ============================================
  const handleGenerateQuote = async ({ cliente, ruc, items, notas }) => {
    setLoading(true);
    setLoadingType('generate');
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
      setHasUnsavedChanges(false);
      toast.success(
        `Cotización ${data.quote?.numero_cotizacion || ''} lista para descargar`,
        { title: '¡Cotización generada!', duration: 6000 }
      );
    } catch (err) {
      setError(err.message || 'Error al generar la cotización.');
      toast.error('Error al generar la cotización. Verifica los datos e intenta de nuevo.');
    } finally {
      setLoading(false);
      setLoadingType(null);
    }
  };

  // ============================================
  // HELPERS
  // ============================================
  const getProductsForTab = (resultIndex, marca) => {
    const result = searchResults[resultIndex];
    if (!result) return [];
    return result[`productos_${marca}`] || [];
  };

  const handleBack = () => {
    if (step === 1 || step === 5) {
      if (hasUnsavedChanges && step !== 5) {
        if (!confirm('¿Estás seguro? Se perderán los cambios no guardados.')) return;
      }
      navigate('/');
    } else {
      setStep(step - 1);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <div className={`max-w-5xl mx-auto space-y-6 ${isTrial ? 'trial-experience relative' : ''}`}>
      {isTrial && (
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-purple-50/50 to-pink-50/50 -z-10 rounded-3xl opacity-50 blur-xl pointer-events-none" />
      )}

      {/* Trial Banner */}
      {isTrial && step === 1 && (
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 rounded-xl p-6 text-white shadow-xl animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
          <div className="flex items-start gap-4 relative z-10">
            <div className="p-3 bg-white/20 rounded-lg backdrop-blur-sm">
              <Wand2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-1 flex items-center gap-2">
                Bienvenido al Cotizador Inteligente <span className="text-xs px-2 py-1 bg-white/20 rounded-full uppercase tracking-wider">Modo Prueba</span>
              </h2>
              <p className="text-indigo-100 max-w-2xl">
                Experimenta el poder de la Inteligencia Artificial extrayendo especificaciones automáticamente. Tienes <b className="text-white bg-white/20 px-1 rounded">1 intento</b> gratuito por IP. ¡Sube un requerimiento técnico y sorpréndete!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlays */}
      <LoadingOverlay type="extract" isVisible={loading && loadingType === 'extract'} />
      <LoadingOverlay type="search" isVisible={loading && loadingType === 'search'} />
      <LoadingOverlay type="generate" isVisible={loading && loadingType === 'generate'} />

      {/* Back button */}
      <button
        onClick={handleBack}
        className="btn-ghost flex items-center gap-1 -ml-2"
      >
        <ArrowLeft className="w-4 h-4" />
        {step === 1 || step === 5 ? 'Volver al inicio' : 'Paso anterior'}
      </button>

      {/* Enhanced Stepper */}
      {step <= 4 && (
        <div className="stepper-container">
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center">
                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                      transition-all duration-500
                      ${step === s.id ? 'stepper-active ring-4 ring-kenya-100' : step > s.id ? 'stepper-completed' : 'stepper-inactive'}
                    `}>
                      {step > s.id ? <Check className="w-4 h-4" /> : s.id}
                    </div>
                    {/* Tooltip */}
                    <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                      <div className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                        {s.description}
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45" />
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:block">
                    <span className={`text-sm ${step === s.id ? 'font-semibold text-gray-800' : step > s.id ? 'font-medium text-green-600' : 'text-gray-400'}`}>
                      {s.label}
                    </span>
                    {step === s.id && (
                      <p className="text-[10px] text-gray-400 leading-tight mt-0.5 hidden md:block">
                        {s.description}
                      </p>
                    )}
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`w-8 sm:w-16 h-0.5 mx-2 stepper-step-connector ${step > s.id ? 'bg-green-500' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 animate-fade-in">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-red-500 text-sm">!</span>
            </div>
            <div className="flex-1">
              <p className="font-medium">Ha ocurrido un error</p>
              <p className="text-sm mt-1 text-red-600">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-sm text-red-400 hover:text-red-600 transition-colors p-1">✕</button>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* STEP 1: Upload Image */}
      {/* ============================================ */}
      {step === 1 && (
        <div className={`card space-y-6 step-transition ${isTrial ? 'border-indigo-100 shadow-indigo-100/50 ring-1 ring-indigo-50' : ''}`}>
          <div>
            <h2 className={`text-xl font-bold ${isTrial ? 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600' : 'text-gray-800'}`}>Paso 1: Subir Imagen</h2>
            <p className="text-gray-500 text-sm mt-1">
              Sube una imagen del requerimiento (correo, captura, documento) y la IA extraerá las especificaciones automáticamente.
            </p>
          </div>

          <UploadZone onFileSelect={setFile} disabled={loading} />

          {/* Helper tips for first-time users */}
          {!file && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-in">
              <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-lg">📧</span>
                <div>
                  <p className="text-xs font-medium text-gray-700">Correos electrónicos</p>
                  <p className="text-[11px] text-gray-400">Captura del requerimiento recibido</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-lg">📋</span>
                <div>
                  <p className="text-xs font-medium text-gray-700">Documentos</p>
                  <p className="text-[11px] text-gray-400">TDR, bases o fichas técnicas</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                <span className="text-lg">📸</span>
                <div>
                  <p className="text-xs font-medium text-gray-700">Fotos directas</p>
                  <p className="text-[11px] text-gray-400">Fotografías de documentos impresos</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between">
            <button onClick={() => navigate('/')} className="btn-secondary">
              Cancelar
            </button>
            <button
              onClick={handleExtract}
              disabled={!file || loading}
              className={`flex items-center gap-2 ${isTrial && file ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-6 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/30 transition-all hover:-translate-y-0.5 font-medium' : 'btn-primary'}`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Extrayendo...
                </>
              ) : (
                <>
                  <Wand2 className={`w-4 h-4 ${isTrial ? 'animate-pulse' : ''}`} />
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
        <div className="space-y-6 step-transition">
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Paso 2: Revisión de Extracción</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Revisa y corrige las especificaciones extraídas por la IA antes de buscar productos.
                </p>
              </div>
              <div className="badge badge-green animate-scale-in">
                {equipos.length} equipo{equipos.length !== 1 ? 's' : ''} detectado{equipos.length !== 1 ? 's' : ''}
              </div>
            </div>
            {notasAdicionales && (
              <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                <strong>Notas de la IA:</strong> {notasAdicionales}
              </div>
            )}
          </div>

          {/* Tip for the user */}
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700 animate-fade-in">
            <span className="text-lg">💡</span>
            <span>Puedes modificar cualquier campo si la IA no lo detectó correctamente. ¡Cuanto más preciso, mejores resultados!</span>
          </div>

          {equipos.length === 0 ? (
            <div className="card text-center py-8 text-gray-400">
              <p className="font-medium">No se encontraron requerimientos de equipos en la imagen.</p>
              <p className="text-sm mt-1">Intenta con otra imagen más clara.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {equipos.map((equipo, index) => (
                <div key={index} className="relative animate-fade-in" style={{ animationDelay: `${index * 100}ms` }}>
                  <RequirementCard
                    equipo={equipo}
                    index={index}
                    onUpdate={handleUpdateEquipo}
                    editable={true}
                  />
                  <button
                    onClick={() => handleRemoveEquipo(index)}
                    className="absolute top-3 right-3 text-xs text-red-600 hover:underline hover:bg-red-50 px-2 py-1 rounded transition-colors"
                    aria-label={`Eliminar ficha ${index + 1}`}
                    title="Eliminar ficha"
                  >
                    Eliminar
                  </button>
                </div>
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
        <div className="space-y-6 step-transition">
          <div className="card">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Paso 3: Selección de Productos</h2>
                <p className="text-gray-500 text-sm mt-1">
                  Selecciona los productos más compatibles con el requerimiento.
                </p>
              </div>
              {selectedProducts.length > 0 && (
                <div className="badge badge-green animate-scale-in">
                  {selectedProducts.length} seleccionado{selectedProducts.length > 1 ? 's' : ''}
                </div>
              )}
            </div>

            {/* Brand priority info */}
            <div className="flex items-center gap-3 mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-xs text-gray-500 font-medium">Prioridad de búsqueda:</span>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">1° Kenya</span>
                <span className="text-gray-300">→</span>
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">2° Lenovo</span>
                <span className="text-gray-300">→</span>
                <span className="text-xs px-2 py-0.5 bg-cyan-100 text-cyan-700 rounded-full font-medium">3° HP</span>
              </div>
            </div>
          </div>

          {searchResults.map((result, rIndex) => (
            <div key={rIndex} className="card animate-fade-in" style={{ animationDelay: `${rIndex * 150}ms` }}>
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
                        px-4 py-2 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-all duration-200
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
                        key={getProductId(product) || pIndex}
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

      {/* Floating selection counter */}
      {step === 3 && selectedProducts.length > 0 && (
        <div className="floating-counter" onClick={() => setStep(4)}>
          <div className="floating-counter-badge">
            {selectedProducts.length}
          </div>
          <div>
            <p className="text-sm font-medium">
              {selectedProducts.length} producto{selectedProducts.length > 1 ? 's' : ''}
            </p>
            <p className="text-[11px] text-gray-400">Toca para continuar →</p>
          </div>
          <ShoppingCart className="w-5 h-5 text-gray-400 ml-1" />
        </div>
      )}

      {/* ============================================ */}
      {/* STEP 4: Generate Quote (admin) or Request (user) */}
      {/* ============================================ */}
      {step === 4 && (
        <div className="space-y-6 step-transition">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-800">
              Paso 4: {isAdmin ? 'Generar Cotización' : 'Solicitar Cotización'}
            </h2>
            <p className="text-gray-500 text-sm mt-1">
              {isAdmin
                ? 'Completa los datos del cliente, ajusta cantidades y precios, y genera la cotización final.'
                : 'Completa tus datos de contacto y un administrador preparará tu cotización.'}
            </p>
            <div className="mt-3 flex items-center gap-2 p-2 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700">
              <CheckCircle className="w-4 h-4" />
              <span>{selectedProducts.length} producto{selectedProducts.length > 1 ? 's' : ''} seleccionado{selectedProducts.length > 1 ? 's' : ''} para cotizar</span>
            </div>
          </div>

          {isAdmin ? (
            <QuoteBuilder
              selectedProducts={selectedProducts}
              onSubmit={handleGenerateQuote}
              loading={loading}
            />
          ) : (
            <QuoteRequestForm
              selectedProducts={selectedProducts}
              requirementId={requirementId}
            />
          )}
        </div>
      )}

      {/* ============================================ */}
      {/* STEP 5: Preview */}
      {/* ============================================ */}
      {step === 5 && generatedQuote && (
        <div className="space-y-6 step-transition">
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
                setHasUnsavedChanges(false);
              }}
              className="btn-primary"
            >
              Nueva Cotización
            </button>
          </div>
        </div>
      )}

      {/* Scroll to top button */}
      {showScrollTop && (
        <button onClick={scrollToTop} className="scroll-to-top animate-fade-in" aria-label="Ir arriba">
          <ChevronUp className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
