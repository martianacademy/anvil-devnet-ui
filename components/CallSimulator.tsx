"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export function CallSimulator() {
    const [to, setTo] = useState("");
    const [from, setFrom] = useState("");
    const [data, setData] = useState("");
    const [value, setValue] = useState("0");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);

    const simulate = async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch("/api/simulate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to,
                    from: from || undefined,
                    data: data || "0x",
                    value: value ? `0x${BigInt(Math.floor(parseFloat(value) * 1e18)).toString(16)}` : "0x0",
                }),
            });
            setResult(await res.json());
        } catch (e: any) {
            setResult({ error: e.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-700">
                <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm">🧪 Call Simulator</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <Label className="text-gray-400 text-xs">To (Contract)</Label>
                            <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                placeholder="0x..." value={to} onChange={(e) => setTo(e.target.value)} />
                        </div>
                        <div>
                            <Label className="text-gray-400 text-xs">From (optional)</Label>
                            <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                                placeholder="0x..." value={from} onChange={(e) => setFrom(e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <Label className="text-gray-400 text-xs">Calldata (hex)</Label>
                        <Input className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                            placeholder="0x..." value={data} onChange={(e) => setData(e.target.value)} />
                    </div>
                    <div>
                        <Label className="text-gray-400 text-xs">Value (ETH)</Label>
                        <Input className="h-8 bg-gray-800 border-gray-600 text-white text-xs"
                            value={value} onChange={(e) => setValue(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={simulate} disabled={loading || !to}>
                            {loading ? "Simulating…" : "Simulate"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {result && (
                <Card className={`border-gray-700 ${result.success ? "bg-green-950/20" : "bg-red-950/20"}`}>
                    <CardHeader className="pb-2">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-white text-sm">Result</CardTitle>
                            <Badge variant={result.success ? "default" : "destructive"}>
                                {result.success ? "✅ Would succeed" : "❌ Would revert"}
                            </Badge>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs font-mono">
                        {result.error && <p className="text-red-400">{result.error}</p>}
                        {result.gasEstimate && (
                            <p className="text-gray-300">Gas estimate: <span className="text-white">{parseInt(result.gasEstimate).toLocaleString()}</span></p>
                        )}
                        {result.returnData && result.returnData !== "0x" && (
                            <p className="text-gray-300">Return data: <span className="text-green-300 break-all">{result.returnData}</span></p>
                        )}
                        {result.sstores && result.sstores.length > 0 && (
                            <div>
                                <p className="text-orange-400 font-bold mb-1">Storage writes:</p>
                                {result.sstores.map((s: any, i: number) => (
                                    <p key={i} className="text-gray-300">
                                        slot[<span className="text-white">{s.slot}</span>] = <span className="text-yellow-300">{s.value}</span>
                                    </p>
                                ))}
                            </div>
                        )}
                        {result.events && result.events.length > 0 && (
                            <div>
                                <p className="text-blue-400 font-bold mb-1">Events emitted: {result.events.length}</p>
                                {result.events.slice(0, 3).map((e: any, i: number) => (
                                    <p key={i} className="text-gray-400 truncate">{e.topics?.[0]?.slice(0, 18)}…</p>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
