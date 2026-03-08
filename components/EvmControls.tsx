"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

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
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
    };

    const increaseTime = async (seconds: number) => {
        try {
            await rpc("increaseTime", seconds);
            setStatus(`✓ Advanced time by ${seconds}s`);
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
    };

    const setNextTs = async () => {
        try {
            const ts = new Date(timeValue).getTime() / 1000;
            await rpc("setNextBlockTimestamp", Math.floor(ts));
            setStatus(`✓ Next block timestamp set`);
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
    };

    const toggleAutomine = async (val: boolean) => {
        try {
            await rpc("setAutomine", val);
            setAutomine(val);
            setStatus(`✓ Automine: ${val ? "ON" : "OFF"}`);
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
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
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
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
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
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
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
    };

    return (
        <div className="space-y-4">
            {/* Time Travel */}
            <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm">⏰ Time Travel</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {[60, 3600, 86400, 604800, 2592000].map((s) => (
                            <Button key={s} size="sm" variant="outline" onClick={() => increaseTime(s)} className="text-xs">
                                +{s >= 86400 ? `${s / 86400}d` : s >= 3600 ? `${s / 3600}h` : "1min"}
                            </Button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <Input
                            className="h-8 bg-gray-800 border-gray-600 text-white text-xs font-mono"
                            placeholder="seconds"
                            value={timeValue}
                            onChange={(e) => setTimeValue(e.target.value)}
                        />
                        <Button size="sm" onClick={() => increaseTime(parseInt(timeValue || "0"))}>
                            +Increase
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Mining */}
            <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm">⛏ Mining</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex gap-2 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => toggleAutomine(!automine)}>
                            {automine ? "⏸ Pause Auto" : "▶ Enable Auto"}
                        </Button>
                        {[1, 5, 10].map((n) => (
                            <Button key={n} size="sm" variant="outline" onClick={() => mine(n)} className="text-xs">
                                Mine {n}
                            </Button>
                        ))}
                        <Input
                            className="h-8 w-24 bg-gray-800 border-gray-600 text-white text-xs"
                            value={blocks}
                            onChange={(e) => setBlocks(e.target.value)}
                        />
                        <Button size="sm" onClick={() => mine(parseInt(blocks))}>Mine N</Button>
                    </div>
                </CardContent>
            </Card>

            {/* Impersonation */}
            <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm">🎭 Impersonation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    {activeImpersonation ? (
                        <div className="flex items-center gap-2">
                            <Badge className="bg-orange-700 text-white font-mono text-xs">
                                Active: {activeImpersonation.slice(0, 10)}…
                            </Badge>
                            <Button size="sm" variant="destructive" onClick={stopImpersonate}>Stop</Button>
                        </div>
                    ) : (
                        <div className="flex gap-2">
                            <Input
                                className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                placeholder="0x... address to impersonate"
                                value={impersonateAddr}
                                onChange={(e) => setImpersonateAddr(e.target.value)}
                            />
                            <Button size="sm" onClick={startImpersonate} disabled={!impersonateAddr}>
                                Start
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Zero Gas */}
            <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm">⛽ Gas Controls</CardTitle>
                </CardHeader>
                <CardContent>
                    <Button size="sm" variant="outline" onClick={setZeroGas}>
                        Zero Gas Mode
                    </Button>
                    <p className="text-gray-500 text-xs mt-1">Sets base fee + min gas to 0</p>
                </CardContent>
            </Card>

            {status && (
                <p className="text-green-400 text-xs font-mono">{status}</p>
            )}
        </div>
    );
}
