"use client";

import { useEffect, useState } from "react";
import { ContractUpload } from "@/components/ContractUpload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import Link from "next/link";

interface ContractRecord {
    address: string;
    name: string;
    abi: string | null;
    source: string | null;
    createdAt: number;
}

export default function ContractsPage() {
    const [contracts, setContracts] = useState<ContractRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const load = () => {
        fetch("/api/contracts")
            .then((r) => r.json())
            .then((data) => setContracts(data.contracts ?? []))
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    useEffect(() => { load(); }, []);

    const remove = async (address: string) => {
        await fetch(`/api/contracts/${address}`, { method: "DELETE" });
        load();
    };

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-white text-lg font-mono font-bold">Contracts</h1>
                <Badge variant="secondary" className="font-mono text-xs">{contracts.length} registered</Badge>
            </div>

            <ContractUpload onRegistered={load} />

            <Card className="bg-gray-950 border-gray-800">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm font-mono">Registered Contracts</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <p className="text-gray-500 text-xs font-mono">Loading…</p>
                    ) : contracts.length === 0 ? (
                        <p className="text-gray-500 text-xs font-mono">No contracts registered yet.</p>
                    ) : (
                        <div className="space-y-1">
                            {contracts.map((c) => (
                                <div key={c.address} className="flex items-center justify-between bg-gray-900 rounded px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                        <Link href={`/contracts/${c.address}`} className="text-blue-400 hover:text-blue-300 font-mono text-xs">
                                            {c.address}
                                        </Link>
                                        <span className="text-gray-400 text-xs font-mono ml-2">{c.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2">
                                        {c.abi && <Badge variant="secondary" className="text-xs">ABI</Badge>}
                                        {c.source && <Badge variant="secondary" className="text-xs">Source</Badge>}
                                        <Button variant="ghost" size="sm" onClick={() => remove(c.address)} className="h-6 w-6 p-0 text-red-400 hover:text-red-300">
                                            <Trash2 className="w-3 h-3" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
