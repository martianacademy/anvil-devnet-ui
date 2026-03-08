"use client";

import type { StorageDiff as StorageDiffItem } from "@/lib/traceParser";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
    diffs: StorageDiffItem[];
}

export function StorageDiff({ diffs }: Props) {
    if (!diffs.length) {
        return (
            <Card className="bg-gray-900 border-gray-700">
                <CardContent className="pt-4">
                    <p className="text-gray-500 text-sm">No storage writes in this transaction</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-2">
                <CardTitle className="text-white text-xs font-mono">Storage Writes (SSTORE)</CardTitle>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow className="border-gray-700">
                            <TableHead className="text-gray-400 text-xs">Slot</TableHead>
                            <TableHead className="text-gray-400 text-xs">Before</TableHead>
                            <TableHead className="text-gray-400 text-xs">After</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {diffs.map((d, i) => (
                            <TableRow key={i} className="border-gray-800">
                                <TableCell className="font-mono text-xs text-orange-300">{d.slot}</TableCell>
                                <TableCell className="font-mono text-xs text-red-400">{d.before}</TableCell>
                                <TableCell className="font-mono text-xs text-green-400">{d.after}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
