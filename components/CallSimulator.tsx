"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/apiClient";
import { formatNumber } from "@/lib/format";
import { parseEther } from "viem";

interface SimEvent {
    address?: string;
    topics?: string[];
    contractName?: string | null;
    eventName?: string | null;
    args?: Record<string, unknown> | null;
}

interface SimResult {
    success?: boolean;
    error?: string | null;
    gasEstimate?: string | null;
    gasUsed?: string | null;
    returnData?: string | null;
    sstores?: { slot: string; value: string }[];
    events?: SimEvent[];
}

export function CallSimulator() {
    const [to, setTo] = useState("");
    const [from, setFrom] = useState("");
    const [data, setData] = useState("");
    const [value, setValue] = useState("0");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<SimResult | null>(null);

    const simulate = async () => {
        setLoading(true);
        setResult(null);
        try {
            // parseEther keeps full wei precision — float maths silently rounds.
            const weiValue = value.trim() ? parseEther(value.trim()) : 0n;
            const res = await api.post<SimResult>("/api/simulate", {
                to: to.trim(),
                from: from.trim() || undefined,
                data: data.trim() || "0x",
                value: `0x${weiValue.toString(16)}`,
            });
            setResult(res);
        } catch (e: unknown) {
            setResult({ success: false, error: e instanceof Error ? e.message : "Simulation failed" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">🧪 Simulate Call</span>
                </div>
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs">To (Contract)</Label>
                            <Input className="h-9 font-mono text-sm" placeholder="0x..." value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs">From (optional)</Label>
                            <Input className="h-9 font-mono text-sm" placeholder="0x..." value={from} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs">Calldata (hex)</Label>
                        <Input className="h-9 font-mono text-sm" placeholder="0x..." value={data} onChange={(e) => setData(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-muted-foreground text-xs">Value (ETH)</Label>
                        <Input className="h-9 text-sm" value={value} onChange={(e) => setValue(e.target.value)} />
                    </div>
                    <Button size="sm" onClick={simulate} disabled={loading || !to}>
                        {loading ? "Simulating…" : "Simulate"}
                    </Button>
                </div>
            </div>

            {result && (
                <div className={`rounded-xl border bg-card overflow-hidden ${result.success ? "border-green-500/30" : "border-red-500/30"
                    }`}>
                    <div className={`px-5 py-3.5 border-b flex items-center gap-3 ${result.success ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                        }`}>
                        <span className="text-sm font-semibold text-foreground">Result</span>
                        <Badge variant={result.success ? "default" : "destructive"} className={`text-xs ${result.success ? "bg-green-500/20 text-green-400 border border-green-500/30" : ""
                            }`}>
                            {result.success ? "✓ Would succeed" : "✗ Would revert"}
                        </Badge>
                    </div>
                    <div className="p-4 space-y-2 text-xs font-mono">
                        {result.error && <p className="text-red-400">{result.error}</p>}
                        {result.gasEstimate && (
                            <p className="text-muted-foreground">Gas estimate: <span className="text-foreground">{formatNumber(result.gasEstimate)}</span></p>
                        )}
                        {result.gasUsed && (
                            <p className="text-muted-foreground">Gas used: <span className="text-foreground">{formatNumber(result.gasUsed)}</span></p>
                        )}
                        {result.returnData && result.returnData !== "0x" && (
                            <p className="text-muted-foreground">Return data: <span className="text-emerald-400 break-all">{result.returnData}</span></p>
                        )}
                        {result.sstores && result.sstores.length > 0 && (
                            <div>
                                <p className="text-orange-400 font-semibold mb-1">Storage writes:</p>
                                {result.sstores.map((s, i) => (
                                    <p key={i} className="text-muted-foreground">
                                        slot[<span className="text-foreground">{s.slot}</span>] = <span className="text-yellow-400">{s.value}</span>
                                    </p>
                                ))}
                            </div>
                        )}
                        {result.events && result.events.length > 0 && (
                            <div>
                                <p className="text-blue-400 font-semibold mb-1">Events emitted: {result.events.length}</p>
                                {result.events.slice(0, 5).map((e, i) => (
                                    <p key={i} className="text-muted-foreground truncate">
                                        {e.eventName
                                            ? <span className="text-foreground">{e.contractName ? `${e.contractName}.` : ""}{e.eventName}</span>
                                            : <span>{e.topics?.[0]?.slice(0, 18)}…</span>}
                                        {e.args && <span className="ml-1 opacity-70">{JSON.stringify(e.args)}</span>}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
