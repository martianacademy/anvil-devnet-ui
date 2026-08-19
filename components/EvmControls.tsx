"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { api, rpcCall } from "@/lib/apiClient";
import { useDevnetStore } from "@/store/useDevnetStore";

const TIME_PRESETS: [number, string][] = [
    [60, "1min"],
    [3600, "1h"],
    [86400, "1d"],
    [604800, "7d"],
    [2592000, "30d"],
];

export function EvmControls() {
    const { toast } = useToast();
    const setLatestBlock = useDevnetStore((s) => s.setLatestBlock);

    const [customSeconds, setCustomSeconds] = useState("");
    const [blocks, setBlocks] = useState("1");
    const [automine, setAutomine] = useState(true);
    const [intervalSecs, setIntervalSecs] = useState("2");
    const [impersonateAddr, setImpersonateAddr] = useState("");
    const [activeImpersonation, setActiveImpersonation] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    /** Every control funnels through here so errors always surface as a toast. */
    const run = async (label: string, fn: () => Promise<string | void>) => {
        setBusy(true);
        try {
            const detail = await fn();
            toast(detail || label, "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : `${label} failed`, "error");
        } finally {
            setBusy(false);
        }
    };

    const timeAction = (action: string, value: number | boolean) =>
        api.post<{ blockNumber?: number }>("/api/anvil/time", { action, value });

    const mine = (count: number) =>
        run(`Mined ${count} block${count === 1 ? "" : "s"}`, async () => {
            const res = await api.post<{ blockNumber: number }>("/api/anvil/mine", { blocks: count });
            setLatestBlock(res.blockNumber);
            return `Mined ${count} block${count === 1 ? "" : "s"} → #${res.blockNumber}`;
        });

    const increaseTime = (seconds: number) =>
        run(`Advanced time by ${seconds}s`, async () => {
            const res = await timeAction("increaseTime", seconds);
            if (res.blockNumber !== undefined) setLatestBlock(res.blockNumber);
            return `Advanced chain time by ${seconds}s`;
        });

    const toggleAutomine = (value: boolean) =>
        run("Automine updated", async () => {
            await timeAction("setAutomine", value);
            setAutomine(value);
            return `Automine ${value ? "enabled" : "paused"}`;
        });

    const setIntervalMining = () =>
        run("Interval mining updated", async () => {
            const seconds = Number(intervalSecs);
            if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Interval must be a positive number of seconds");
            await timeAction("setIntervalMining", seconds);
            return seconds === 0 ? "Interval mining disabled" : `Mining every ${seconds}s`;
        });

    const setZeroGas = () =>
        run("Zero gas mode enabled", async () => {
            await rpcCall("anvil_setNextBlockBaseFeePerGas", ["0x0"]);
            await rpcCall("anvil_setMinGasPrice", ["0x0"]).catch(() => {
                // Removed in newer anvil builds — base fee alone is enough there.
            });
            return "Base fee and min gas price set to 0";
        });

    const startImpersonate = () =>
        run("Impersonation started", async () => {
            const address = impersonateAddr.trim();
            await api.post("/api/anvil/impersonate", { action: "start", address });
            setActiveImpersonation(address);
            return `Impersonating ${address.slice(0, 10)}…`;
        });

    const stopImpersonate = () =>
        run("Impersonation stopped", async () => {
            if (!activeImpersonation) return;
            await api.post("/api/anvil/impersonate", { action: "stop", address: activeImpersonation });
            setActiveImpersonation(null);
            return "Stopped impersonation";
        });

    return (
        <div className="space-y-4">
            <Section title="⏰ Time Travel">
                <div className="flex flex-wrap gap-2">
                    {TIME_PRESETS.map(([seconds, label]) => (
                        <Button key={label} size="sm" variant="outline" disabled={busy} onClick={() => increaseTime(seconds)} className="text-xs">
                            +{label}
                        </Button>
                    ))}
                </div>
                <div className="flex gap-2">
                    <Input
                        className="h-9 text-sm"
                        placeholder="seconds"
                        value={customSeconds}
                        onChange={(e) => setCustomSeconds(e.target.value)}
                    />
                    <Button
                        size="sm"
                        disabled={busy || !customSeconds.trim()}
                        onClick={() => increaseTime(parseInt(customSeconds, 10) || 0)}
                    >
                        +Custom
                    </Button>
                </div>
            </Section>

            <Section title="⛏ Mining">
                <div className="flex gap-2 flex-wrap items-center">
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => toggleAutomine(!automine)} className="text-xs">
                        {automine ? "⏸ Pause Auto" : "▶ Enable Auto"}
                    </Button>
                    {[1, 5, 10].map((n) => (
                        <Button key={n} size="sm" variant="outline" disabled={busy} onClick={() => mine(n)} className="text-xs">
                            Mine {n}
                        </Button>
                    ))}
                    <Input className="h-9 w-24 text-sm" value={blocks} onChange={(e) => setBlocks(e.target.value)} />
                    <Button size="sm" disabled={busy} onClick={() => mine(parseInt(blocks, 10) || 1)}>Mine N</Button>
                </div>
                <div className="flex gap-2 items-center">
                    <span className="text-muted-foreground text-xs">Interval mining</span>
                    <Input className="h-9 w-24 text-sm" value={intervalSecs} onChange={(e) => setIntervalSecs(e.target.value)} />
                    <span className="text-muted-foreground text-xs">seconds (0 = off)</span>
                    <Button size="sm" variant="outline" disabled={busy} onClick={setIntervalMining} className="text-xs">Apply</Button>
                </div>
            </Section>

            <Section title="🎭 Impersonation">
                {activeImpersonation ? (
                    <div className="flex items-center gap-3">
                        <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30 font-mono text-xs">
                            Active: {activeImpersonation.slice(0, 10)}…
                        </Badge>
                        <Button size="sm" variant="destructive" disabled={busy} onClick={stopImpersonate}>Stop</Button>
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <Input
                            className="h-9 font-mono text-sm flex-1"
                            placeholder="0x… address to impersonate"
                            value={impersonateAddr}
                            onChange={(e) => setImpersonateAddr(e.target.value)}
                        />
                        <Button size="sm" disabled={busy || !impersonateAddr.trim()} onClick={startImpersonate}>Start</Button>
                    </div>
                )}
            </Section>

            <Section title="⛽ Gas Controls">
                <Button size="sm" variant="outline" disabled={busy} onClick={setZeroGas}>Zero Gas Mode</Button>
                <p className="text-muted-foreground text-xs">Sets the next block&apos;s base fee and the min gas price to 0.</p>
            </Section>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/60 bg-muted/30">
                <span className="text-sm font-semibold text-foreground">{title}</span>
            </div>
            <div className="p-4 space-y-3">{children}</div>
        </div>
    );
}
