"use client";

import { Badge } from "@/components/ui/badge";
import type { TraceEntry, TraceFilters } from "./types";
import { shortHex, shortAddr } from "./utils";

interface Props {
    entry: TraceEntry;
    filters: TraceFilters;
}

const KIND_STYLES: Record<string, string> = {
    CALL: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    DELEGATECALL: "bg-purple-500/20 text-purple-400 border-purple-500/40",
    STATICCALL: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
    CREATE: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
    SLOAD: "bg-orange-500/20 text-orange-400 border-orange-500/40",
    SSTORE: "bg-red-500/20 text-red-400 border-red-500/40",
    LOG: "bg-violet-500/20 text-violet-400 border-violet-500/40",
    JUMP: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    RETURN: "bg-green-500/20 text-green-400 border-green-500/40",
    REVERT: "bg-red-600/30 text-red-400 border-red-600/40",
    OTHER: "bg-gray-500/20 text-gray-400 border-gray-500/40",
};

const KIND_LABELS: Record<string, string> = {
    DELEGATECALL: "D-CALL",
    STATICCALL: "S-CALL",
};

export function TraceRow({ entry, filters }: Props) {
    const indent = (entry.depth - 1) * 20;
    const style = KIND_STYLES[entry.kind] ?? KIND_STYLES.OTHER;
    const label = KIND_LABELS[entry.kind] ?? entry.kind;

    return (
        <div
            className="flex items-start gap-2 py-1.5 px-2 hover:bg-muted/30 transition-colors font-mono text-xs border-b border-border/20 group"
            style={{ paddingLeft: `${indent + 8}px` }}
        >
            {/* Badge */}
            <Badge variant="outline" className={`shrink-0 text-[10px] px-1.5 py-0 font-bold min-w-[52px] justify-center ${style}`}>
                {label}
            </Badge>

            {/* Gas cost */}
            {filters.showGas && (
                <span className="shrink-0 text-muted-foreground/60 w-16 text-right tabular-nums">
                    {entry.gasCost.toLocaleString()}
                </span>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
                <Content entry={entry} />
            </div>
        </div>
    );
}

function Content({ entry }: { entry: TraceEntry }) {
    switch (entry.kind) {
        case "CALL":
        case "DELEGATECALL":
        case "STATICCALL":
            return <CallContent entry={entry} />;
        case "SLOAD":
            return <SloadContent entry={entry} />;
        case "SSTORE":
            return <SstoreContent entry={entry} />;
        case "LOG":
            return <LogContent entry={entry} />;
        case "CREATE":
            return <CreateContent entry={entry} />;
        case "RETURN":
        case "REVERT":
            return <ReturnContent entry={entry} />;
        default:
            return <span className="text-muted-foreground">{entry.op}</span>;
    }
}

/* ── CALL / DELEGATECALL / STATICCALL ── */
function CallContent({ entry }: { entry: TraceEntry }) {
    const hasDecoded = entry.decoded && entry.decodedCallParams;

    return (
        <div className="flex flex-wrap items-center gap-x-1">
            {entry.to && (
                <span className="text-blue-300 font-medium">{shortAddr(entry.to)}</span>
            )}
            {hasDecoded ? (
                <>
                    <span className="text-muted-foreground">.</span>
                    <span className="text-emerald-400 font-semibold">{entry.decoded}</span>
                    <span className="text-muted-foreground">(</span>
                    {entry.decodedCallParams!.map((p, i) => (
                        <span key={i}>
                            {i > 0 && <span className="text-muted-foreground">, </span>}
                            <span className="text-foreground">{p}</span>
                        </span>
                    ))}
                    <span className="text-muted-foreground">)</span>
                </>
            ) : entry.input && entry.input.length >= 10 ? (
                <span className="text-purple-400 ml-1">{entry.input.slice(0, 10)}</span>
            ) : null}
            {entry.callValue && BigInt(entry.callValue || "0") > 0n && (
                <span className="text-yellow-400 ml-1 text-[10px] bg-yellow-400/10 px-1 rounded">
                    {(Number(BigInt(entry.callValue)) / 1e18).toFixed(4)} ETH
                </span>
            )}
            {entry.error && (
                <Badge variant="destructive" className="text-[10px] px-1 py-0 ml-1">REVERT</Badge>
            )}
        </div>
    );
}

/* ── SLOAD ── */
function SloadContent({ entry }: { entry: TraceEntry }) {
    return (
        <div className="flex items-center gap-x-1.5 flex-wrap">
            <span className="text-muted-foreground">read</span>
            <span className="text-orange-300">{shortHex(entry.slot ?? "", 20)}</span>
            {entry.value && (
                <>
                    <span className="text-muted-foreground">=</span>
                    <span className="text-foreground font-medium">
                        {shortHex(entry.value, 20)}
                    </span>
                </>
            )}
        </div>
    );
}

/* ── SSTORE ── */
function SstoreContent({ entry }: { entry: TraceEntry }) {
    return (
        <div className="flex items-center gap-x-1.5 flex-wrap">
            <span className="text-muted-foreground">write</span>
            <span className="text-orange-300">{shortHex(entry.slot ?? "", 20)}</span>
            <span className="text-muted-foreground">←</span>
            <span className="text-red-300 font-semibold">
                {shortHex(entry.value ?? "", 20)}
            </span>
        </div>
    );
}

/* ── LOG ── */
function LogContent({ entry }: { entry: TraceEntry }) {
    const hasDecoded = entry.decoded && entry.decodedEventParams;

    if (hasDecoded) {
        return (
            <div className="flex flex-wrap items-center gap-x-1">
                <span className="text-violet-300 font-semibold">{entry.decoded}</span>
                <span className="text-muted-foreground">(</span>
                {entry.decodedEventParams!.map((p, i) => (
                    <span key={i}>
                        {i > 0 && <span className="text-muted-foreground">, </span>}
                        <span className="text-muted-foreground/70">{p.label}</span>
                        <span className="text-muted-foreground"> = </span>
                        <span className="text-foreground">{p.value}</span>
                    </span>
                ))}
                <span className="text-muted-foreground">)</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-x-1.5">
            <span className="text-violet-300">{entry.op}</span>
            {entry.topics?.[0] && (
                <span className="text-muted-foreground">
                    topic0: {shortHex("0x" + entry.topics[0], 16)}
                </span>
            )}
        </div>
    );
}

/* ── CREATE ── */
function CreateContent({ entry }: { entry: TraceEntry }) {
    return (
        <div className="flex items-center gap-x-1.5">
            <span className="text-yellow-300 font-semibold">new Contract</span>
            {entry.to && (
                <>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-blue-300">{shortAddr(entry.to)}</span>
                </>
            )}
        </div>
    );
}

/* ── RETURN / REVERT ── */
function ReturnContent({ entry }: { entry: TraceEntry }) {
    return (
        <span className={entry.kind === "REVERT" ? "text-red-400 font-semibold" : "text-green-400"}>
            {entry.op}
        </span>
    );
}
