"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
        <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60 bg-muted/30">
                <span className="text-sm font-semibold text-foreground">Register Contract ABI</span>
            </div>
            <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Contract Address</Label>
                    <Input className="h-9 font-mono text-sm" placeholder="0x..." value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Contract Name</Label>
                    <Input className="h-9 text-sm" placeholder="MyToken" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">ABI (JSON)</Label>
                    <Textarea className="font-mono text-xs h-32" placeholder='[{"name":"transfer","type":"function",...}]' value={abi} onChange={(e) => setAbi(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs">Source Code (optional)</Label>
                    <Textarea className="font-mono text-xs h-20" placeholder="// SPDX-License-Identifier: MIT..." value={source} onChange={(e) => setSource(e.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                    <Button size="sm" onClick={submit} disabled={loading || !address || !name || !abi}>
                        {loading ? "Registering…" : "Register Contract"}
                    </Button>
                    {status === "success" && <Badge className="bg-green-500/20 text-green-400 border border-green-500/30">✓ Registered</Badge>}
                    {status === "error" && <Badge variant="destructive">Failed</Badge>}
                </div>
            </div>
        </div>
    );
}
