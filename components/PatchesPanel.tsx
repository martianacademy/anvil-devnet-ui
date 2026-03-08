"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
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
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
    };

    return (
        <div className="space-y-4">
            <Tabs defaultValue="native">
                <TabsList className="bg-gray-800">
                    <TabsTrigger value="native" className="text-xs">Fund Native</TabsTrigger>
                    <TabsTrigger value="erc20" className="text-xs">Fund ERC20</TabsTrigger>
                    <TabsTrigger value="storage" className="text-xs">Storage Patch</TabsTrigger>
                </TabsList>

                <TabsContent value="native">
                    <Card className="bg-gray-900 border-gray-700">
                        <CardContent className="pt-4 space-y-3">
                            <div>
                                <Label className="text-gray-400 text-xs">Wallet Address</Label>
                                <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                    placeholder="0x..." value={nativeAddr} onChange={(e) => setNativeAddr(e.target.value)} />
                            </div>
                            <div>
                                <Label className="text-gray-400 text-xs">Amount (ETH)</Label>
                                <Input className="h-8 bg-gray-800 border-gray-600 text-white text-xs"
                                    value={nativeAmount} onChange={(e) => setNativeAmount(e.target.value)} />
                            </div>
                            <Button size="sm" onClick={() => fund("native")}>Fund Native</Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="erc20">
                    <Card className="bg-gray-900 border-gray-700">
                        <CardContent className="pt-4 space-y-3">
                            <div>
                                <Label className="text-gray-400 text-xs">Token Address</Label>
                                <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                    placeholder="0x..." value={erc20Token} onChange={(e) => setErc20Token(e.target.value)} />
                            </div>
                            <div>
                                <Label className="text-gray-400 text-xs">Wallet Address</Label>
                                <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                    placeholder="0x..." value={erc20Wallet} onChange={(e) => setErc20Wallet(e.target.value)} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <Label className="text-gray-400 text-xs">Amount (human)</Label>
                                    <Input className="h-8 bg-gray-800 border-gray-600 text-white text-xs"
                                        value={erc20Amount} onChange={(e) => setErc20Amount(e.target.value)} />
                                </div>
                                <div>
                                    <Label className="text-gray-400 text-xs">Decimals</Label>
                                    <Input className="h-8 bg-gray-800 border-gray-600 text-white text-xs"
                                        value={erc20Decimals} onChange={(e) => setErc20Decimals(e.target.value)} />
                                </div>
                            </div>
                            <Button size="sm" onClick={() => fund("erc20")}>Fund ERC20</Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="storage">
                    <Card className="bg-gray-900 border-gray-700">
                        <CardContent className="pt-4 space-y-3">
                            <div>
                                <Label className="text-gray-400 text-xs">Contract Address</Label>
                                <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                    placeholder="0x..." value={storageContract} onChange={(e) => setStorageContract(e.target.value)} />
                            </div>
                            <div>
                                <Label className="text-gray-400 text-xs">Slot (hex)</Label>
                                <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                    placeholder="0x0" value={storageSlot}
                                    onChange={(e) => setStorageSlot(e.target.value)}
                                    onBlur={readSlot} />
                            </div>
                            {currentSlotValue && (
                                <p className="text-gray-400 text-xs font-mono">Current: {currentSlotValue}</p>
                            )}
                            <div>
                                <Label className="text-gray-400 text-xs">New Value (hex)</Label>
                                <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                    placeholder="0x0" value={storageValue} onChange={(e) => setStorageValue(e.target.value)} />
                            </div>
                            <Button size="sm" onClick={writeSlot}>Write Slot</Button>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {status && <p className="text-green-400 text-xs font-mono">{status}</p>}
        </div>
    );
}
