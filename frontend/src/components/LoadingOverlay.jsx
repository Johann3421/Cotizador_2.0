import { useState, useEffect } from 'react';
import { Sparkles, Search, FileCheck, Loader2, Brain, Database, CheckCircle2 } from 'lucide-react';

const LOADING_CONFIGS = {
    extract: {
        title: 'Analizando tu imagen',
        icon: Brain,
        color: 'kenya',
        stages: [
            { label: 'Procesando imagen...', duration: 2000 },
            { label: 'IA identificando equipos...', duration: 4000 },
            { label: 'Extrayendo especificaciones técnicas...', duration: 6000 },
            { label: 'Organizando requerimientos...', duration: 3000 },
        ],
        tips: [
            '💡 La IA analiza cada detalle de tu imagen para encontrar las especificaciones exactas.',
            '📸 Para mejores resultados, usa imágenes con texto legible y buena resolución.',
            '🔍 Nuestro sistema reconoce requerimientos de correos, capturas y documentos escaneados.',
            '⚡ Puedes subir hasta 10MB por imagen en formato JPG, PNG, WebP o PDF.',
        ],
        estimatedTime: '15-30 segundos',
    },
    search: {
        title: 'Buscando productos compatibles',
        icon: Search,
        color: 'blue',
        stages: [
            { label: 'Conectando con catálogo...', duration: 1500 },
            { label: 'Buscando fichas Kenya...', duration: 4000 },
            { label: 'Buscando fichas Lenovo...', duration: 4000 },
            { label: 'Buscando fichas HP...', duration: 4000 },
            { label: 'Comparando especificaciones...', duration: 3000 },
            { label: 'Calculando compatibilidad...', duration: 2000 },
        ],
        tips: [
            '🏪 Buscamos en el catálogo de PeruCompras para obtener los mejores precios.',
            '📊 Cada producto es comparado contra las especificaciones de tu requerimiento.',
            '🏆 La prioridad de búsqueda es: Kenya → Lenovo → HP.',
            '💰 Los precios mostrados son referenciales según el catálogo vigente.',
        ],
        estimatedTime: '20-45 segundos',
    },
    generate: {
        title: 'Generando tu cotización',
        icon: FileCheck,
        color: 'green',
        stages: [
            { label: 'Preparando datos del cliente...', duration: 1000 },
            { label: 'Calculando precios e IGV...', duration: 2000 },
            { label: 'Generando documento...', duration: 3000 },
            { label: 'Creando PDF profesional...', duration: 2000 },
        ],
        tips: [
            '📄 Tu cotización incluirá todos los detalles técnicos y precios desglosados.',
            '🖨️ Podrás descargar el PDF e imprimirlo directamente.',
            '📧 También puedes compartir la cotización por correo electrónico.',
            '✅ La cotización tiene una validez de 7 días calendario.',
        ],
        estimatedTime: '5-10 segundos',
    },
};

const COLOR_MAP = {
    kenya: {
        bg: 'bg-kenya-50',
        border: 'border-kenya-200',
        text: 'text-kenya-600',
        iconBg: 'bg-kenya-100',
        progressBg: 'bg-kenya-100',
        progressFill: 'bg-gradient-to-r from-kenya-400 to-kenya-600',
        glow: 'shadow-kenya-200',
        dot: 'bg-kenya-500',
    },
    blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-600',
        iconBg: 'bg-blue-100',
        progressBg: 'bg-blue-100',
        progressFill: 'bg-gradient-to-r from-blue-400 to-blue-600',
        glow: 'shadow-blue-200',
        dot: 'bg-blue-500',
    },
    green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-600',
        iconBg: 'bg-green-100',
        progressBg: 'bg-green-100',
        progressFill: 'bg-gradient-to-r from-green-400 to-green-600',
        glow: 'shadow-green-200',
        dot: 'bg-green-500',
    },
};

export default function LoadingOverlay({ type = 'extract', isVisible = false }) {
    const [currentStage, setCurrentStage] = useState(0);
    const [progress, setProgress] = useState(0);
    const [currentTip, setCurrentTip] = useState(0);
    const [stageComplete, setStageComplete] = useState([]);
    const [elapsedTime, setElapsedTime] = useState(0);

    const config = LOADING_CONFIGS[type] || LOADING_CONFIGS.extract;
    const colors = COLOR_MAP[config.color] || COLOR_MAP.kenya;
    const IconComponent = config.icon;

    // Reset state when visibility changes
    useEffect(() => {
        if (isVisible) {
            setCurrentStage(0);
            setProgress(0);
            setCurrentTip(0);
            setStageComplete([]);
            setElapsedTime(0);
        }
    }, [isVisible]);

    // Simulate progress
    useEffect(() => {
        if (!isVisible) return;

        const totalDuration = config.stages.reduce((sum, s) => sum + s.duration, 0);
        let elapsed = 0;

        const interval = setInterval(() => {
            elapsed += 100;
            const newProgress = Math.min((elapsed / totalDuration) * 85, 85); // Cap at 85% until real completion
            setProgress(newProgress);

            // Determine current stage
            let cumulative = 0;
            for (let i = 0; i < config.stages.length; i++) {
                cumulative += config.stages[i].duration;
                if (elapsed < cumulative) {
                    setCurrentStage(i);
                    setStageComplete(Array.from({ length: i }, (_, idx) => idx));
                    break;
                }
                if (i === config.stages.length - 1) {
                    setCurrentStage(i);
                    setStageComplete(Array.from({ length: i }, (_, idx) => idx));
                }
            }
        }, 100);

        return () => clearInterval(interval);
    }, [isVisible, type]);

    // Rotate tips
    useEffect(() => {
        if (!isVisible) return;
        const tipInterval = setInterval(() => {
            setCurrentTip((prev) => (prev + 1) % config.tips.length);
        }, 5000);
        return () => clearInterval(tipInterval);
    }, [isVisible, config.tips.length]);

    // Elapsed time counter
    useEffect(() => {
        if (!isVisible) return;
        const timer = setInterval(() => {
            setElapsedTime((prev) => prev + 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [isVisible]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    };

    if (!isVisible) return null;

    return (
        <div className="loading-overlay" role="status" aria-live="polite">
            <div className="loading-overlay-backdrop" />

            <div className="loading-overlay-content">
                {/* Animated Icon */}
                <div className={`loading-icon-container ${colors.iconBg}`}>
                    <IconComponent className={`loading-icon ${colors.text}`} />
                    <div className={`loading-icon-ring ${colors.border}`} />
                    <div className={`loading-icon-pulse ${colors.dot}`} />
                </div>

                {/* Title */}
                <h2 className="loading-title">{config.title}</h2>

                {/* Current stage label */}
                <div className="loading-stage-label">
                    <Loader2 className={`w-4 h-4 animate-spin ${colors.text}`} />
                    <span className="text-gray-600 font-medium">
                        {config.stages[currentStage]?.label}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="loading-progress-container">
                    <div className={`loading-progress-track ${colors.progressBg}`}>
                        <div
                            className={`loading-progress-fill ${colors.progressFill}`}
                            style={{ width: `${progress}%` }}
                        />
                        <div className="loading-progress-shimmer" />
                    </div>
                    <div className="loading-progress-info">
                        <span className="text-xs text-gray-400">{Math.round(progress)}%</span>
                        <span className="text-xs text-gray-400">{formatTime(elapsedTime)}</span>
                    </div>
                </div>

                {/* Stages checklist */}
                <div className="loading-stages-list">
                    {config.stages.map((stage, index) => (
                        <div
                            key={index}
                            className={`loading-stage-item ${stageComplete.includes(index)
                                    ? 'loading-stage-complete'
                                    : index === currentStage
                                        ? 'loading-stage-active'
                                        : 'loading-stage-pending'
                                }`}
                        >
                            <div className="loading-stage-dot">
                                {stageComplete.includes(index) ? (
                                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                                ) : index === currentStage ? (
                                    <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} animate-pulse`} />
                                ) : (
                                    <div className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                                )}
                            </div>
                            <span className={`text-sm ${stageComplete.includes(index) ? 'text-green-600 line-through' :
                                    index === currentStage ? 'text-gray-700 font-medium' :
                                        'text-gray-400'
                                }`}>
                                {stage.label}
                            </span>
                        </div>
                    ))}
                </div>

                {/* Tip */}
                <div className="loading-tip-container">
                    <div className="loading-tip" key={currentTip}>
                        {config.tips[currentTip]}
                    </div>
                </div>

                {/* Estimated time */}
                <p className="loading-estimated-time">
                    Tiempo estimado: {config.estimatedTime}
                </p>
            </div>
        </div>
    );
}
