"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface WatchEntry {
    id: number;
    token_address: string;
    wallet_address: string;
    token_name?: string;
    token_symbol?: string;
    token_decimals: number;
    token_type: "ERC20" | "ERC721";
    balance?: string;
}

export function TokenTracker() {
    const [watchlist, setWatchlist] = useState<WatchEntry[]>([]);
    const [tokenAddr, setTokenAddr] = useState("");
    const [walletAddr, setWalletAddr] = useState("");
    const [tokenType, setTokenType] = useState<"ERC20" | "ERC721">("ERC20");
    const [status, setStatus] = useState("");

    const loadBalances = async () => {
        const data = await fetch("/api/tokens/balances").then((r) => r.json());
        setWatchlist(Array.isArray(data) ? data : []);
    };

    useEffect(() => {
        loadBalances();
        const interval = setInterval(loadBalances, 3000);
        return () => clearInterval(interval);
    }, []);

    const add = async () => {
        try {
            await fetch("/api/tokens", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    token_address: tokenAddr,
                    wallet_address: walletAddr,
                    token_type: tokenType,
                }),
            });
            setStatus("✓ Added to watchlist");
            setTokenAddr(""); setWalletAddr("");
            loadBalances();
        } catch (e: any) { setStatus(`Error: ${e.message}`); }
    };

    const remove = async (id: number) => {
        await fetch("/api/tokens", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
        });
        loadBalances();
    };

    const formatBalance = (entry: WatchEntry) => {
        if (!entry.balance) return "—";
        try {
            const raw = BigInt(entry.balance);
            const decimals = entry.token_decimals ?? 18;
            const divisor = BigInt(10 ** Math.min(decimals, 18));
            const whole = raw / divisor;
            return whole.toLocaleString();
        } catch { return entry.balance; }
    };

    return (
        <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm">+ Add Watch</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Label className="text-gray-400 text-xs">Token Address</Label>
                            <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                placeholder="0x..." value={tokenAddr} onChange={(e) => setTokenAddr(e.target.value)} />
                        </div>
                        <div>
                            <Label className="text-gray-400 text-xs">Wallet Address</Label>
                            <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                placeholder="0x..." value={walletAddr} onChange={(e) => setWalletAddr(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex gap-2 items-end">
                        <div>
                            <Label className="text-gray-400 text-xs">Type</Label>
                            <Select value={tokenType} onValueChange={(v) => setTokenType(v as any)}>
                                <SelectTrigger className="h-8 w-24 bg-gray-800 border-gray-600 text-white text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ERC20">ERC20</SelectItem>
                                    <SelectItem value="ERC721">ERC721</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button size="sm" onClick={add}>Add</Button>
                    </div>
                    {status && <p className="text-green-400 text-xs">{status}</p>}
                </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-700">
                <CardContent className="pt-3">
                    <Table>
                        <TableHeader>
                            <TableRow className="border-gray-700">
                                <TableHead className="text-gray-400 text-xs">Token</TableHead>
                                <TableHead className="text-gray-400 text-xs">Wallet</TableHead>
                                <TableHead className="text-gray-400 text-xs">Balance</TableHead>
                                <TableHead className="text-gray-400 text-xs">Type</TableHead>
                                <TableHead className="text-gray-400 text-xs"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {watchlist.map((w) => (
                                <TableRow key={w.id} className="border-gray-800">
                                    <TableCell className="font-mono text-xs text-blue-300">
                                        {w.token_symbol ?? `${w.token_address.slice(0, 6)}…`}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-gray-300">
                                        {w.wallet_address.slice(0, 6)}…{w.wallet_address.slice(-4)}
                                    </TableCell>
                                    <TableCell className="font-mono text-xs text-white">
                                        {formatBalance(w)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="text-xs">{w.token_type}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Button size="sm" variant="ghost" className="h-6 text-xs text-red-400"
                                            onClick={() => remove(w.id)}>
                                            ✕
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {watchlist.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-gray-500 text-xs text-center">
                                        No tokens watched
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
