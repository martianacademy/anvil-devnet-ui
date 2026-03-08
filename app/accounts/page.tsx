"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEther } from "viem";

interface AccountInfo {
    address: string;
    balance: bigint | string;
    nonce: number;
}

export default function AccountsPage() {
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [fundAddr, setFundAddr] = useState("");
    const [fundAmt, setFundAmt] = useState("10");
    const [funding, setFunding] = useState(false);
    const [msg, setMsg] = useState("");

    const load = () => {
        fetch("/api/explorer?module=account&action=listaccounts")
            .then((r) => r.json())
            .then((data) => setAccounts(Array.isArray(data.result) ? data.result : []))
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const fund = async () => {
        setFunding(true);
        setMsg("");
        try {
            const r = await fetch("/api/patches/fund", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ type: "native", address: fundAddr, amount: fundAmt }),
            });
            const d = await r.json();
            setMsg(d.error ?? "Funded successfully");
            load();
        } catch {
            setMsg("Request failed");
        } finally {
            setFunding(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
            <div>
                <h1 className="text-xl font-semibold text-foreground">Accounts</h1>
                <p className="text-muted-foreground text-xs mt-0.5">{accounts.length} account{accounts.length !== 1 ? "s" : ""} loaded</p>
            </div>

            {/* Fund card */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">Fund Account</span>
                </div>
                <div className="p-4">
                    <div className="flex gap-3 items-end flex-wrap">
                        <div className="space-y-1.5 flex-1 min-w-[220px]">
                            <Label className="text-muted-foreground text-xs">Address</Label>
                            <Input className="h-9 font-mono text-sm" placeholder="0x..." value={fundAddr} onChange={(e) => setFundAddr(e.target.value)} />
                        </div>
                        <div className="space-y-1.5 w-28">
                            <Label className="text-muted-foreground text-xs">ETH Amount</Label>
                            <Input className="h-9 text-sm" value={fundAmt} onChange={(e) => setFundAmt(e.target.value)} />
                        </div>
                        <Button onClick={fund} disabled={funding || !fundAddr} size="sm">
                            {funding ? "Funding…" : "Fund"}
                        </Button>
                    </div>
                    {msg && (
                        <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-mono border ${msg.toLowerCase().includes("error") || msg.toLowerCase().includes("fail")
                            ? "bg-red-500/10 border-red-500/30 text-red-400"
                            : "bg-green-500/10 border-green-500/30 text-green-400"
                            }`}>{msg}</div>
                    )}
                </div>
            </div>

            {/* Accounts table */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30 flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">All Accounts</span>
                    <Badge variant="secondary" className="text-xs">{accounts.length}</Badge>
                </div>
                <div className="overflow-x-auto">
                    {loading ? (
                        <p className="p-5 text-muted-foreground text-sm">Loading…</p>
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
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((acc, i) => (
                                    <tr key={acc.address} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-5 py-2.5 text-muted-foreground">{i}</td>
                                        <td className="px-4 py-2.5 text-green-400">{acc.address}</td>
                                        <td className="px-4 py-2.5 text-foreground font-semibold">
                                            {acc.balance ? formatEther(BigInt(acc.balance.toString())) : "0"}
                                        </td>
                                        <td className="px-4 py-2.5 text-muted-foreground">{acc.nonce ?? 0}</td>
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
