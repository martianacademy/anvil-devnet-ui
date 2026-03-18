"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function PatchesPanel() {
    const [nativeAddr, setNativeAddr] = useState("");
    const [nativeAmount, setNativeAmount] = useState("10000");
    const [erc20Token, setErc20Token] = useState("");
    const [erc20Wallet, setErc20Wallet] = useState("");
    const [erc20Amount, setErc20Amount] = useState("1000000");
    const [erc20Decimals, setErc20Decimals] = useState("18");
    const [storageContract, setStorageContract] = useState("");
    const [storageSlot, setStorageSlot] = useState("");
    const [storageValue, setStorageValue] = useState("");
    const [currentSlotValue, setCurrentSlotValue] = useState("");
    const [status, setStatus] = useState("");

    const fund = async (type: "native" | "erc20") => {
        try {
            const body = type === "native"
                ? { type: "native", address: nativeAddr, amount: nativeAmount }
                : { type: "erc20", address: erc20Wallet, token: erc20Token, amount: erc20Amount, decimals: parseInt(erc20Decimals) };
            const res = await fetch("/api/patches/fund", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setStatus(`✓ Funded successfully`);
        } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`); }
    };

    const readSlot = async () => {
        if (!storageContract || !storageSlot) return;
        try {
            const res = await fetch(`/api/patches/storage?contract=${storageContract}&slot=${storageSlot}`);
            const data = await res.json();
            setCurrentSlotValue(data.value);
        } catch { /* ignore */ }
    };

    const writeSlot = async () => {
        try {
            const res = await fetch("/api/patches/storage", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contract: storageContract, slot: storageSlot, value: storageValue }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setStatus("✓ Storage slot written");
            readSlot();
        } catch (e: unknown) { setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`); }
    };

    return (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                <span className="text-sm font-semibold text-foreground">Patch Tools</span>
            </div>
            <div className="p-4 space-y-4">
                <Tabs defaultValue="native">
                    <TabsList className="w-full">
                        <TabsTrigger value="native" className="flex-1 text-xs">Fund Native</TabsTrigger>
                        <TabsTrigger value="erc20" className="flex-1 text-xs">Fund ERC20</TabsTrigger>
                        <TabsTrigger value="storage" className="flex-1 text-xs">Storage Patch</TabsTrigger>
                    </TabsList>

                    <TabsContent value="native" className="mt-4">
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-muted-foreground text-xs">Wallet Address</Label>
                                <Input className="h-9 font-mono text-sm"
                                    placeholder="0x..." value={nativeAddr} onChange={(e) => setNativeAddr(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-muted-foreground text-xs">Amount (ETH)</Label>
                                <Input className="h-9 text-sm"
                                    value={nativeAmount} onChange={(e) => setNativeAmount(e.target.value)} />
                            </div>
                            <Button size="sm" onClick={() => fund("native")} className="w-full sm:w-auto">Fund Native</Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="erc20" className="mt-4">
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-muted-foreground text-xs">Token Address</Label>
                                <Input className="h-9 font-mono text-sm"
                                    placeholder="0x..." value={erc20Token} onChange={(e) => setErc20Token(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-muted-foreground text-xs">Wallet Address</Label>
                                <Input className="h-9 font-mono text-sm"
                                    placeholder="0x..." value={erc20Wallet} onChange={(e) => setErc20Wallet(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-muted-foreground text-xs">Amount</Label>
                                    <Input className="h-9 text-sm"
                                        value={erc20Amount} onChange={(e) => setErc20Amount(e.target.value)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-muted-foreground text-xs">Decimals</Label>
                                    <Input className="h-9 text-sm"
                                        value={erc20Decimals} onChange={(e) => setErc20Decimals(e.target.value)} />
                                </div>
                            </div>
                            <Button size="sm" onClick={() => fund("erc20")} className="w-full sm:w-auto">Fund ERC20</Button>
                        </div>
                    </TabsContent>

                    <TabsContent value="storage" className="mt-4">
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-muted-foreground text-xs">Contract Address</Label>
                                <Input className="h-9 font-mono text-sm"
                                    placeholder="0x..." value={storageContract} onChange={(e) => setStorageContract(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-muted-foreground text-xs">Slot (hex)</Label>
                                <Input className="h-9 font-mono text-sm"
                                    placeholder="0x0" value={storageSlot}
                                    onChange={(e) => setStorageSlot(e.target.value)}
                                    onBlur={readSlot} />
                            </div>
                            {currentSlotValue && (
                                <div className="rounded-lg bg-muted/50 border border-border px-3 py-2">
                                    <p className="text-muted-foreground text-xs font-mono">Current: <span className="text-foreground">{currentSlotValue}</span></p>
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label className="text-muted-foreground text-xs">New Value (hex)</Label>
                                <Input className="h-9 font-mono text-sm"
                                    placeholder="0x0" value={storageValue} onChange={(e) => setStorageValue(e.target.value)} />
                            </div>
                            <Button size="sm" onClick={writeSlot} className="w-full sm:w-auto">Write Slot</Button>
                        </div>
                    </TabsContent>
                </Tabs>

                {status && (
                    <div className={`rounded-lg px-3 py-2 text-xs font-mono border ${status.startsWith("Error")
                        ? "bg-red-500/10 border-red-500/30 text-red-400"
                        : "bg-green-500/10 border-green-500/30 text-green-400"
                        }`}>{status}</div>
                )}
            </div>
        </div>
    );
}
