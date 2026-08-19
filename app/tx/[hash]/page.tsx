"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, ExternalLink, Fuel, Hash, Layers, ArrowRight, FileCode, Clock } from "lucide-react";
import { useDevnetStore } from "@/store/useDevnetStore";
import { TxDebugger } from "@/components/TxDebugger";
import { Badge } from "@/components/ui/badge";
import { CopyButton, DetailRow, Panel } from "@/components/ui/detail-row";
import { api } from "@/lib/apiClient";
import { useAsyncData } from "@/lib/hooks";
import { formatEth, formatGwei, formatNumber, formatTimestamp, hexToInt } from "@/lib/format";

export interface TxDetail {
    hash: string;
    from: string;
    to: string | null;
    blockNumber: number | null;
    blockTimestamp: number | null;
    gas: string | null;
    gasUsed: string | null;
    gasPrice: string | null;
    value: string;
    input: string | null;
    nonce: number | null;
    status: "success" | "failed" | "pending";
    decoded_function: string | null;
    decoded_params: Record<string, unknown> | null;
    contractName: string | null;
    receipt: Record<string, unknown> | null;
}

export default function TxDetailPage() {
    const params = useParams();
    const hash = params.hash as string;
    const selectTx = useDevnetStore((s) => s.selectTx);
    const [showRawInput, setShowRawInput] = useState(false);

    useEffect(() => {
        if (hash) selectTx(hash);
    }, [hash, selectTx]);

    const { data: tx, loading, error } = useAsyncData<TxDetail | null>(
        () => api.get<TxDetail>(`/api/tx/${hash}`),
        [hash],
        null
    );

    if (loading || !tx) {
        return (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto">
                <BackLink />
                <div className={`rounded-xl border border-border bg-card p-8 text-center text-sm ${loading ? "text-muted-foreground animate-pulse" : "text-red-400"}`}>
                    {loading ? "Loading transaction…" : error ?? "Transaction not found"}
                    {!loading && <div className="mt-2 text-xs font-mono break-all text-muted-foreground">{hash}</div>}
                </div>
            </div>
        );
    }

    const isSuccess = tx.status === "success";
    const gasUsed = hexToInt(tx.gasUsed, -1);
    const gasLimit = hexToInt(tx.gas, -1);
    const gasPercent = gasUsed >= 0 && gasLimit > 0 ? ` (${((gasUsed / gasLimit) * 100).toFixed(2)}%)` : "";
    const hasInput = Boolean(tx.input && tx.input !== "0x" && tx.input.length > 2);
    const feeWei = gasUsed >= 0 && tx.gasPrice ? BigInt(gasUsed) * BigInt(tx.gasPrice) : null;

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
            <BackLink />

            <div>
                <h1 className="text-xl font-semibold text-foreground mb-1">Transaction Details</h1>
                <p className="text-muted-foreground text-xs font-mono break-all">{hash}</p>
            </div>

            <Panel title="Overview">
                <div className="px-5 pb-1">
                    <DetailRow label="Transaction Hash" icon={<Hash className="w-3.5 h-3.5" />}>
                        <span className="text-emerald-400">{tx.hash}</span>
                        <CopyButton text={tx.hash} />
                    </DetailRow>

                    <DetailRow label="Status" icon={<Check className="w-3.5 h-3.5" />}>
                        <Badge
                            variant={isSuccess ? "default" : "destructive"}
                            className={`text-xs px-2 py-0.5 ${isSuccess
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-red-500/20 text-red-400 border border-red-500/30"}`}
                        >
                            {isSuccess ? "✓ Success" : tx.status === "pending" ? "⏳ Pending" : "✗ Failed"}
                        </Badge>
                    </DetailRow>

                    <DetailRow label="Block" icon={<Layers className="w-3.5 h-3.5" />}>
                        {tx.blockNumber != null ? (
                            <Link href={`/blocks/${tx.blockNumber}`} className="text-primary hover:underline inline-flex items-center gap-1">
                                {formatNumber(tx.blockNumber)}
                                <ExternalLink className="w-3 h-3 opacity-60" />
                            </Link>
                        ) : "—"}
                    </DetailRow>

                    {tx.blockTimestamp != null && (
                        <DetailRow label="Timestamp" icon={<Clock className="w-3.5 h-3.5" />}>
                            <span className="text-foreground">{formatTimestamp(tx.blockTimestamp)}</span>
                        </DetailRow>
                    )}

                    <DetailRow label="From" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                        {tx.from ? (
                            <span className="inline-flex items-center gap-1">
                                <Link href={`/accounts/${tx.from}`} className="text-primary hover:underline">{tx.from}</Link>
                                <CopyButton text={tx.from} />
                            </span>
                        ) : "—"}
                    </DetailRow>

                    <DetailRow label="To" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                        {tx.to ? (
                            <span className="inline-flex items-center gap-1">
                                <Link href={`/accounts/${tx.to}`} className="text-primary hover:underline">{tx.to}</Link>
                                {tx.contractName && (
                                    <span className="text-muted-foreground text-xs">({tx.contractName})</span>
                                )}
                                <CopyButton text={tx.to} />
                            </span>
                        ) : (
                            <span className="text-amber-400">Contract Creation</span>
                        )}
                    </DetailRow>

                    <DetailRow label="Value" icon={<span className="text-xs font-bold">Ξ</span>}>
                        <span className="text-foreground font-semibold">{formatEth(tx.value, 9)} ETH</span>
                    </DetailRow>

                    <DetailRow label="Gas Limit & Usage" icon={<Fuel className="w-3.5 h-3.5" />}>
                        <span className="text-foreground">
                            {gasLimit >= 0 ? gasLimit.toLocaleString() : "—"}
                            {" | "}
                            <span className={isSuccess ? "text-emerald-400" : "text-red-400"}>
                                {gasUsed >= 0 ? gasUsed.toLocaleString() : "—"}
                            </span>
                            <span className="ml-1 text-muted-foreground text-xs">{gasPercent}</span>
                        </span>
                    </DetailRow>

                    {tx.gasPrice && (
                        <DetailRow label="Gas Price">
                            <span className="text-foreground">{formatGwei(tx.gasPrice, 4)}</span>
                            {feeWei !== null && (
                                <span className="ml-2 text-muted-foreground text-xs">fee {formatEth(feeWei, 9)} ETH</span>
                            )}
                        </DetailRow>
                    )}

                    {tx.nonce != null && (
                        <DetailRow label="Nonce">
                            <span className="text-muted-foreground">{tx.nonce}</span>
                        </DetailRow>
                    )}

                    {tx.decoded_function && (
                        <DetailRow label="Method" icon={<FileCode className="w-3.5 h-3.5" />}>
                            <span className="inline-block bg-primary/15 text-primary border border-primary/25 rounded px-2 py-0.5 text-xs font-mono">
                                {tx.decoded_function}
                            </span>
                        </DetailRow>
                    )}

                    {tx.decoded_params && (
                        <DetailRow label="Decoded Params">
                            <pre className="rounded-lg bg-muted/40 border border-border p-3 text-xs overflow-x-auto">
                                {JSON.stringify(tx.decoded_params, null, 2)}
                            </pre>
                        </DetailRow>
                    )}

                    {hasInput && tx.input && (
                        <DetailRow label="Input Data" icon={<FileCode className="w-3.5 h-3.5" />}>
                            <div className="space-y-2">
                                <div className="flex gap-2 items-center">
                                    <button
                                        onClick={() => setShowRawInput((v) => !v)}
                                        className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 transition-colors"
                                    >
                                        {showRawInput ? "Hide" : "View"} Raw Input
                                    </button>
                                    <CopyButton text={tx.input} label="Copy input data" />
                                </div>
                                {showRawInput && (
                                    <div className="rounded-lg bg-muted/40 border border-border p-3 max-h-40 overflow-y-auto">
                                        <pre className="text-xs text-emerald-300 break-all whitespace-pre-wrap font-mono">{tx.input}</pre>
                                    </div>
                                )}
                            </div>
                        </DetailRow>
                    )}
                </div>
            </Panel>

            <Panel title="EVM Debugger">
                <div className="p-4">
                    <TxDebugger hash={hash} tx={tx} />
                </div>
            </Panel>
        </div>
    );
}

function BackLink() {
    return (
        <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
    );
}
