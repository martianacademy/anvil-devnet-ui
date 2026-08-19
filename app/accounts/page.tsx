"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { api, explorer } from "@/lib/apiClient";
import { useAsyncData, useCopy } from "@/lib/hooks";
import { useDevnetStore } from "@/store/useDevnetStore";
import { useProjectStore } from "@/store/useProjectStore";
import { formatEth } from "@/lib/format";

interface AccountInfo {
    address: string;
    balance: string;
    nonce: number;
}

export default function AccountsPage() {
    const { nodeStatus, latestBlock } = useDevnetStore();
    const activeProjectId = useProjectStore((s) => s.activeProjectId);
    const { toast } = useToast();
    const { copied, copy } = useCopy();

    const [fundAddr, setFundAddr] = useState("");
    const [fundAmt, setFundAmt] = useState("10");
    const [funding, setFunding] = useState(false);

    const { data: accounts, loading, error, reload } = useAsyncData(
        async () => (await explorer<AccountInfo[]>("module=account&action=listaccounts", [])).result,
        // Balances move with every block, so re-read when the tip advances.
        [nodeStatus, activeProjectId, latestBlock],
        [] as AccountInfo[]
    );

    const fund = async () => {
        setFunding(true);
        try {
            await api.post("/api/patches/fund", { type: "native", address: fundAddr.trim(), amount: fundAmt.trim() });
            toast(`Funded ${fundAddr.slice(0, 10)}… with ${fundAmt} ETH`, "success");
            reload();
        } catch (err) {
            toast(err instanceof Error ? err.message : "Funding failed", "error");
        } finally {
            setFunding(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Accounts</h1>
                    <p className="text-muted-foreground text-xs mt-0.5">
                        {accounts.length} account{accounts.length === 1 ? "" : "s"} on the running node
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
                    <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh
                </Button>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">Fund Account</span>
                </div>
                <div className="p-4">
                    <div className="flex gap-3 items-end flex-wrap">
                        <div className="space-y-1.5 flex-1 min-w-[220px]">
                            <Label className="text-muted-foreground text-xs">Address</Label>
                            <Input
                                className="h-9 font-mono text-sm"
                                placeholder="0x…"
                                value={fundAddr}
                                onChange={(e) => setFundAddr(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5 w-28">
                            <Label className="text-muted-foreground text-xs">ETH Amount</Label>
                            <Input className="h-9 text-sm" value={fundAmt} onChange={(e) => setFundAmt(e.target.value)} />
                        </div>
                        <Button onClick={fund} disabled={funding || !fundAddr.trim()} size="sm">
                            {funding ? "Funding…" : "Fund"}
                        </Button>
                    </div>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">All Accounts</span>
                    <Badge variant="secondary" className="text-xs">{accounts.length}</Badge>
                </div>
                <div className="overflow-x-auto">
                    {loading && accounts.length === 0 ? (
                        <p className="p-5 text-muted-foreground text-sm">Loading…</p>
                    ) : error ? (
                        <p className="p-5 text-muted-foreground text-sm">Could not load accounts: {error}</p>
                    ) : accounts.length === 0 ? (
                        <p className="p-5 text-muted-foreground text-sm">No accounts found. Start Anvil first.</p>
                    ) : (
                        <table className="w-full text-xs font-mono">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border/60 bg-muted/20">
                                    <th className="text-left px-5 py-2.5 font-medium">#</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Address</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Balance (ETH)</th>
                                    <th className="text-left px-4 py-2.5 font-medium">Nonce</th>
                                    <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((acc, i) => (
                                    <tr key={acc.address} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-5 py-2.5 text-muted-foreground">{i}</td>
                                        <td className="px-4 py-2.5 text-emerald-400">{acc.address}</td>
                                        <td className="px-4 py-2.5 text-foreground font-semibold">{formatEth(acc.balance)}</td>
                                        <td className="px-4 py-2.5 text-muted-foreground">{acc.nonce ?? 0}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <div className="inline-flex gap-1">
                                                <button
                                                    onClick={() => copy(acc.address)}
                                                    aria-label={`Copy ${acc.address}`}
                                                    className="p-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
                                                >
                                                    {copied === acc.address
                                                        ? <Check className="w-3 h-3 text-emerald-400" />
                                                        : <Copy className="w-3 h-3 text-muted-foreground" />}
                                                </button>
                                                <button
                                                    onClick={() => setFundAddr(acc.address)}
                                                    className="px-2 py-1 rounded-lg border border-border hover:bg-muted transition-colors text-[10px]"
                                                >
                                                    Fund
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
