"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft, Copy, Check, Hash, Layers, Clock, Fuel,
    ArrowRight, User, ExternalLink, ChevronLeft, ChevronRight,
} from "lucide-react";
import Link from "next/link";

interface BlockTx { hash: string; from: string; to?: string; value: string; gas?: string }
interface BlockData {
    number: string; hash: string; parentHash: string; timestamp: string;
    gasUsed: string; gasLimit: string; baseFeePerGas?: string;
    miner?: string; difficulty?: string; extraData?: string;
    transactions?: BlockTx[];
}

function CopyBtn({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
        >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
    );
}

function Row({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
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

function parseHex(h: string | null | undefined): number {
    if (!h) return 0;
    return parseInt(h, 16);
}

function formatGasRatio(used: string, limit: string) {
    const u = parseHex(used);
    const l = parseHex(limit);
    if (!l) return "—";
    const pct = ((u / l) * 100).toFixed(2);
    return `${u.toLocaleString()} / ${l.toLocaleString()} (${pct}%)`;
}

function truncate(s: string, n = 10) {
    if (!s || s.length <= 14) return s;
    return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function weiToEth(hex: string | null | undefined): string {
    if (!hex || hex === "0x0") return "0 ETH";
    try {
        return `${(Number(BigInt(hex)) / 1e18).toFixed(9)} ETH`;
    } catch { return hex; }
}

export default function BlockDetailPage() {
    const params = useParams();
    const numStr = params.number as string;
    const blockNum = /^\d+$/.test(numStr) ? `0x${parseInt(numStr, 10).toString(16)}` : numStr;

    const [block, setBlock] = useState<BlockData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!blockNum) return;
        setLoading(true);
        setError(null);
        fetch("/api/rpc", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_getBlockByNumber",
                params: [blockNum, true],
                id: 1,
            }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (data.error) setError(data.error.message ?? "RPC error");
                else if (!data.result) setError("Block not found");
                else setBlock(data.result);
            })
            .catch(() => setError("Failed to fetch block"))
            .finally(() => setLoading(false));
    }, [blockNum]);

    const blockNumber = block ? parseHex(block.number) : null;

    if (loading) {
        return (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto">
                <Link href="/blocks" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Blocks
                </Link>
                <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm animate-pulse">
                    Loading block {numStr}…
                </div>
            </div>
        );
    }

    if (error || !block) {
        return (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto">
                <Link href="/blocks" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Blocks
                </Link>
                <div className="rounded-xl border border-border bg-card p-8 text-center text-red-400 text-sm">
                    {error ?? "Block not found"}
                </div>
            </div>
        );
    }

    const txs: BlockTx[] = block.transactions ?? [];
    const ts = parseHex(block.timestamp);
    const timeStr = ts ? new Date(ts * 1000).toLocaleString() : "—";
    const baseFeeGwei = block.baseFeePerGas
        ? (Number(BigInt(block.baseFeePerGas)) / 1e9).toFixed(4) + " Gwei"
        : "—";

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
            {/* Breadcrumb */}
            <Link href="/blocks" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Blocks
            </Link>

            {/* Header + prev/next nav */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground mb-0.5">Block #{numStr}</h1>
                    <p className="text-muted-foreground text-xs">Devnet • {timeStr}</p>
                </div>
                <div className="flex gap-1">
                    {blockNumber != null && blockNumber > 0 && (
                        <Link href={`/blocks/${blockNumber - 1}`}>
                            <button className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                                <ChevronLeft className="w-3.5 h-3.5" /> Prev
                            </button>
                        </Link>
                    )}
                    <Link href={`/blocks/${(blockNumber ?? 0) + 1}`}>
                        <button className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                            Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </Link>
                </div>
            </div>

            {/* Overview */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">Overview</span>
                </div>
                <div className="px-5 pb-1">

                    <Row label="Block Height" icon={<Layers className="w-3.5 h-3.5" />}>
                        <span className="text-foreground font-semibold">{blockNumber?.toLocaleString()}</span>
                    </Row>

                    <Row label="Timestamp" icon={<Clock className="w-3.5 h-3.5" />}>
                        <span className="text-foreground">{timeStr}</span>
                        <span className="ml-2 text-muted-foreground text-xs">({ts})</span>
                    </Row>

                    <Row label="Transactions" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                        <span className="inline-flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">{txs.length} transaction{txs.length !== 1 ? "s" : ""}</Badge>
                            {txs.length > 0 && (
                                <span className="text-muted-foreground text-xs">in this block</span>
                            )}
                        </span>
                    </Row>

                    <Row label="Block Hash" icon={<Hash className="w-3.5 h-3.5" />}>
                        <span className="text-green-400">{block.hash}</span>
                        <CopyBtn text={block.hash} />
                    </Row>

                    <Row label="Parent Hash" icon={<Hash className="w-3.5 h-3.5" />}>
                        {blockNumber && blockNumber > 0 ? (
                            <span className="inline-flex items-center gap-1">
                                <Link href={`/blocks/${blockNumber - 1}`} className="text-primary hover:underline">
                                    {block.parentHash}
                                </Link>
                                <CopyBtn text={block.parentHash} />
                            </span>
                        ) : (
                            <span className="text-muted-foreground">{block.parentHash}</span>
                        )}
                    </Row>

                    <Row label="Miner / Coinbase" icon={<User className="w-3.5 h-3.5" />}>
                        {block.miner ? (
                            <span className="inline-flex items-center gap-1">
                                <Link href={`/accounts/${block.miner}`} className="text-blue-400 hover:underline">
                                    {block.miner}
                                </Link>
                                <CopyBtn text={block.miner} />
                            </span>
                        ) : "—"}
                    </Row>

                    <Row label="Gas Used / Limit" icon={<Fuel className="w-3.5 h-3.5" />}>
                        <span className="text-foreground">{formatGasRatio(block.gasUsed, block.gasLimit)}</span>
                    </Row>

                    <Row label="Base Fee">
                        <span className="text-foreground">{baseFeeGwei}</span>
                    </Row>

                    {block.difficulty && block.difficulty !== "0x0" && (
                        <Row label="Difficulty">
                            <span className="text-muted-foreground">{parseHex(block.difficulty).toLocaleString()}</span>
                        </Row>
                    )}

                    <Row label="Extra Data">
                        <span className="text-muted-foreground text-xs">{block.extraData ?? "0x"}</span>
                    </Row>

                </div>
            </div>

            {/* Transactions */}
            {txs.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-5 py-4 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                        <span className="text-sm font-semibold text-foreground">Transactions</span>
                        <Badge variant="secondary" className="text-xs">{txs.length}</Badge>
                    </div>
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
                                                {truncate(tx.hash)}
                                                <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <Link href={`/accounts/${tx.from}`} className="text-blue-400 hover:underline">
                                                {truncate(tx.from)}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {tx.to ? (
                                                <Link href={`/accounts/${tx.to}`} className="text-blue-400 hover:underline">
                                                    {truncate(tx.to)}
                                                </Link>
                                            ) : (
                                                <span className="text-yellow-400">Contract Create</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5 text-foreground">{weiToEth(tx.value)}</td>
                                        <td className="px-4 py-2.5 text-muted-foreground">
                                            {tx.gas ? parseHex(tx.gas).toLocaleString() : "—"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
