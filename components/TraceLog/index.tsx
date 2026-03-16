"use client";

import { useState, useMemo, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import type { EvmStep, CallNode } from "@/lib/traceParser";
import type { TraceFilters, TraceEntry } from "./types";
import { TraceRow } from "./TraceRow";
import { structLogsToEntries, callTraceToEntries } from "./utils";
import { decodeCallWithAbi, decodeLogWithAbi } from "./abiDecode";
import type { Abi } from "viem";

interface Props {
    steps: EvmStep[];
    callTrace: CallNode | null;
    traceError?: string | null;
    txTo?: string;
}

const IMPORTANT_KINDS = new Set([
    "CALL", "DELEGATECALL", "STATICCALL", "CREATE",
    "SLOAD", "SSTORE", "LOG", "RETURN", "REVERT",
]);

export function TraceLog({ steps, callTrace, traceError, txTo }: Props) {
    const [filters, setFilters] = useState<TraceFilters>({
        showGas: true,
        showFullTrace: false,
        showStorage: true,
        showEvents: true,
        search: "",
    });
    const [abiMap, setAbiMap] = useState<Record<string, Abi>>({});
    const [abiFetching, setAbiFetching] = useState(false);

    // Build entries from struct logs or call trace
    const rawEntries = useMemo(() => {
        if (steps.length > 0) return structLogsToEntries(steps);
        if (callTrace) return callTraceToEntries(callTrace);
        return [];
    }, [steps, callTrace]);

    // Collect unique addresses from entries and fetch ABIs
    useEffect(() => {
        const addrs = new Set<string>();
        if (txTo) addrs.add(txTo.toLowerCase());
        for (const e of rawEntries) {
            if (e.to) addrs.add(e.to.toLowerCase());
        }
        const toFetch = [...addrs].filter((a) => a !== "0x" && a.length === 42);
        if (toFetch.length === 0) return;

        setAbiFetching(true);
        fetch("/api/abi/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: toFetch }),
        })
            .then((r) => r.json())
            .then((data) => setAbiMap(data.abis ?? {}))
            .catch(() => { /* ignore */ })
            .finally(() => setAbiFetching(false));
    }, [rawEntries, txTo]);

    // Enhance entries with ABI decoding
    const allEntries = useMemo(() => {
        if (Object.keys(abiMap).length === 0) return rawEntries;

        return rawEntries.map((entry) => {
            const enhanced = { ...entry };
            const targetAddr = (entry.to ?? txTo ?? "").toLowerCase();
            const abi = abiMap[targetAddr];
            if (!abi) return enhanced;

            // Decode CALL input with full ABI
            if (
                (entry.kind === "CALL" || entry.kind === "STATICCALL" || entry.kind === "DELEGATECALL") &&
                entry.input && !entry.decoded
            ) {
                const decoded = decodeCallWithAbi(abi, entry.input);
                if (decoded) {
                    enhanced.decoded = decoded.name;
                    enhanced.decodedEventParams = decoded.params;
                    enhanced.decodedCallParams = decoded.params.map((p) => `${p.label}: ${p.value}`);
                }
            }

            // Decode LOG with full ABI
            if (entry.kind === "LOG" && entry.topics && !entry.decoded) {
                const decoded = decodeLogWithAbi(abi, entry.topics, entry.logData);
                if (decoded) {
                    enhanced.decoded = decoded.name;
                    enhanced.decodedEventParams = decoded.params;
                }
            }

            return enhanced;
        });
    }, [rawEntries, abiMap, txTo]);

    // Apply filters
    const filtered = useMemo(() => {
        let result = allEntries;

        if (!filters.showFullTrace) {
            result = result.filter((e) => IMPORTANT_KINDS.has(e.kind));
        }
        if (!filters.showStorage) {
            result = result.filter((e) => e.kind !== "SLOAD" && e.kind !== "SSTORE");
        }
        if (!filters.showEvents) {
            result = result.filter((e) => e.kind !== "LOG");
        }
        if (filters.search) {
            const q = filters.search.toLowerCase();
            result = result.filter(
                (e) =>
                    e.op.toLowerCase().includes(q) ||
                    e.decoded?.toLowerCase().includes(q) ||
                    e.to?.toLowerCase().includes(q) ||
                    e.slot?.toLowerCase().includes(q) ||
                    e.value?.toLowerCase().includes(q)
            );
        }

        return result;
    }, [allEntries, filters]);

    if (traceError) {
        return (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <p className="text-sm text-amber-400 font-medium">⚠ Trace Unavailable</p>
                <p className="text-xs text-amber-400/70 mt-1">{traceError}</p>
            </div>
        );
    }

    if (allEntries.length === 0) {
        return (
            <div className="py-6 text-center space-y-2">
                <p className="text-sm text-muted-foreground">No trace data available</p>
                <p className="text-xs text-muted-foreground/70">
                    Simple ETH transfers don&apos;t generate trace data.
                    Traces are available for smart contract interactions.
                </p>
            </div>
        );
    }

    const toggle = (key: keyof TraceFilters) =>
        setFilters((f) => ({ ...f, [key]: !f[key] }));

    return (
        <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
                <Input
                    placeholder="Search ops, addresses, slots…"
                    value={filters.search}
                    onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                    className="w-48 h-7 text-xs bg-muted/30"
                />

                <FilterToggle label="Gas" checked={filters.showGas} onToggle={() => toggle("showGas")} />
                <FilterToggle label="Full Trace" checked={filters.showFullTrace} onToggle={() => toggle("showFullTrace")} />
                <FilterToggle label="Storage" checked={filters.showStorage} onToggle={() => toggle("showStorage")} />
                <FilterToggle label="Events" checked={filters.showEvents} onToggle={() => toggle("showEvents")} />

                <div className="ml-auto flex items-center gap-2">
                    {abiFetching && (
                        <span className="text-[10px] text-muted-foreground animate-pulse">
                            Fetching ABIs…
                        </span>
                    )}
                    {Object.keys(abiMap).length > 0 && (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">
                            {Object.keys(abiMap).length} ABI{Object.keys(abiMap).length > 1 ? "s" : ""}
                        </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                        {filtered.length} / {allEntries.length} ops
                    </Badge>
                </div>
            </div>

            {/* Trace rows */}
            <ScrollArea className="h-[500px] rounded-lg border border-border bg-muted/10">
                <div className="min-w-0">
                    {filtered.map((entry) => (
                        <TraceRow key={entry.idx} entry={entry} filters={filters} />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}

function FilterToggle({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
    return (
        <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <Checkbox checked={checked} onCheckedChange={onToggle} className="h-3.5 w-3.5" />
            <span className="text-muted-foreground">{label}</span>
        </label>
    );
}
