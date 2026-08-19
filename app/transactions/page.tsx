"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Clock, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useDevnetStore } from "@/store/useDevnetStore";
import { useProjectStore } from "@/store/useProjectStore";
import { explorer } from "@/lib/apiClient";
import { useAsyncData } from "@/lib/hooks";
import { formatEth, formatNumber, timeAgo, truncateHex } from "@/lib/format";

interface TxRow {
    hash: string;
    block_number: number;
    block_timestamp: number;
    from_address: string;
    to_address: string | null;
    value: string;
    gas_used: string | null;
    status: number;
    decoded_function: string | null;
    input: string | null;
}

const PAGE_SIZE = 25;

export default function TransactionsPage() {
    const { nodeStatus, latestBlock, chainId } = useDevnetStore();
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const [filter, setFilter] = useState("");
    const [page, setPage] = useState(1);

    const { data, loading, error } = useAsyncData(
        () => explorer<TxRow[]>(`module=tx&action=getrecentlist&limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`, []),
        [page, latestBlock, nodeStatus, chainId, activeProjectId],
        { result: [] as TxRow[], total: null as number | null }
    );

    const txs = data.result;
    const total = data.total ?? txs.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const term = filter.trim().toLowerCase();
    const visible = term
        ? txs.filter((t) =>
            t.hash.toLowerCase().includes(term) ||
            t.from_address?.toLowerCase().includes(term) ||
            t.to_address?.toLowerCase().includes(term) ||
            t.decoded_function?.toLowerCase().includes(term))
        : txs;

    return (
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-violet-400/10 border border-violet-400/20">
                        <ArrowRightLeft className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-foreground font-bold text-lg">Transactions</h1>
                        <p className="text-muted-foreground text-xs font-mono">
                            Chain <span className="text-primary">{chainId}</span>
                            {nodeStatus === "running" && <span className="ml-2 text-emerald-400">● Live</span>}
                        </p>
                    </div>
                </div>
                <Badge variant="secondary" className="font-mono text-xs">{formatNumber(total)} transactions</Badge>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                    className="pl-9 bg-card border-border text-foreground placeholder:text-muted-foreground/60 h-9 text-xs font-mono rounded-xl"
                    placeholder="Filter this page by hash, address, or method…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                        <thead>
                            <tr className="border-b border-border bg-accent/30 text-muted-foreground">
                                <th className="text-left px-4 py-2.5 font-medium">Tx Hash</th>
                                <th className="text-left px-4 py-2.5 font-medium">Block</th>
                                <th className="text-left px-4 py-2.5 font-medium">Age</th>
                                <th className="text-left px-4 py-2.5 font-medium">From</th>
                                <th className="text-left px-4 py-2.5 font-medium">To</th>
                                <th className="text-left px-4 py-2.5 font-medium">Method</th>
                                <th className="text-right px-4 py-2.5 font-medium">Value</th>
                                <th className="text-right px-4 py-2.5 font-medium">Gas Used</th>
                                <th className="text-center px-4 py-2.5 font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                <EmptyRow>Loading…</EmptyRow>
                            ) : error ? (
                                <EmptyRow>Could not load transactions: {error}</EmptyRow>
                            ) : visible.length === 0 ? (
                                <EmptyRow>
                                    <div className="flex flex-col items-center gap-2">
                                        <ArrowRightLeft className="w-8 h-8 text-border" />
                                        <p>
                                            {term
                                                ? "No transactions match the filter."
                                                : nodeStatus === "running"
                                                    ? "No transactions yet. Send some ETH or deploy a contract."
                                                    : "Start Anvil to see transactions."}
                                        </p>
                                    </div>
                                </EmptyRow>
                            ) : (
                                visible.map((tx) => (
                                    <tr key={tx.hash} className="hover:bg-accent/30 transition-colors">
                                        <td className="px-4 py-2.5">
                                            <Link href={`/tx/${tx.hash}`} className="text-primary hover:underline">
                                                {truncateHex(tx.hash, 8, 6)}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <Link href={`/blocks/${tx.block_number}`} className="text-foreground/80 hover:text-primary">
                                                {tx.block_number}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {timeAgo(tx.block_timestamp)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-foreground/80">{truncateHex(tx.from_address)}</td>
                                        <td className="px-4 py-2.5">
                                            {tx.to_address
                                                ? <span className="text-foreground/80">{truncateHex(tx.to_address)}</span>
                                                : <span className="text-violet-400">Contract Creation</span>}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {tx.decoded_function ? (
                                                <span className="bg-violet-400/10 text-violet-400 px-1.5 py-0.5 rounded text-[10px]">
                                                    {tx.decoded_function}
                                                </span>
                                            ) : tx.input && tx.input.length > 2 ? (
                                                <span className="text-muted-foreground">{tx.input.slice(0, 10)}</span>
                                            ) : (
                                                <span className="text-muted-foreground">Transfer</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-foreground/80">{formatEth(tx.value, 4)} ETH</td>
                                        <td className="px-4 py-2.5 text-right text-muted-foreground">{formatNumber(tx.gas_used)}</td>
                                        <td className="px-4 py-2.5 text-center">
                                            <Badge
                                                variant={tx.status === 1 ? "default" : "destructive"}
                                                className="text-[10px] px-2 py-0 rounded-full"
                                            >
                                                {tx.status === 1 ? "✓" : "✗"}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-accent/10">
                        <span className="text-muted-foreground text-xs">
                            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {formatNumber(total)}
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1}
                                aria-label="Previous page"
                                className="p-1.5 rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-40 transition-colors"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-mono px-2 text-foreground">{page} / {totalPages}</span>
                            <button
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page >= totalPages}
                                aria-label="Next page"
                                className="p-1.5 rounded-lg border border-border bg-card hover:bg-accent disabled:opacity-40 transition-colors"
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
            <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">{children}</td>
        </tr>
    );
}
