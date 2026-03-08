"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useDevnetStore } from "@/store/useDevnetStore";
import { TxDebugger } from "@/components/TxDebugger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function TxDetailPage() {
    const params = useParams();
    const hash = params.hash as string;
    const { selectTx } = useDevnetStore();
    const [tx, setTx] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (hash) {
            selectTx(hash);
            fetch(`/api/tx/${hash}`)
                .then((r) => r.json())
                .then((data) => { if (data && !data.error) setTx(data); })
                .catch(() => { })
                .finally(() => setLoading(false));
        }
    }, [hash]);

    if (loading) {
        return (
            <div className="p-4 max-w-7xl mx-auto">
                <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-4 font-mono">
                    <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                </Link>
                <Card className="bg-gray-900 border-gray-700">
                    <CardContent className="pt-6 text-gray-500 font-mono text-sm">
                        Loading transaction {hash}...
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-4 max-w-7xl mx-auto space-y-4">
            <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white text-sm font-mono">
                <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>

            {tx && (
                <Card className="bg-gray-900 border-gray-700">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-white text-sm font-mono">Transaction</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs font-mono">
                        <div className="flex gap-2 items-center">
                            <span className="text-gray-400">Hash:</span>
                            <span className="text-green-400 break-all">{tx.hash}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <span className="text-gray-400">From: </span>
                                <span className="text-white">{tx.from}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">To: </span>
                                <span className="text-white">{tx.to ?? "Contract Create"}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Block: </span>
                                <span className="text-white">{String(tx.blockNumber)}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Gas Used: </span>
                                <span className="text-white">{tx.gas ? String(tx.gas) : "—"}</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Value: </span>
                                <span className="text-white">{tx.value ? String(tx.value) : "0"} wei</span>
                            </div>
                            <div>
                                <span className="text-gray-400">Status: </span>
                                <Badge variant={tx.status === "success" ? "default" : "destructive"} className="text-xs">
                                    {tx.status ?? "unknown"}
                                </Badge>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <TxDebugger hash={hash} tx={tx} receipt={tx?.receipt ?? null} />
        </div>
    );
}
