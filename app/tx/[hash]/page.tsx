"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useDevnetStore } from "@/store/useDevnetStore";
import { TxDebugger } from "@/components/TxDebugger";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Copy, Check, ExternalLink, Fuel, Hash, Layers, ArrowRight, FileCode } from "lucide-react";
import Link from "next/link";

function weiToEth(wei: string | null | undefined): string {
    if (!wei || wei === "0x0" || BigInt(wei) === 0n) return "0 ETH";
    try {
        const n = BigInt(wei);
        const eth = Number(n) / 1e18;
        return `${eth.toFixed(6)} ETH`;
    } catch {
        return `${wei} wei`;
    }
}

function parseGas(hex: string | null | undefined): string {
    if (!hex) return "—";
    try {
        return hex.startsWith("0x")
            ? parseInt(hex, 16).toLocaleString()
            : Number(hex).toLocaleString();
    } catch { return hex; }
}

function gasPercent(used: string | null, limit: string | null): string {
    if (!used || !limit) return "";
    try {
        const u = used.startsWith?.("0x") ? parseInt(used, 16) : Number(used);
        const l = limit.startsWith?.("0x") ? parseInt(limit, 16) : Number(limit);
        if (!l) return "";
        return ` (${((u / l) * 100).toFixed(2)}%)`;
    } catch { return ""; }
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

export default function TxDetailPage() {
    const params = useParams();
    const hash = params.hash as string;
    const { selectTx } = useDevnetStore();
    const [tx, setTx] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [showRawInput, setShowRawInput] = useState(false);

    useEffect(() => {
        if (hash) {
            selectTx(hash);
            fetch(`/api/tx/${hash}`)
                .then((r) => r.json())
                .then((data) => { if (data && !data.error) setTx(data); })
                .catch(() => { })
                .finally(() => setLoading(false));
        }
    }, [hash]);

    if (loading) {
        return (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto">
                <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                </Link>
                <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm animate-pulse">
                    Loading transaction…
                </div>
            </div>
        );
    }

    if (!tx) {
        return (
            <div className="p-4 sm:p-6 max-w-5xl mx-auto">
                <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm mb-6 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                </Link>
                <div className="rounded-xl border border-border bg-card p-8 text-center text-red-400 text-sm">
                    Transaction not found: <span className="break-all">{hash}</span>
                </div>
            </div>
        );
    }

    const isSuccess = tx.status === "success";
    const gasUsedNum = tx.gasUsed ? (tx.gasUsed.startsWith?.("0x") ? parseInt(tx.gasUsed, 16) : Number(tx.gasUsed)) : null;
    const gasLimitNum = tx.gas ? (tx.gas.startsWith?.("0x") ? parseInt(tx.gas, 16) : Number(tx.gas)) : null;
    const nonceNum = tx.nonce != null ? (typeof tx.nonce === "string" && tx.nonce.startsWith("0x") ? parseInt(tx.nonce, 16) : Number(tx.nonce)) : null;
    const hasInput = tx.input && tx.input !== "0x" && tx.input.length > 2;

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
            {/* Breadcrumb */}
            <Link href="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>

            {/* Header */}
            <div>
                <h1 className="text-xl font-semibold text-foreground mb-1">Transaction Details</h1>
                <p className="text-muted-foreground text-xs font-mono break-all">{hash}</p>
            </div>

            {/* Main Details Card */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">Overview</span>
                </div>
                <div className="px-5 pb-1">

                    <Row label="Transaction Hash" icon={<Hash className="w-3.5 h-3.5" />}>
                        <span className="text-green-400">{tx.hash}</span>
                        <CopyBtn text={tx.hash} />
                    </Row>

                    <Row label="Status" icon={<Check className="w-3.5 h-3.5" />}>
                        <Badge
                            variant={isSuccess ? "default" : "destructive"}
                            className={`text-xs px-2 py-0.5 ${isSuccess ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"}`}
                        >
                            {isSuccess ? "✓ Success" : "✗ Failed"}
                        </Badge>
                    </Row>

                    <Row label="Block" icon={<Layers className="w-3.5 h-3.5" />}>
                        {tx.blockNumber != null ? (
                            <Link
                                href={`/blocks/${tx.blockNumber}`}
                                className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                                {tx.blockNumber}
                                <ExternalLink className="w-3 h-3 opacity-60" />
                            </Link>
                        ) : "—"}
                    </Row>

                    <Row label="From" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                        {tx.from ? (
                            <span className="inline-flex items-center gap-1">
                                <Link href={`/accounts/${tx.from}`} className="text-blue-400 hover:underline">{tx.from}</Link>
                                <CopyBtn text={tx.from} />
                            </span>
                        ) : "—"}
                    </Row>

                    <Row label="To" icon={<ArrowRight className="w-3.5 h-3.5" />}>
                        {tx.to ? (
                            <span className="inline-flex items-center gap-1">
                                <Link href={`/accounts/${tx.to}`} className="text-blue-400 hover:underline">{tx.to}</Link>
                                <CopyBtn text={tx.to} />
                            </span>
                        ) : (
                            <span className="text-yellow-400">Contract Creation</span>
                        )}
                    </Row>

                    <Row label="Value" icon={<span className="text-xs font-bold">Ξ</span>}>
                        <span className="text-foreground font-semibold">{weiToEth(tx.value)}</span>
                        {tx.value && BigInt(tx.value) > 0n && (
                            <span className="ml-2 text-muted-foreground text-xs">({tx.value} wei)</span>
                        )}
                    </Row>

                    <Row label="Gas Limit & Usage" icon={<Fuel className="w-3.5 h-3.5" />}>
                        <span className="text-foreground">
                            {gasLimitNum != null ? gasLimitNum.toLocaleString() : "—"}
                            {" | "}
                            <span className={isSuccess ? "text-green-400" : "text-red-400"}>
                                {gasUsedNum != null ? gasUsedNum.toLocaleString() : "—"}
                            </span>
                            {gasLimitNum && gasUsedNum && (
                                <span className="ml-1 text-muted-foreground text-xs">
                                    {gasPercent(tx.gasUsed, tx.gas)}
                                </span>
                            )}
                        </span>
                    </Row>

                    {nonceNum != null && (
                        <Row label="Nonce">
                            <span className="text-muted-foreground">{nonceNum}</span>
                        </Row>
                    )}

                    {tx.decoded_function && (
                        <Row label="Method" icon={<FileCode className="w-3.5 h-3.5" />}>
                            <span className="inline-block bg-primary/15 text-primary border border-primary/25 rounded px-2 py-0.5 text-xs font-mono">
                                {tx.decoded_function}
                            </span>
                        </Row>
                    )}

                    {hasInput && (
                        <Row label="Input Data" icon={<FileCode className="w-3.5 h-3.5" />}>
                            <div className="space-y-2">
                                {tx.decoded_function && (
                                    <div className="text-xs text-muted-foreground">
                                        Function: <span className="text-primary">{tx.decoded_function}</span>
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowRawInput(!showRawInput)}
                                        className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 transition-colors"
                                    >
                                        {showRawInput ? "Hide" : "View"} Raw Input
                                    </button>
                                    <CopyBtn text={tx.input} />
                                </div>
                                {showRawInput && (
                                    <div className="rounded-lg bg-muted/40 border border-border p-3 max-h-40 overflow-y-auto">
                                        <pre className="text-xs text-green-300 break-all whitespace-pre-wrap font-mono">{tx.input}</pre>
                                    </div>
                                )}
                            </div>
                        </Row>
                    )}

                </div>
            </div>

            {/* EVM Debugger Card */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">EVM Debugger</span>
                </div>
                <div className="p-4">
                    <TxDebugger hash={hash} tx={tx} receipt={tx?.receipt ?? null} />
                </div>
            </div>
        </div>
    );
}
