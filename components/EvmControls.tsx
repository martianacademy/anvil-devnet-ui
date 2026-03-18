"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function EvmControls() {
    const [timeValue, setTimeValue] = useState("");
    const [blocks, setBlocks] = useState("1");
    const [automine, setAutomine] = useState(true);
    const [miningInterval, setMiningInterval] = useState("2");
    const [impersonateAddr, setImpersonateAddr] = useState("");
    const [activeImpersonation, setActiveImpersonation] = useState<string | null>(null);
    const [status, setStatus] = useState("");

    const rpc = async (method: string, value?: number | boolean | string) => {
        const body: Record<string, unknown> = { action: method };
        if (value !== undefined) body.value = value;
        const res = await fetch("/api/anvil/time", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        return data;
    };

    const mine = async (n = 1) => {
        try {
            const r = await fetch("/api/anvil/mine", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blocks: n }),
            }).then((r) => r.json());
            setStatus(`✓ Mined to block #${r.blockNumber}`);
        } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`); }
    };

    const increaseTime = async (seconds: number) => {
        try {
            await rpc("increaseTime", seconds);
            setStatus(`✓ Advanced time by ${seconds}s`);
        } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`); }
    };

    const setNextTs = async () => {
        try {
            const ts = new Date(timeValue).getTime() / 1000;
            await rpc("setNextBlockTimestamp", Math.floor(ts));
            setStatus(`✓ Next block timestamp set`);
        } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`); }
    };

    const toggleAutomine = async (val: boolean) => {
        try {
            await rpc("setAutomine", val);
            setAutomine(val);
            setStatus(`✓ Automine: ${val ? "ON" : "OFF"}`);
        } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`); }
    };

    const setZeroGas = async () => {
        try {
            await fetch("/api/rpc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method: "anvil_setNextBlockBaseFeePerGas", params: ["0x0"], id: 1 }),
            });
            await fetch("/api/rpc", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method: "anvil_setMinGasPrice", params: ["0x0"], id: 1 }),
            });
            setStatus("✓ Zero gas mode enabled");
        } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`); }
    };

    const startImpersonate = async () => {
        try {
            await fetch("/api/anvil/impersonate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "start", address: impersonateAddr }),
            });
            setActiveImpersonation(impersonateAddr);
            setStatus(`✓ Impersonating ${impersonateAddr.slice(0, 10)}…`);
        } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`); }
    };

    const stopImpersonate = async () => {
        if (!activeImpersonation) return;
        try {
            await fetch("/api/anvil/impersonate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "stop", address: activeImpersonation }),
            });
            setActiveImpersonation(null);
            setStatus("✓ Stopped impersonation");
        } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`); }
    };

    return (
        <div className="space-y-4">

            {/* Time Travel */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">⏰ Time Travel</span>
                </div>
                <div className="p-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {[[60, "1min"], [3600, "1h"], [86400, "1d"], [604800, "7d"], [2592000, "30d"]].map(([s, label]) => (
                            <Button key={s} size="sm" variant="outline" onClick={() => increaseTime(s as number)} className="text-xs">
                                +{label}
                            </Button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <Input className="h-9 text-sm" placeholder="seconds" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} />
                        <Button size="sm" onClick={() => increaseTime(parseInt(timeValue || "0"))}>+Custom</Button>
                    </div>
                </div>
            </div>

            {/* Mining */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">⛏ Mining</span>
                </div>
                <div className="p-4 space-y-3">
                    <div className="flex gap-2 flex-wrap items-center">
                        <Button size="sm" variant="outline" onClick={() => toggleAutomine(!automine)} className="text-xs">
                            {automine ? "⏸ Pause Auto" : "▶ Enable Auto"}
                        </Button>
                        {[1, 5, 10].map((n) => (
                            <Button key={n} size="sm" variant="outline" onClick={() => mine(n)} className="text-xs">Mine {n}</Button>
                        ))}
                        <Input className="h-9 w-24 text-sm" value={blocks} onChange={(e) => setBlocks(e.target.value)} />
                        <Button size="sm" onClick={() => mine(parseInt(blocks))}>Mine N</Button>
                    </div>
                </div>
            </div>

            {/* Impersonation */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">🎭 Impersonation</span>
                </div>
                <div className="p-4">
                    {activeImpersonation ? (
                        <div className="flex items-center gap-3">
                            <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30 font-mono text-xs">
                                Active: {activeImpersonation.slice(0, 10)}…
                            </Badge>
                            <Button size="sm" variant="destructive" onClick={stopImpersonate}>Stop</Button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <Input className="h-9 font-mono text-sm flex-1" placeholder="0x... address to impersonate" value={impersonateAddr} onChange={(e) => setImpersonateAddr(e.target.value)} />
                            <Button size="sm" onClick={startImpersonate} disabled={!impersonateAddr}>Start</Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Gas Controls */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">⛽ Gas Controls</span>
                </div>
                <div className="p-4 space-y-2">
                    <Button size="sm" variant="outline" onClick={setZeroGas}>Zero Gas Mode</Button>
                    <p className="text-muted-foreground text-xs">Sets base fee + min gas to 0</p>
                </div>
            </div>

            {status && (
                <div className={`rounded-lg px-3 py-2 text-xs font-mono border ${status.startsWith("Error")
                    ? "bg-red-500/10 border-red-500/30 text-red-400"
                    : "bg-green-500/10 border-green-500/30 text-green-400"
                    }`}>{status}</div>
            )}
        </div>
    );
}
