"use client";

import { useState, useEffect } from "react";
import { useDevnetStore } from "@/store/useDevnetStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
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

    return (
        <div className="space-y-4">
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
