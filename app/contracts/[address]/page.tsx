"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function ContractDetailPage() {
    const params = useParams();
    const address = params.address as string;
    const [contract, setContract] = useState<any>(null);
    const [txs, setTxs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetching, setFetching] = useState(false);

    const load = () => {
        setLoading(true);
        Promise.all([
            fetch(`/api/contracts/${address}`).then((r) => r.json()),
            fetch(`/api/explorer?module=account&action=txlist&address=${address}`).then((r) => r.json()),
        ])
            .then(([c, t]) => {
                setContract(c.contract ?? null);
                setTxs(t.result ?? []);
            })
            .catch(() => { })
            .finally(() => setLoading(false));
    };

    const fetchAbi = async () => {
        setFetching(true);
        await fetch(`/api/contracts/${address}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoFetch: true }) });
        load();
        setFetching(false);
    };

    useEffect(() => { load(); }, [address]);

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-4">
            <Link href="/contracts" className="flex items-center gap-2 text-gray-400 hover:text-white text-sm font-mono">
                <ArrowLeft className="w-4 h-4" /> Back to Contracts
            </Link>

            <div className="flex items-center justify-between">
                <h1 className="text-white text-base font-mono break-all">{address}</h1>
                <Button variant="outline" size="sm" onClick={fetchAbi} disabled={fetching} className="font-mono text-xs">
                    <RefreshCw className={`w-3 h-3 mr-1 ${fetching ? "animate-spin" : ""}`} />
                    Fetch ABI
                </Button>
            </div>

            {loading ? (
                <p className="text-gray-500 text-xs font-mono">Loading…</p>
            ) : (
                <Tabs defaultValue="abi">
                    <TabsList className="bg-gray-900 border border-gray-700">
                        <TabsTrigger value="abi" className="font-mono text-xs">ABI</TabsTrigger>
                        <TabsTrigger value="txs" className="font-mono text-xs">Transactions</TabsTrigger>
                        <TabsTrigger value="source" className="font-mono text-xs">Source</TabsTrigger>
                    </TabsList>

                    <TabsContent value="abi">
                        <Card className="bg-gray-950 border-gray-800">
                            <CardContent className="pt-4">
                                {contract?.abi ? (
                                    <pre className="text-green-400 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                                        {JSON.stringify(JSON.parse(contract.abi), null, 2)}
                                    </pre>
                                ) : (
                                    <p className="text-gray-500 text-xs font-mono">No ABI registered. Use &apos;Fetch ABI&apos; to auto-fetch from Sourcify.</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="txs">
                        <Card className="bg-gray-950 border-gray-800">
                            <CardContent className="pt-4 space-y-1">
                                {txs.length === 0 ? (
                                    <p className="text-gray-500 text-xs font-mono">No transactions found.</p>
                                ) : txs.map((tx) => (
                                    <div key={tx.hash} className="flex items-center gap-2 bg-gray-900 rounded px-3 py-2">
                                        <Link href={`/tx/${tx.hash}`} className="text-blue-400 hover:text-blue-300 font-mono text-xs truncate flex-1">
                                            {tx.hash}
                                        </Link>
                                        <Badge variant="secondary" className="text-xs font-mono">{tx.blockNumber}</Badge>
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="source">
                        <Card className="bg-gray-950 border-gray-800">
                            <CardContent className="pt-4">
                                {contract?.source ? (
                                    <pre className="text-gray-300 text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                                        {contract.source}
                                    </pre>
                                ) : (
                                    <p className="text-gray-500 text-xs font-mono">No source code registered.</p>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            )}
        </div>
    );
}
