"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDevnetStore } from "@/store/useDevnetStore";

const DEFAULT_CONFIG = {
    chainId: 31337,
    port: 8545,
    blockTime: 2,
    accounts: 10,
    balance: 10000,
    baseFee: 0,
    stepsTracing: true,
    persistState: true,
    stateFile: "/tmp/anvil-devnet-state.json",
};

export function AnvilControls() {
    const { nodeStatus, setNodeStatus, setNodeConfig, setPort, setChainId } = useDevnetStore();
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [showConfig, setShowConfig] = useState(false);
    const [forkUrl, setForkUrl] = useState("");
    const [forkBlock, setForkBlock] = useState("");

    const start = async () => {
        setNodeStatus("starting");
        try {
            const body = {
                ...config,
                ...(forkUrl ? { forkUrl, forkBlockNumber: forkBlock ? parseInt(forkBlock) : undefined } : {}),
            };
            const res = await fetch("/api/anvil/start", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error((await res.json()).error);
            setNodeConfig(body);
            setPort(config.port);
            setChainId(config.chainId);
            setNodeStatus("running");
        } catch (err: any) {
            setNodeStatus("error");
            alert(`Failed to start: ${err.message}`);
        }
    };

    const stop = async () => {
        try {
            await fetch("/api/anvil/stop", { method: "POST" });
            setNodeStatus("stopped");
        } catch (err: any) {
            alert(`Stop failed: ${err.message}`);
        }
    };

    const statusColor = {
        stopped: "secondary",
        starting: "outline",
        running: "default",
        error: "destructive",
    } as const;

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-white text-sm font-mono">Anvil Control</CardTitle>
                    <Badge variant={statusColor[nodeStatus]}>{nodeStatus.toUpperCase()}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2">
                    <Button
                        size="sm"
                        onClick={start}
                        disabled={nodeStatus === "running" || nodeStatus === "starting"}
                        className="bg-green-700 hover:bg-green-600"
                    >
                        ▶ Start
                    </Button>
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={stop}
                        disabled={nodeStatus === "stopped"}
                    >
                        ■ Stop
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowConfig(!showConfig)}>
                        ⚙ Config
                    </Button>
                </div>

                {showConfig && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <Label className="text-gray-400">Chain ID</Label>
                            <Input
                                className="h-7 font-mono bg-gray-800 border-gray-600 text-white"
                                value={config.chainId}
                                onChange={(e) => setConfig({ ...config, chainId: parseInt(e.target.value) || 31337 })}
                            />
                        </div>
                        <div>
                            <Label className="text-gray-400">Port</Label>
                            <Input
                                className="h-7 font-mono bg-gray-800 border-gray-600 text-white"
                                value={config.port}
                                onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 8545 })}
                            />
                        </div>
                        <div>
                            <Label className="text-gray-400">Block Time (s)</Label>
                            <Input
                                className="h-7 font-mono bg-gray-800 border-gray-600 text-white"
                                value={config.blockTime}
                                onChange={(e) => setConfig({ ...config, blockTime: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div>
                            <Label className="text-gray-400">Accounts</Label>
                            <Input
                                className="h-7 font-mono bg-gray-800 border-gray-600 text-white"
                                value={config.accounts}
                                onChange={(e) => setConfig({ ...config, accounts: parseInt(e.target.value) || 10 })}
                            />
                        </div>
                        <div>
                            <Label className="text-gray-400">Balance (ETH)</Label>
                            <Input
                                className="h-7 font-mono bg-gray-800 border-gray-600 text-white"
                                value={config.balance}
                                onChange={(e) => setConfig({ ...config, balance: parseInt(e.target.value) || 10000 })}
                            />
                        </div>
                        <div>
                            <Label className="text-gray-400">Base Fee</Label>
                            <Input
                                className="h-7 font-mono bg-gray-800 border-gray-600 text-white"
                                value={config.baseFee}
                                onChange={(e) => setConfig({ ...config, baseFee: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="col-span-2">
                            <Label className="text-gray-400">Fork URL (optional)</Label>
                            <Input
                                className="h-7 font-mono bg-gray-800 border-gray-600 text-white"
                                placeholder="https://bsc-dataseed.binance.org"
                                value={forkUrl}
                                onChange={(e) => setForkUrl(e.target.value)}
                            />
                        </div>
                        {forkUrl && (
                            <div className="col-span-2">
                                <Label className="text-gray-400">Fork Block # (leave empty for latest)</Label>
                                <Input
                                    className="h-7 font-mono bg-gray-800 border-gray-600 text-white"
                                    placeholder="latest"
                                    value={forkBlock}
                                    onChange={(e) => setForkBlock(e.target.value)}
                                />
                            </div>
                        )}
                        <div className="col-span-2">
                            <Label className="text-gray-400">State File</Label>
                            <Input
                                className="h-7 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                value={config.stateFile}
                                onChange={(e) => setConfig({ ...config, stateFile: e.target.value })}
                            />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
