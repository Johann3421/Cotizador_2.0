import { useState, useEffect, useCallback, useMemo, createContext, useContext } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

const TOAST_ICONS = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const TOAST_STYLES = {
    success: 'toast-success',
    error: 'toast-error',
    warning: 'toast-warning',
    info: 'toast-info',
};

function ToastItem({ toast, onRemove }) {
    const [isExiting, setIsExiting] = useState(false);
    const Icon = TOAST_ICONS[toast.type] || Info;

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onRemove(toast.id), 300);
        }, toast.duration || 4000);
        return () => clearTimeout(timer);
    }, [toast, onRemove]);

    const handleClose = () => {
        setIsExiting(true);
        setTimeout(() => onRemove(toast.id), 300);
    };

    return (
        <div className={`toast-item ${TOAST_STYLES[toast.type]} ${isExiting ? 'toast-exit' : 'toast-enter'}`}>
            <div className="toast-icon-wrapper">
                <Icon className="w-5 h-5" />
            </div>
            <div className="toast-content">
                {toast.title && <p className="toast-title">{toast.title}</p>}
                <p className="toast-message">{toast.message}</p>
            </div>
            <button onClick={handleClose} className="toast-close">
                <X className="w-4 h-4" />
            </button>
            <div className="toast-progress">
                <div
                    className="toast-progress-bar"
                    style={{ animationDuration: `${toast.duration || 4000}ms` }}
                />
            </div>
        </div>
    );
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((options) => {
        const id = Date.now() + Math.random();
        const toast = typeof options === 'string'
            ? { id, message: options, type: 'info' }
            : { id, ...options };
        setToasts((prev) => [...prev, toast]);
        return id;
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = useMemo(() => ({
        success: (message, opts = {}) => addToast({ message, type: 'success', ...opts }),
        error: (message, opts = {}) => addToast({ message, type: 'error', ...opts }),
        warning: (message, opts = {}) => addToast({ message, type: 'warning', ...opts }),
        info: (message, opts = {}) => addToast({ message, type: 'info', ...opts }),
    }), [addToast]);

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <div className="toast-container" aria-live="polite" aria-atomic="true">
                {toasts.map((t) => (
                    <ToastItem key={t.id} toast={t} onRemove={removeToast} />
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
