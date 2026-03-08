"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
    functionName?: string;
    args?: Record<string, unknown>;
    contractName?: string;
    returnData?: string;
    rawInput?: string;
}

function formatArg(value: unknown): string {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return `[${value.map(formatArg).join(", ")}]`;
    if (typeof value === "object" && value !== null) return JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v);
    return String(value);
}

export function AbiDecoder({ functionName, args, contractName, returnData, rawInput }: Props) {
    if (!functionName) {
        return (
            <Card className="bg-gray-900 border-gray-700">
                <CardContent className="pt-4">
                    <p className="text-gray-400 text-xs font-mono">No ABI registered for this contract. Upload ABI to decode.</p>
                    {rawInput && (
                        <p className="text-gray-500 text-xs font-mono break-all mt-2">{rawInput}</p>
                    )}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                    <CardTitle className="text-white text-xs font-mono">Decoded Input</CardTitle>
                    {contractName && <Badge variant="outline" className="text-xs">{contractName}</Badge>}
                </div>
            </CardHeader>
            <CardContent className="space-y-1 text-xs font-mono">
                <div>
                    <span className="text-purple-400 font-bold">{functionName}</span>
                    <span className="text-gray-400">(</span>
                </div>
                {args && Object.entries(args).map(([key, val]) => (
                    <div key={key} className="ml-4">
                        <span className="text-gray-400">{key}: </span>
                        <span className="text-green-300">{formatArg(val)}</span>
                    </div>
                ))}
                <div><span className="text-gray-400">)</span></div>
                {returnData && returnData !== "0x" && (
                    <div className="mt-2">
                        <span className="text-gray-400">returns: </span>
                        <span className="text-yellow-300 break-all">{returnData}</span>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
