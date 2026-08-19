"use client";

import { Check, Copy } from "lucide-react";
import { useCopy } from "@/lib/hooks";

/** Label/value row used by the block, tx and address detail pages. */
export function DetailRow({
    label,
    icon,
    children,
}: {
    label: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-0 py-3 border-b border-border/40 last:border-0">
            <div className="sm:w-56 flex-shrink-0 flex items-center gap-2 text-muted-foreground text-sm">
                {icon && <span className="opacity-60">{icon}</span>}
                <span>{label}:</span>
            </div>
            <div className="flex-1 text-sm font-mono break-all">{children}</div>
        </div>
    );
}

export function CopyButton({ text, label }: { text: string; label?: string }) {
    const { copied, copy } = useCopy();
    return (
        <button
            type="button"
            onClick={() => copy(text)}
            aria-label={label ?? `Copy ${text}`}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors align-middle"
        >
            {copied === text
                ? <Check className="w-3.5 h-3.5 text-emerald-400" />
                : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
}

/** Card shell with a titled header — the app's standard panel. */
export function Panel({
    title,
    action,
    children,
    className = "",
}: {
    title: React.ReactNode;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={`rounded-xl border border-border bg-card overflow-hidden ${className}`}>
            <div className="px-5 py-4 border-b border-border/60 bg-muted/30 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-foreground">{title}</span>
                {action}
            </div>
            {children}
        </div>
    );
}
