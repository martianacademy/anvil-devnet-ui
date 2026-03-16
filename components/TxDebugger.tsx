"use client";

import { useState, useEffect } from "react";
import { useDevnetStore } from "@/store/useDevnetStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { OpcodeTrace } from "./OpcodeTrace";
import { CallTree } from "./CallTree";
import { StorageDiff } from "./StorageDiff";
import { TraceLog } from "./TraceLog";
import { parseStructLogs, extractStorageDiffs } from "@/lib/traceParser";

interface Props {
    hash: string;
    tx: Record<string, unknown>;
    receipt: Record<string, unknown> | null;
}

export function TxDebugger({ hash, tx, receipt }: Props) {
    const { setTraceSteps, setCallTree } = useDevnetStore();
    const [loading, setLoading] = useState(true);
    const [structLogs, setStructLogs] = useState<ReturnType<typeof parseStructLogs>>([]);
    const [callTrace, setCallTrace] = useState<Parameters<typeof CallTree>[0]["node"] | null>(null);
    const [traceError, setTraceError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/tx/${hash}/trace`)
            .then((r) => r.json())
            .then((data) => {
                const steps = parseStructLogs(data.structLogs ?? []);
                setStructLogs(steps);
                setTraceSteps(steps);
                setCallTrace(data.callTrace ?? null);
                setCallTree(data.callTrace ?? null);
                setTraceError(data.traceError ?? null);
            })
            .finally(() => setLoading(false));
    }, [hash, setTraceSteps, setCallTree]);

    const storageDiffs = extractStorageDiffs(structLogs);

    if (loading) {
        return (
            <div className="text-muted-foreground text-sm py-8 text-center animate-pulse">
                Loading trace…
            </div>
        );
    }

    return (
        <Tabs defaultValue="tracelog" className="space-y-3">
            <TabsList className="bg-muted/50 border border-border">
                <TabsTrigger value="tracelog" className="text-xs">
                    Trace Log
                </TabsTrigger>
                <TabsTrigger value="debugger" className="text-xs">
                    Step Debugger
                </TabsTrigger>
                <TabsTrigger value="calltree" className="text-xs">
                    Call Tree
                </TabsTrigger>
                <TabsTrigger value="storage" className="text-xs">
                    Storage Diff
                </TabsTrigger>
                <TabsTrigger value="raw" className="text-xs">
                    Raw Input
                </TabsTrigger>
            </TabsList>

            <TabsContent value="tracelog">
                <TraceLog
                    steps={structLogs}
                    callTrace={callTrace}
                    traceError={traceError}
                    txTo={(tx?.to as string) ?? undefined}
                />
            </TabsContent>

            <TabsContent value="debugger">
                <OpcodeTrace steps={structLogs} />
            </TabsContent>

            <TabsContent value="calltree">
                {callTrace ? (
                    <CallTree node={callTrace} />
                ) : (
                    <div className="text-muted-foreground text-sm py-4 text-center">
                        {traceError
                            ? "Call trace unavailable (debug RPC not supported)"
                            : "No call trace available"}
                    </div>
                )}
            </TabsContent>

            <TabsContent value="storage">
                <StorageDiff diffs={storageDiffs} />
            </TabsContent>

            <TabsContent value="raw">
                <Card className="bg-muted/20 border-border">
                    <CardContent className="pt-4">
                        <pre className="text-xs font-mono text-green-300 break-all whitespace-pre-wrap">
                            {(tx?.input as string) ?? "0x"}
                        </pre>
                    </CardContent>
                </Card>
            </TabsContent>
        </Tabs>
    );
}
