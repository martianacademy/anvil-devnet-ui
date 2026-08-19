"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/apiClient";

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
    const [busy, setBusy] = useState(false);
    const { toast } = useToast();

    const fund = async (type: "native" | "erc20") => {
        setBusy(true);
        try {
            const body = type === "native"
                ? { type: "native", address: nativeAddr.trim(), amount: nativeAmount.trim() }
                : {
                    type: "erc20",
                    address: erc20Wallet.trim(),
                    token: erc20Token.trim(),
                    amount: erc20Amount.trim(),
                    decimals: parseInt(erc20Decimals, 10),
                };
            await api.post("/api/patches/fund", body);
            toast(type === "native" ? `Funded ${nativeAmount} ETH` : `Funded ${erc20Amount} tokens`, "success");
        } catch (err) {
            toast(err instanceof Error ? err.message : "Funding failed", "error");
        } finally {
            setBusy(false);
        }
    };

    const readSlot = async () => {
        if (!storageContract.trim() || !storageSlot.trim()) return;
        try {
            const data = await api.get<{ value: string }>(
                `/api/patches/storage?contract=${encodeURIComponent(storageContract.trim())}&slot=${encodeURIComponent(storageSlot.trim())}`
            );
            setCurrentSlotValue(data.value);
        } catch {
            setCurrentSlotValue("");
        }
    };

    const writeSlot = async () => {
        setBusy(true);
        try {
            await api.post("/api/patches/storage", {
                contract: storageContract.trim(),
                slot: storageSlot.trim(),
                value: storageValue.trim(),
            });
            toast("Storage slot written", "success");
            await readSlot();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Storage write failed", "error");
        } finally {
            setBusy(false);
        }
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
                            <Button size="sm" onClick={() => fund("native")} disabled={busy || !nativeAddr.trim()} className="w-full sm:w-auto">Fund Native</Button>
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
                            <Button size="sm" onClick={() => fund("erc20")} disabled={busy || !erc20Token.trim() || !erc20Wallet.trim()} className="w-full sm:w-auto">Fund ERC20</Button>
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
                            <Button size="sm" onClick={writeSlot} disabled={busy || !storageContract.trim() || !storageValue.trim()} className="w-full sm:w-auto">Write Slot</Button>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
