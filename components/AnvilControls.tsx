"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useDevnetStore } from "@/store/useDevnetStore";

// ── well-known chains pinned at top ──────────────────────────────────────────
const PINNED_CHAINS = [
    { chainId: 31337, name: "Anvil (Default)" },
    { chainId: 1, name: "Ethereum Mainnet" },
    { chainId: 56, name: "BNB Smart Chain" },
    { chainId: 137, name: "Polygon" },
    { chainId: 42161, name: "Arbitrum One" },
    { chainId: 10, name: "Optimism" },
    { chainId: 8453, name: "Base" },
    { chainId: 43114, name: "Avalanche C-Chain" },
    { chainId: 250, name: "Fantom Opera" },
    { chainId: 100, name: "Gnosis" },
];

interface ChainEntry { chainId: number; name: string }

const DEFAULT_CHAIN_ID = 31337;

const DEFAULT_CONFIG = {
    chainId: DEFAULT_CHAIN_ID,
    port: 8545,
    blockTime: 2,
    accounts: 10,
    balance: 10000,
    baseFee: 0,
    stepsTracing: true,
    persistState: true,
    stateFile: `/tmp/anvil-state-${DEFAULT_CHAIN_ID}.json`,
};

export function AnvilControls() {
    const { nodeStatus, nodeConfig, setNodeStatus, setNodeConfig, setPort, setChainId, saveChainSnapshot } =
        useDevnetStore();

    // Init from stored nodeConfig so chain selection survives dropdown close/reopen
    const [config, setConfig] = useState(() => {
        const nc = useDevnetStore.getState().nodeConfig;
        const cid = nc.chainId ?? DEFAULT_CHAIN_ID;
        return {
            chainId: cid,
            port: nc.port ?? 8545,
            blockTime: nc.blockTime ?? 2,
            accounts: nc.accounts ?? 10,
            balance: nc.balance ?? 10000,
            baseFee: nc.baseFee ?? 0,
            stepsTracing: nc.stepsTracing ?? true,
            persistState: nc.persistState ?? true,
            stateFile: nc.stateFile ?? `/tmp/anvil-state-${cid}.json`,
        };
    });
    const [showConfig, setShowConfig] = useState(false);
    const [forkUrl, setForkUrl] = useState("");
    const [forkBlock, setForkBlock] = useState("");

    // chain selector state
    const [chainOpen, setChainOpen] = useState(false);
    const [allChains, setAllChains] = useState<ChainEntry[]>([]);
    const [chainsLoading, setChainsLoading] = useState(false);
    const [chainsFetched, setChainsFetched] = useState(false);
    const [isCustom, setIsCustom] = useState(false);
    const [customInput, setCustomInput] = useState("");

    // Fetch chainlist on first open
    useEffect(() => {
        if (!chainOpen || chainsFetched) return;
        setChainsLoading(true);
        fetch("https://chainid.network/chains.json")
            .then((r) => r.json())
            .then((data: { chainId: number; name: string }[]) => {
                setAllChains(data.map((c) => ({ chainId: c.chainId, name: c.name })).sort((a, b) => a.chainId - b.chainId));
                setChainsFetched(true);
            })
            .catch(() => setChainsFetched(true))
            .finally(() => setChainsLoading(false));
    }, [chainOpen, chainsFetched]);

    const pinnedIds = useMemo(() => new Set(PINNED_CHAINS.map((c) => c.chainId)), []);
    const otherChains = useMemo(() => allChains.filter((c) => !pinnedIds.has(c.chainId)), [allChains, pinnedIds]);

    const applyChainId = (cid: number) => {
        const updated = { ...config, chainId: cid, stateFile: `/tmp/anvil-state-${cid}.json` };
        setConfig(updated);
        // Persist to store immediately so it survives dropdown close/reopen
        setNodeConfig({ chainId: cid, stateFile: updated.stateFile });
        setIsCustom(false);
        setChainOpen(false);
    };

    const selectedLabel = useMemo(() => {
        if (isCustom) return config.chainId ? `Custom — ${config.chainId}` : "Custom";
        const pinned = PINNED_CHAINS.find((c) => c.chainId === config.chainId);
        if (pinned) return `${pinned.name} (${config.chainId})`;
        const found = allChains.find((c) => c.chainId === config.chainId);
        if (found) return `${found.name} (${config.chainId})`;
        return `Chain ${config.chainId}`;
    }, [config.chainId, isCustom, allChains]);

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
            saveChainSnapshot();
            await fetch("/api/anvil/stop", { method: "POST" });
            setNodeStatus("stopped");
        } catch (err: any) {
            alert(`Stop failed: ${err.message}`);
        }
    };

    const statusColor = { stopped: "secondary", starting: "outline", running: "default", error: "destructive" } as const;

    return (
        <Card className="bg-card border-border">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground text-sm font-mono">Anvil Control</CardTitle>
                    <Badge variant={statusColor[nodeStatus]}>{nodeStatus.toUpperCase()}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex gap-2">
                    <Button size="sm" onClick={start} disabled={nodeStatus === "running" || nodeStatus === "starting"} className="bg-green-700 hover:bg-green-600 text-white">
                        ▶ Start
                    </Button>
                    <Button size="sm" variant="destructive" onClick={stop} disabled={nodeStatus === "stopped"}>
                        ■ Stop
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setShowConfig(!showConfig)}>
                        ⚙ Config
                    </Button>
                </div>

                {showConfig && (
                    <div className="space-y-2 text-xs">

                        {/* ── Network / Chain selector ── */}
                        <div>
                            <Label className="text-muted-foreground mb-1 block">Network / Chain ID</Label>
                            <Popover open={chainOpen} onOpenChange={setChainOpen}>
                                <PopoverTrigger
                                    className="w-full flex items-center justify-between h-8 text-xs font-mono rounded-md border border-border bg-input px-3 text-foreground hover:bg-accent transition-colors"
                                >
                                    <span className="truncate">{selectedLabel}</span>
                                    {chainsLoading
                                        ? <Loader2 className="ml-2 h-3 w-3 shrink-0 animate-spin" />
                                        : <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />}
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0" align="start" side="bottom">
                                    <Command>
                                        <CommandInput placeholder="Search chain name or ID…" className="text-xs h-8" />
                                        <CommandList className="max-h-[220px]">
                                            <CommandEmpty>No chain found.</CommandEmpty>
                                            <CommandGroup heading="Popular">
                                                {PINNED_CHAINS.map((c) => (
                                                    <CommandItem key={c.chainId} value={`${c.name} ${c.chainId}`} onSelect={() => applyChainId(c.chainId)} className="text-xs cursor-pointer">
                                                        <Check className={`mr-2 h-3 w-3 ${!isCustom && config.chainId === c.chainId ? "opacity-100" : "opacity-0"}`} />
                                                        <span className="flex-1 truncate">{c.name}</span>
                                                        <span className="text-muted-foreground font-mono ml-2 text-[10px]">{c.chainId}</span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                            <CommandSeparator />
                                            <CommandGroup heading="All networks">
                                                <CommandItem value="custom chain id" onSelect={() => { setIsCustom(true); setCustomInput(String(config.chainId)); setChainOpen(false); }} className="text-xs cursor-pointer">
                                                    <Check className={`mr-2 h-3 w-3 ${isCustom ? "opacity-100" : "opacity-0"}`} />
                                                    <span className="text-primary">✏ Enter custom Chain ID…</span>
                                                </CommandItem>
                                                {otherChains.map((c) => (
                                                    <CommandItem key={c.chainId} value={`${c.name} ${c.chainId}`} onSelect={() => applyChainId(c.chainId)} className="text-xs cursor-pointer">
                                                        <Check className={`mr-2 h-3 w-3 ${!isCustom && config.chainId === c.chainId ? "opacity-100" : "opacity-0"}`} />
                                                        <span className="flex-1 truncate">{c.name}</span>
                                                        <span className="text-muted-foreground font-mono ml-2 text-[10px]">{c.chainId}</span>
                                                    </CommandItem>
                                                ))}
                                            </CommandGroup>
                                        </CommandList>
                                    </Command>
                                </PopoverContent>
                            </Popover>

                            {isCustom && (
                                <div className="mt-1.5 flex gap-1.5">
                                    <Input
                                        className="h-7 font-mono bg-input border-border text-foreground text-xs flex-1"
                                        placeholder="e.g. 204"
                                        value={customInput}
                                        onChange={(e) => setCustomInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { const cid = parseInt(customInput); if (cid > 0) applyChainId(cid); } }}
                                        autoFocus
                                    />
                                    <Button size="sm" className="h-7 px-3 text-xs" onClick={() => { const cid = parseInt(customInput); if (cid > 0) applyChainId(cid); }}>
                                        Apply
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* ── Other config fields ── */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <Label className="text-muted-foreground">Port</Label>
                                <Input className="h-7 font-mono bg-input border-border text-foreground" value={config.port} onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) || 8545 })} />
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Block Time (s)</Label>
                                <Input className="h-7 font-mono bg-input border-border text-foreground" value={config.blockTime} onChange={(e) => setConfig({ ...config, blockTime: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Accounts</Label>
                                <Input className="h-7 font-mono bg-input border-border text-foreground" value={config.accounts} onChange={(e) => setConfig({ ...config, accounts: parseInt(e.target.value) || 10 })} />
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Balance (ETH)</Label>
                                <Input className="h-7 font-mono bg-input border-border text-foreground" value={config.balance} onChange={(e) => setConfig({ ...config, balance: parseInt(e.target.value) || 10000 })} />
                            </div>
                            <div>
                                <Label className="text-muted-foreground">Base Fee</Label>
                                <Input className="h-7 font-mono bg-input border-border text-foreground" value={config.baseFee} onChange={(e) => setConfig({ ...config, baseFee: parseInt(e.target.value) || 0 })} />
                            </div>
                        </div>

                        <div>
                            <Label className="text-muted-foreground">Fork URL (optional)</Label>
                            <Input className="h-7 font-mono bg-input border-border text-foreground" placeholder="https://bsc-dataseed.binance.org" value={forkUrl} onChange={(e) => setForkUrl(e.target.value)} />
                        </div>
                        {forkUrl && (
                            <div>
                                <Label className="text-muted-foreground">Fork Block # (leave empty for latest)</Label>
                                <Input className="h-7 font-mono bg-input border-border text-foreground" placeholder="latest" value={forkBlock} onChange={(e) => setForkBlock(e.target.value)} />
                            </div>
                        )}
                        <div>
                            <Label className="text-muted-foreground">State File</Label>
                            <Input className="h-7 font-mono bg-input border-border text-foreground text-xs" value={config.stateFile} onChange={(e) => setConfig({ ...config, stateFile: e.target.value })} />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
