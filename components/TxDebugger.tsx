"use client";

import { useState, useEffect } from "react";
import { useDevnetStore } from "@/store/useDevnetStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OpcodeTrace } from "./OpcodeTrace";
import { CallTree } from "./CallTree";
import { StorageDiff } from "./StorageDiff";
import { parseStructLogs, extractStorageDiffs } from "@/lib/traceParser";

interface Props {
    hash: string;
    tx: any;
    receipt: any;
}

function shortAddr(a: string) {
    if (!a) return "—";
    return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function TxDebugger({ hash, tx, receipt }: Props) {
    const { setTraceSteps, setCallTree } = useDevnetStore();
    const [loading, setLoading] = useState(true);
    const [structLogs, setStructLogs] = useState<any[]>([]);
    const [callTrace, setCallTrace] = useState<any>(null);

    useEffect(() => {
        fetch(`/api/tx/${hash}/trace`)
            .then((r) => r.json())
            .then((data) => {
                const steps = parseStructLogs(data.structLogs ?? []);
                setStructLogs(steps);
                setTraceSteps(steps);
                setCallTrace(data.callTrace);
                setCallTree(data.callTrace);
            })
            .finally(() => setLoading(false));
    }, [hash]);

    const storageDiffs = extractStorageDiffs(structLogs);
    const success = receipt?.status === "0x1" || parseInt(receipt?.status ?? "0x1", 16) === 1;

    return (
        <div className="space-y-4">
            {/* TX Overview */}
            <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                        <CardTitle className="text-white text-sm font-mono">Transaction</CardTitle>
                        <Badge variant={success ? "default" : "destructive"}>
                            {success ? "✅ Success" : "❌ Reverted"}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs font-mono">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-gray-400">Hash</span>
                        <span className="text-white break-all">{hash}</span>
                        <span className="text-gray-400">Block</span>
                        <span className="text-white">{tx?.blockNumber ? parseInt(tx.blockNumber, 16) : "—"}</span>
                        <span className="text-gray-400">From</span>
                        <span className="text-blue-300">{tx?.from ?? "—"}</span>
                        <span className="text-gray-400">To</span>
                        <span className="text-blue-300">{tx?.to ?? "Contract Creation"}</span>
                        <span className="text-gray-400">Value</span>
                        <span className="text-white">{tx?.value ? (Number(BigInt(tx.value)) / 1e18).toFixed(6) : "0"} ETH</span>
                        <span className="text-gray-400">Gas Used</span>
                        <span className="text-white">{receipt?.gasUsed ? parseInt(receipt.gasUsed, 16).toLocaleString() : "—"}</span>
                    </div>
                </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="debugger">
                <TabsList className="bg-gray-800 border-gray-700">
                    <TabsTrigger value="debugger" className="text-xs">EVM Debugger</TabsTrigger>
                    <TabsTrigger value="calltree" className="text-xs">Call Tree</TabsTrigger>
                    <TabsTrigger value="storage" className="text-xs">Storage Diff</TabsTrigger>
                    <TabsTrigger value="raw" className="text-xs">Raw Input</TabsTrigger>
                </TabsList>

                <TabsContent value="debugger">
                    {loading ? (
                        <div className="text-gray-500 text-sm py-8 text-center">Loading trace…</div>
                    ) : (
                        <OpcodeTrace steps={structLogs} />
                    )}
                </TabsContent>

                <TabsContent value="calltree">
                    {callTrace ? <CallTree node={callTrace} /> : (
                        <div className="text-gray-500 text-sm py-4">No call trace available</div>
                    )}
                </TabsContent>

                <TabsContent value="storage">
                    <StorageDiff diffs={storageDiffs} />
                </TabsContent>

                <TabsContent value="raw">
                    <Card className="bg-gray-900 border-gray-700">
                        <CardContent className="pt-4">
                            <pre className="text-xs font-mono text-green-300 break-all whitespace-pre-wrap">
                                {tx?.input ?? "0x"}
                            </pre>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
