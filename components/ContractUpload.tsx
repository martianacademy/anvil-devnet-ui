"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface Props {
    onRegistered?: () => void;
}

export function ContractUpload({ onRegistered }: Props) {
    const [address, setAddress] = useState("");
    const [name, setName] = useState("");
    const [abi, setAbi] = useState("");
    const [source, setSource] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

    const submit = async () => {
        if (!address || !name || !abi) return;
        setLoading(true);
        try {
            JSON.parse(abi); // validate JSON
            const res = await fetch("/api/contracts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ address, name, abi, source }),
            });
            if (res.ok) {
                setStatus("success");
                onRegistered?.();
                setAddress(""); setName(""); setAbi(""); setSource("");
            } else {
                setStatus("error");
            }
        } catch {
            setStatus("error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm">Register Contract ABI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div>
                    <Label className="text-gray-400 text-xs">Contract Address</Label>
                    <Input
                        className="h-8 font-mono bg-gray-800 border-gray-600 text-white text-xs"
                        placeholder="0x..."
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                    />
                </div>
                <div>
                    <Label className="text-gray-400 text-xs">Contract Name</Label>
                    <Input
                        className="h-8 bg-gray-800 border-gray-600 text-white text-xs"
                        placeholder="MyToken"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </div>
                <div>
                    <Label className="text-gray-400 text-xs">ABI (JSON)</Label>
                    <Textarea
                        className="font-mono bg-gray-800 border-gray-600 text-white text-xs h-32"
                        placeholder='[{"name":"transfer","type":"function",...}]'
                        value={abi}
                        onChange={(e) => setAbi(e.target.value)}
                    />
                </div>
                <div>
                    <Label className="text-gray-400 text-xs">Source Code (optional)</Label>
                    <Textarea
                        className="font-mono bg-gray-800 border-gray-600 text-white text-xs h-20"
                        placeholder="// SPDX-License-Identifier: MIT..."
                        value={source}
                        onChange={(e) => setSource(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" onClick={submit} disabled={loading || !address || !name || !abi}>
                        {loading ? "Registering…" : "Register Contract"}
                    </Button>
                    {status === "success" && <Badge className="bg-green-700">✓ Registered</Badge>}
                    {status === "error" && <Badge variant="destructive">Failed</Badge>}
                </div>
            </CardContent>
        </Card>
    );
}
