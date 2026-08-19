"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
    ArrowLeft, Hash, Layers, Clock, Fuel,
    ArrowRight, User, ExternalLink, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButton, DetailRow, Panel } from "@/components/ui/detail-row";
import { rpcCall } from "@/lib/apiClient";
import { useAsyncData } from "@/lib/hooks";
import { formatEth, formatGwei, formatNumber, formatTimestamp, hexToInt, truncateHex } from "@/lib/format";

interface BlockTx { hash: string; from: string; to?: string | null; value: string; gas?: string }

interface BlockData {
    number: string;
    hash: string;
    parentHash: string;
    timestamp: string;
    gasUsed: string;
    gasLimit: string;
    baseFeePerGas?: string;
    miner?: string;
    difficulty?: string;
    extraData?: string;
    transactions?: BlockTx[];
}

function gasRatio(used: string, limit: string): string {
    const u = hexToInt(used);
    const l = hexToInt(limit);
    if (!l) return "—";
    return `${u.toLocaleString()} / ${l.toLocaleString()} (${((u / l) * 100).toFixed(2)}%)`;
}

export default function BlockDetailPage() {
    const params = useParams();
    const numStr = params.number as string;
    const blockTag = /^\d+$/.test(numStr) ? `0x${parseInt(numStr, 10).toString(16)}` : numStr;

    const { data: block, loading, error } = useAsyncData<BlockData | null>(
        async () => {
            const result = await rpcCall<BlockData | null>("eth_getBlockByNumber", [blockTag, true]);
            if (!result) throw new Error(`Block ${numStr} not found`);
            return result;
        },
        [blockTag],
        null
    );

    if (loading || error || !block) {
        return (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto">
                <BackLink />
                <div className={`rounded-xl border border-border bg-card p-8 text-center text-sm ${loading ? "text-muted-foreground animate-pulse" : "text-red-400"}`}>
                    {loading ? `Loading block ${numStr}…` : error ?? "Block not found"}
                </div>
            </div>
        );
    }

    const txs = block.transactions ?? [];
    const blockNumber = hexToInt(block.number);
    const ts = hexToInt(block.timestamp);

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
            <BackLink />

            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground mb-0.5">Block #{formatNumber(blockNumber)}</h1>
                    <p className="text-muted-foreground text-xs">{formatTimestamp(ts)}</p>
                </div>
                <div className="flex gap-1">
                    {blockNumber > 0 && (
                        <Link
                            href={`/blocks/${blockNumber - 1}`}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        >
                            <ChevronLeft className="w-3.5 h-3.5" /> Prev
                        </Link>
                    )}
                    <Link
                        href={`/blocks/${blockNumber + 1}`}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                        Next <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </div>

            <Panel title="Overview">
                <div className="px-5 pb-1">
                    <DetailRow label="Block Height" icon={<Layers className="w-3.5 h-3.5" />}>
                        <span className="text-foreground font-semibold">{formatNumber(blockNumber)}</span>
                    </DetailRow>

                    <DetailRow label="Timestamp" icon={<Clock className="w-3.5 h-3.5" />}>
                        <span className="text-foreground">{formatTimestamp(ts)}</span>
                        <span className="ml-2 text-muted-foreground text-xs">({ts})</span>
                    </DetailRow>

                    <DetailRow label="Transactions" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                        <Badge variant="secondary" className="text-xs">
                            {txs.length} transaction{txs.length === 1 ? "" : "s"}
                        </Badge>
                    </DetailRow>

                    <DetailRow label="Block Hash" icon={<Hash className="w-3.5 h-3.5" />}>
                        <span className="text-emerald-400">{block.hash}</span>
                        <CopyButton text={block.hash} />
                    </DetailRow>

                    <DetailRow label="Parent Hash" icon={<Hash className="w-3.5 h-3.5" />}>
                        {blockNumber > 0 ? (
                            <span className="inline-flex items-center gap-1">
                                <Link href={`/blocks/${blockNumber - 1}`} className="text-primary hover:underline">
                                    {block.parentHash}
                                </Link>
                                <CopyButton text={block.parentHash} />
                            </span>
                        ) : (
                            <span className="text-muted-foreground">{block.parentHash}</span>
                        )}
                    </DetailRow>

                    <DetailRow label="Miner / Coinbase" icon={<User className="w-3.5 h-3.5" />}>
                        {block.miner ? (
                            <span className="inline-flex items-center gap-1">
                                <Link href={`/accounts/${block.miner}`} className="text-primary hover:underline">{block.miner}</Link>
                                <CopyButton text={block.miner} />
                            </span>
                        ) : "—"}
                    </DetailRow>

                    <DetailRow label="Gas Used / Limit" icon={<Fuel className="w-3.5 h-3.5" />}>
                        <span className="text-foreground">{gasRatio(block.gasUsed, block.gasLimit)}</span>
                    </DetailRow>

                    <DetailRow label="Base Fee">
                        <span className="text-foreground">{block.baseFeePerGas ? formatGwei(block.baseFeePerGas, 4) : "—"}</span>
                    </DetailRow>

                    {block.difficulty && block.difficulty !== "0x0" && (
                        <DetailRow label="Difficulty">
                            <span className="text-muted-foreground">{formatNumber(block.difficulty)}</span>
                        </DetailRow>
                    )}

                    <DetailRow label="Extra Data">
                        <span className="text-muted-foreground text-xs">{block.extraData ?? "0x"}</span>
                    </DetailRow>
                </div>
            </Panel>

            {txs.length > 0 && (
                <Panel
                    title="Transactions"
                    action={<Badge variant="secondary" className="text-xs">{txs.length}</Badge>}
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs font-mono">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border/60">
                                    <th className="text-left px-5 py-2.5 font-medium">Tx Hash</th>
                                    <th className="text-left px-4 py-2.5 font-medium">From</th>
                                    <th className="text-left px-4 py-2.5 font-medium">To</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Value</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Gas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {txs.map((tx, i) => (
                                    <tr key={tx.hash ?? i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-5 py-2.5">
                                            <Link href={`/tx/${tx.hash}`} className="text-primary hover:underline inline-flex items-center gap-1">
                                                {truncateHex(tx.hash, 8, 6)}
                                                <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <Link href={`/accounts/${tx.from}`} className="text-primary/80 hover:underline">
                                                {truncateHex(tx.from)}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {tx.to ? (
                                                <Link href={`/accounts/${tx.to}`} className="text-primary/80 hover:underline">
                                                    {truncateHex(tx.to)}
                                                </Link>
                                            ) : (
                                                <span className="text-amber-400">Contract Create</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-foreground">{formatEth(tx.value)} ETH</td>
                                        <td className="px-4 py-2.5 text-muted-foreground">{formatNumber(tx.gas)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}
        </div>
    );
}

function BackLink() {
    return (
        <Link href="/blocks" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Blocks
        </Link>
    );
}
