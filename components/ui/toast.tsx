"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

type ToastVariant = "success" | "error" | "info";

interface Toast {
    id: number;
    message: string;
    variant: ToastVariant;
}

interface ToastContextValue {
    toast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
    return useContext(ToastContext);
}

let nextId = 0;

const icons: Record<ToastVariant, ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />,
    error: <XCircle className="w-4 h-4 text-red-400 shrink-0" />,
    info: <Info className="w-4 h-4 text-blue-400 shrink-0" />,
};

const borderColors: Record<ToastVariant, string> = {
    success: "border-green-500/30",
    error: "border-red-500/30",
    info: "border-blue-500/30",
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const toast = useCallback((message: string, variant: ToastVariant = "info") => {
        const id = ++nextId;
        setToasts((prev) => [...prev, { id, message, variant }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    const dismiss = (id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            {/* Toast container */}
            <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
                {toasts.map((t) => (
                    <div
                        key={t.id}
                        className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border ${borderColors[t.variant]} bg-card/95 backdrop-blur-md shadow-lg animate-in slide-in-from-bottom-2 fade-in-0 duration-200`}
                    >
                        {icons[t.variant]}
                        <span className="text-sm text-foreground flex-1">{t.message}</span>
                        <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
