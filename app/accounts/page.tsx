"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
        <div className="p-4 max-w-7xl mx-auto space-y-4">
            <h1 className="text-white text-lg font-mono font-bold">Accounts</h1>

            <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm font-mono">Fund Account</CardTitle>
                </CardHeader>
                <CardContent className="flex gap-2 items-end flex-wrap">
                    <div className="space-y-1 flex-1 min-w-[240px]">
                        <Label className="text-gray-400 text-xs font-mono">Address</Label>
                        <Input
                            className="bg-gray-950 border-gray-700 text-white font-mono text-xs"
                            placeholder="0x..."
                            value={fundAddr}
                            onChange={(e) => setFundAddr(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1 w-28">
                        <Label className="text-gray-400 text-xs font-mono">ETH Amount</Label>
                        <Input
                            className="bg-gray-950 border-gray-700 text-white font-mono text-xs"
                            value={fundAmt}
                            onChange={(e) => setFundAmt(e.target.value)}
                        />
                    </div>
                    <Button onClick={fund} disabled={funding || !fundAddr} className="font-mono text-xs">
                        {funding ? "Funding…" : "Fund"}
                    </Button>
                    {msg && <span className="text-xs font-mono text-green-400">{msg}</span>}
                </CardContent>
            </Card>

            <Card className="bg-gray-950 border-gray-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm font-mono">All Accounts</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-gray-500 text-xs font-mono">Loading…</p>
                    ) : accounts.length === 0 ? (
                        <p className="text-gray-500 text-xs font-mono">No accounts found. Start anvil first.</p>
                    ) : (
                        <table className="w-full text-xs font-mono">
                            <thead>
                                <tr className="text-gray-400 border-b border-gray-800">
                                    <th className="text-left py-1 pr-4">Address</th>
                                    <th className="text-left py-1 pr-4">Balance (ETH)</th>
                                    <th className="text-left py-1">Nonce</th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((acc) => (
                                    <tr key={acc.address} className="border-b border-gray-900 hover:bg-gray-900">
                                        <td className="py-1 pr-4 text-green-400">{acc.address}</td>
                                        <td className="py-1 pr-4 text-white">
                                            {acc.balance ? formatEther(BigInt(acc.balance.toString())) : "0"}
                                        </td>
                                        <td className="py-1 text-gray-400">{acc.nonce ?? 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
