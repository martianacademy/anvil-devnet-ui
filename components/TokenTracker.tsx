"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/apiClient";
import { usePolling } from "@/lib/hooks";
import { formatTokenAmount, truncateHex } from "@/lib/format";

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

const REFRESH_MS = 3000;

export function TokenTracker() {
    const { toast } = useToast();
    const [watchlist, setWatchlist] = useState<WatchEntry[]>([]);
    const [tokenAddr, setTokenAddr] = useState("");
    const [walletAddr, setWalletAddr] = useState("");
    const [tokenType, setTokenType] = useState<"ERC20" | "ERC721">("ERC20");
    const [busy, setBusy] = useState(false);

    const loadBalances = async () => {
        const data = await api.get<WatchEntry[]>("/api/tokens/balances").catch(() => []);
        setWatchlist(Array.isArray(data) ? data : []);
    };

    // The API client scopes each request to the active project automatically.
    usePolling(loadBalances, REFRESH_MS);

    const add = async () => {
        setBusy(true);
        try {
            const res = await api.post<{ metadata?: { symbol: string | null } }>("/api/tokens", {
                token_address: tokenAddr.trim(),
                wallet_address: walletAddr.trim(),
                token_type: tokenType,
            });
            toast(`Watching ${res.metadata?.symbol ?? truncateHex(tokenAddr)}`, "success");
            setTokenAddr("");
            setWalletAddr("");
            await loadBalances();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Could not add token", "error");
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id: number) => {
        try {
            await api.del("/api/tokens", { id });
            await loadBalances();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Could not remove token", "error");
        }
    };

    const formatBalance = (entry: WatchEntry) =>
        entry.balance ? formatTokenAmount(entry.balance, entry.token_decimals ?? 18) : "—";

    return (
        <div className="space-y-4">
            {/* Add watch form */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">Add Watch</span>
                </div>
                <div className="p-4 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs">Token Address</Label>
                            <Input className="h-9 font-mono text-sm" placeholder="0x..." value={tokenAddr} onChange={(e) => setTokenAddr(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs">Wallet Address</Label>
                            <Input className="h-9 font-mono text-sm" placeholder="0x..." value={walletAddr} onChange={(e) => setWalletAddr(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex gap-3 items-end">
                        <div className="space-y-1.5">
                            <Label className="text-muted-foreground text-xs">Type</Label>
                            <Select value={tokenType} onValueChange={(v) => setTokenType(v as "ERC20" | "ERC721")}>
                                <SelectTrigger className="h-9 w-28">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ERC20">ERC20</SelectItem>
                                    <SelectItem value="ERC721">ERC721</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button size="sm" onClick={add} disabled={busy || !tokenAddr.trim() || !walletAddr.trim()}>
                            {busy ? "Adding…" : "Add"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Watchlist table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Watchlist</span>
                    <Badge variant="secondary" className="text-xs">{watchlist.length}</Badge>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-xs font-mono">
                        <thead>
                            <tr className="text-muted-foreground border-b border-border/60 bg-muted/20">
                                <th className="text-left px-5 py-2.5 font-medium">Token</th>
                                <th className="text-left px-4 py-2.5 font-medium">Wallet</th>
                                <th className="text-left px-4 py-2.5 font-medium">Balance</th>
                                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                                <th className="px-4 py-2.5"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {watchlist.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-5 py-6 text-center text-muted-foreground">No tokens watched</td>
                                </tr>
                            ) : (
                                watchlist.map((w) => (
                                    <tr key={w.id} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-5 py-2.5 text-primary">
                                            {w.token_symbol ?? truncateHex(w.token_address)}
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground">
                                            {truncateHex(w.wallet_address)}
                                        </td>
                                        <td className="px-4 py-2.5 text-foreground font-semibold">{formatBalance(w)}</td>
                                        <td className="px-4 py-2.5">
                                            <Badge variant="outline" className="text-xs">{w.token_type}</Badge>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <button
                                                aria-label="Remove from watchlist"
                                                className="text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded px-1.5 py-0.5 transition-colors text-xs"
                                                onClick={() => remove(w.id)}
                                            >✕</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
