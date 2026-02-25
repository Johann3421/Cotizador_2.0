import { useState, useRef, useCallback } from 'react';
import { Upload, Image, FileText, X } from 'lucide-react';

export default function UploadZone({ onFileSelect, disabled }) {
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Formato no soportado. Usa JPG, PNG, WebP o PDF.');
      return;
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      alert('El archivo excede los 10MB permitidos.');
      return;
    }

    setFileName(file.name);

    // Preview
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target.result);
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }

    onFileSelect(file);
  }, [onFileSelect]);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const clearFile = () => {
    setPreview(null);
    setFileName('');
    if (inputRef.current) inputRef.current.value = '';
    onFileSelect(null);
  };

  return (
    <div className="w-full">
      {!fileName ? (
        <div
          className={`
            relative border-2 border-dashed rounded-xl p-12 text-center cursor-pointer
            transition-all duration-300 ease-in-out
            ${dragActive 
              ? 'border-kenya-500 bg-kenya-50 scale-[1.01]' 
              : 'border-gray-300 hover:border-kenya-400 hover:bg-gray-50'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          `}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={handleChange}
            disabled={disabled}
          />

          <div className="flex flex-col items-center gap-4">
            <div className={`
              w-16 h-16 rounded-full flex items-center justify-center
              ${dragActive ? 'bg-kenya-100' : 'bg-gray-100'}
              transition-colors duration-300
            `}>
              <Upload className={`w-8 h-8 ${dragActive ? 'text-kenya-600' : 'text-gray-400'}`} />
            </div>
            
            <div>
              <p className="text-lg font-medium text-gray-700">
                {dragActive ? '¡Suelta tu imagen aquí!' : 'Arrastra tu imagen aquí'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                o haz clic para seleccionar
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <Image className="w-3.5 h-3.5" /> JPG, PNG, WebP
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" /> PDF
              </span>
              <span>Máx. 10MB</span>
            </div>

            <p className="text-xs text-gray-400 mt-2">
              Soporta: correos, capturas de pantalla, documentos escaneados
            </p>
          </div>
        </div>
      ) : (
        <div className="border-2 border-green-200 bg-green-50 rounded-xl p-6 animate-fade-in">
          <div className="flex items-start gap-4">
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="w-32 h-32 object-cover rounded-lg border border-gray-200 shadow-sm"
              />
            ) : (
              <div className="w-32 h-32 bg-gray-100 rounded-lg flex items-center justify-center">
                <FileText className="w-12 h-12 text-gray-400" />
              </div>
            )}
            
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-800 truncate max-w-xs">{fileName}</h4>
                {!disabled && (
                  <button
                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    className="p-1 hover:bg-red-100 rounded-full transition-colors"
                  >
                    <X className="w-4 h-4 text-red-500" />
                  </button>
                )}
              </div>
              <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                ✓ Archivo listo para procesar
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Haz clic en "Extraer con IA" para analizar el requerimiento
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
