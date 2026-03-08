"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Layers, Search, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import Link from "next/link";
import { useDevnetStore } from "@/store/useDevnetStore";

interface BlockRecord {
    number: number;
    hash: string;
    timestamp: number;
    txCount: number;
    gasUsed: string;
}

function timeAgo(ts: number) {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
}

const PAGE_SIZE = 25;

export default function BlocksPage() {
    const { nodeStatus, latestBlock, chainId } = useDevnetStore();
    const [blocks, setBlocks] = useState<BlockRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("");
    const [page, setPage] = useState(1);

    useEffect(() => {
        setLoading(true);
        fetch("/api/explorer?module=block&action=getblocklist&page=1&offset=200")
            .then((r) => r.json())
            .then((data) => setBlocks(Array.isArray(data.result) ? data.result : []))
            .catch(() => { })
            .finally(() => setLoading(false));
    }, [latestBlock, nodeStatus, chainId]);

    const filtered = filter
        ? blocks.filter(
            (b) =>
                String(b.number).includes(filter) ||
                b.hash?.toLowerCase().includes(filter.toLowerCase())
        )
        : blocks;

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageBlocks = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
                        <Layers className="w-5 h-5 text-primary" />
                        Blocks
                    </h1>
                    <p className="text-muted-foreground text-xs mt-0.5">
                        {blocks.length} block{blocks.length !== 1 ? "s" : ""} recorded
                    </p>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">Chain {chainId ?? "—"}</Badge>
            </div>

            {/* Filter */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Search block number or hash…"
                    value={filter}
                    onChange={(e) => { setFilter(e.target.value); setPage(1); }}
                    className="pl-9 bg-card border-border text-sm"
                />
            </div>

            {/* Table */}
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
                                <tr>
                                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                                        Loading blocks…
                                    </td>
                                </tr>
                            ) : pageBlocks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                                        {filter ? "No blocks match your filter." : nodeStatus !== "running" ? "Start Anvil to see blocks." : "No blocks yet."}
                                    </td>
                                </tr>
                            ) : (
                                pageBlocks.map((b) => (
                                    <tr key={b.hash ?? b.number} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-5 py-2.5">
                                            <Link href={`/blocks/${b.number}`} className="text-primary font-semibold hover:underline inline-flex items-center gap-1">
                                                #{b.number.toLocaleString()}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground inline-flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {b.timestamp ? timeAgo(b.timestamp) : "—"}
                                        </td>
                                        <td className="px-4 py-2.5 hidden sm:table-cell">
                                            <Link href={`/blocks/${b.number}`} className="text-muted-foreground hover:text-foreground transition-colors">
                                                {b.hash ? `${b.hash.slice(0, 14)}…` : "—"}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {(b.txCount ?? 0) > 0 ? (
                                                <Badge variant="secondary" className="text-xs">
                                                    {b.txCount}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground">0</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground hidden md:table-cell">
                                            {b.gasUsed ?? "—"}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-5 py-3 border-t border-border/60 bg-muted/20">
                        <span className="text-xs text-muted-foreground">
                            Page {currentPage} of {totalPages} · {filtered.length} blocks
                        </span>
                        <div className="flex gap-1">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
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
