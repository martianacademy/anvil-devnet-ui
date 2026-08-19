"use client";

import { useState } from "react";
import Link from "next/link";
import { Layers, Search, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDevnetStore } from "@/store/useDevnetStore";
import { useProjectStore } from "@/store/useProjectStore";
import { explorer } from "@/lib/apiClient";
import { useAsyncData } from "@/lib/hooks";
import { formatNumber, gasUsedPercent, timeAgo, truncateHex } from "@/lib/format";

interface BlockRecord {
    number: number;
    hash: string;
    timestamp: number;
    txCount: number;
    gasUsed: string;
    gasLimit: string | null;
}

const PAGE_SIZE = 25;

export default function BlocksPage() {
    const { nodeStatus, latestBlock, chainId } = useDevnetStore();
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const [filter, setFilter] = useState("");
    const [page, setPage] = useState(1);

    // Server-side pagination: only the visible page is fetched.
    const { data, loading, error } = useAsyncData(
        () => explorer<BlockRecord[]>(`module=block&action=getblocklist&page=${page}&offset=${PAGE_SIZE}`, []),
        [page, latestBlock, nodeStatus, chainId, activeProjectId],
        { result: [] as BlockRecord[], total: null as number | null }
    );

    const blocks = data.result;
    const total = data.total ?? blocks.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const term = filter.trim().toLowerCase();
    const visible = term
        ? blocks.filter((b) => String(b.number).includes(term) || b.hash?.toLowerCase().includes(term))
        : blocks;

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        Blocks
                    </h1>
                    <p className="text-muted-foreground text-xs mt-0.5">
                        {formatNumber(total)} block{total === 1 ? "" : "s"} indexed
                    </p>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">Chain {chainId ?? "—"}</Badge>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Filter this page by block number or hash…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="pl-9 bg-card border-border text-sm"
                />
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                        <thead>
                            <tr className="text-muted-foreground border-b border-border/60 bg-muted/30">
                                <th className="text-left px-5 py-3 font-medium">Block</th>
                                <th className="text-left px-4 py-3 font-medium">Age</th>
                                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Hash</th>
                                <th className="text-left px-4 py-3 font-medium">TXs</th>
                                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Gas Used</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <EmptyRow>Loading blocks…</EmptyRow>
                            ) : error ? (
                                <EmptyRow>Could not load blocks: {error}</EmptyRow>
                            ) : visible.length === 0 ? (
                                <EmptyRow>
                                    {term
                                        ? "No blocks match your filter on this page."
                                        : nodeStatus !== "running"
                                            ? "Start Anvil to see blocks."
                                            : "No blocks yet."}
                                </EmptyRow>
                            ) : (
                                visible.map((b) => {
                                    const percent = gasUsedPercent(b.gasUsed, b.gasLimit);
                                    return (
                                        <tr key={b.hash ?? b.number} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="px-5 py-2.5">
                                                <Link href={`/blocks/${b.number}`} className="text-primary font-semibold hover:underline">
                                                    #{b.number.toLocaleString()}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground">
                                                <span className="inline-flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {timeAgo(b.timestamp)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5 hidden sm:table-cell">
                                                <Link href={`/blocks/${b.number}`} className="text-muted-foreground hover:text-foreground transition-colors">
                                                    {truncateHex(b.hash, 10, 6)}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {(b.txCount ?? 0) > 0
                                                    ? <Badge variant="secondary" className="text-xs">{b.txCount}</Badge>
                                                    : <span className="text-muted-foreground">0</span>}
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                                                {formatNumber(b.gasUsed)}
                                                {percent !== null && <span className="ml-1 opacity-60">({percent.toFixed(1)}%)</span>}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-muted/20">
                        <span className="text-xs text-muted-foreground">
                            Page {page} of {totalPages} · {formatNumber(total)} blocks
                        </span>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                aria-label="Previous page"
                                className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                aria-label="Next page"
                                className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
    return (
        <tr>
            <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">{children}</td>
        </tr>
    );
}
