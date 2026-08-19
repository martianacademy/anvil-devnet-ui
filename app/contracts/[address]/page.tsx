"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/detail-row";
import { useToast } from "@/components/ui/toast";
import { api, explorer } from "@/lib/apiClient";
import { useAsyncData } from "@/lib/hooks";
import { timeAgo, truncateHex } from "@/lib/format";
import type { Abi } from "viem";

interface ContractInfo {
    address: string;
    name: string;
    abi: Abi;
    source?: string | null;
    verified_at: number;
}

interface TxRow {
    hash: string;
    block_number: number;
    block_timestamp: number;
    decoded_function: string | null;
    status: number;
}

export default function ContractDetailPage() {
    const params = useParams();
    const address = String(params.address ?? "");
    const { toast } = useToast();
    const [fetching, setFetching] = useState(false);

    const { data: contract, loading, error, reload } = useAsyncData<ContractInfo | null>(
        // GET auto-resolves from Sourcify/Etherscan when the ABI isn't cached locally.
        () => api.get<ContractInfo>(`/api/contracts/${address}`).catch(() => null),
        [address],
        null
    );

    const { data: txs } = useAsyncData<TxRow[]>(
        async () => (await explorer<TxRow[]>(`module=account&action=txlist&address=${address}&sort=desc&offset=25`, [])).result,
        [address],
        []
    );

    const functions = (contract?.abi ?? []).filter((entry) => entry.type === "function");
    const events = (contract?.abi ?? []).filter((entry) => entry.type === "event");

    const refetchAbi = async () => {
        setFetching(true);
        try {
            reload();
            toast("Looking up the ABI…", "info");
        } finally {
            setFetching(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
            <Link href="/contracts" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground text-sm transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Contracts
            </Link>

            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <h1 className="text-lg font-semibold text-foreground">
                        {contract?.name ?? "Unverified contract"}
                    </h1>
                    <p className="text-muted-foreground text-xs font-mono break-all">
                        {address}
                        <CopyButton text={address} />
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href={`/accounts/${address}`}>
                        <Badge variant="secondary" className="text-xs cursor-pointer">Address view →</Badge>
                    </Link>
                    <Button variant="outline" size="sm" onClick={refetchAbi} disabled={fetching || loading} className="font-mono text-xs">
                        <RefreshCw className={`w-3 h-3 mr-1 ${fetching || loading ? "animate-spin" : ""}`} />
                        Fetch ABI
                    </Button>
                </div>
            </div>

            {loading ? (
                <p className="text-muted-foreground text-xs font-mono">Loading…</p>
            ) : (
                <Tabs defaultValue="abi">
                    <TabsList className="bg-muted/50 border border-border">
                        <TabsTrigger value="abi" className="font-mono text-xs">ABI</TabsTrigger>
                        <TabsTrigger value="txs" className="font-mono text-xs">Transactions</TabsTrigger>
                        <TabsTrigger value="source" className="font-mono text-xs">Source</TabsTrigger>
                    </TabsList>

                    <TabsContent value="abi">
                        <Card className="bg-card border-border">
                            <CardContent className="pt-4 space-y-3">
                                {contract?.abi ? (
                                    <>
                                        <div className="flex gap-2 flex-wrap">
                                            <Badge variant="secondary" className="text-xs">{functions.length} functions</Badge>
                                            <Badge variant="secondary" className="text-xs">{events.length} events</Badge>
                                            {contract.verified_at && (
                                                <Badge variant="secondary" className="text-xs">
                                                    registered {timeAgo(Math.floor(contract.verified_at / 1000))}
                                                </Badge>
                                            )}
                                        </div>
                                        <pre className="text-emerald-400 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap rounded-lg bg-muted/30 p-3">
                                            {JSON.stringify(contract.abi, null, 2)}
                                        </pre>
                                    </>
                                ) : (
                                    <p className="text-muted-foreground text-xs font-mono">
                                        {error ?? "No ABI registered. Upload one on the Contracts page, or hit “Fetch ABI” to try Sourcify."}
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="txs">
                        <Card className="bg-card border-border">
                            <CardContent className="pt-4 space-y-1">
                                {txs.length === 0 ? (
                                    <p className="text-muted-foreground text-xs font-mono">No indexed transactions for this contract.</p>
                                ) : txs.map((tx) => (
                                    <div key={tx.hash} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                                        <Link href={`/tx/${tx.hash}`} className="text-primary hover:underline font-mono text-xs truncate flex-1">
                                            {truncateHex(tx.hash, 12, 8)}
                                        </Link>
                                        {tx.decoded_function && (
                                            <span className="text-[10px] text-violet-400">{tx.decoded_function}</span>
                                        )}
                                        <span className="text-[10px] text-muted-foreground">{timeAgo(tx.block_timestamp)}</span>
                                        <Badge variant="secondary" className="text-xs font-mono">#{tx.block_number}</Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="source">
                        <Card className="bg-card border-border">
                            <CardContent className="pt-4">
                                {contract?.source ? (
                                    <pre className="text-foreground/80 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                                        {contract.source}
                                    </pre>
                                ) : (
                                    <p className="text-muted-foreground text-xs font-mono">No source code registered.</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}
