"use client";

import { useEffect, useState } from "react";
import { ContractUpload } from "@/components/ContractUpload";
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
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-semibold text-foreground">Contracts</h1>
                    <p className="text-muted-foreground text-xs mt-0.5">{contracts.length} registered</p>
                </div>
                <Badge variant="secondary" className="text-xs">{contracts.length}</Badge>
            </div>

            <ContractUpload onRegistered={load} />

            <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                    <span className="text-sm font-semibold text-foreground">Registered Contracts</span>
                </div>
                <div className="p-3">
                    {loading ? (
                        <p className="p-2 text-muted-foreground text-sm">Loading…</p>
                    ) : contracts.length === 0 ? (
                        <p className="p-2 text-muted-foreground text-sm">No contracts registered yet.</p>
                    ) : (
                        <div className="space-y-1">
                            {contracts.map((c) => (
                                <div key={c.address} className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors px-3 py-2.5">
                                    <div className="flex-1 min-w-0">
                                        <Link href={`/contracts/${c.address}`} className="text-primary hover:underline font-mono text-xs">
                                            {c.address}
                                        </Link>
                                        <span className="text-muted-foreground text-xs font-mono ml-2">{c.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                                        {c.abi && <Badge variant="secondary" className="text-xs">ABI</Badge>}
                                        {c.source && <Badge variant="secondary" className="text-xs">Source</Badge>}
                                        <Button variant="ghost" size="sm" onClick={() => remove(c.address)} className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
