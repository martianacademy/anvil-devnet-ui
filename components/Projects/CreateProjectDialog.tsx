"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/store/useProjectStore";
import { useToast } from "@/components/ui/toast";
import { Loader2, X } from "lucide-react";

const POPULAR_CHAINS = [
    { chainId: 31337, name: "Anvil (Default)" },
    { chainId: 1, name: "Ethereum Mainnet" },
    { chainId: 56, name: "BNB Smart Chain" },
    { chainId: 137, name: "Polygon" },
    { chainId: 42161, name: "Arbitrum One" },
    { chainId: 10, name: "Optimism" },
    { chainId: 8453, name: "Base" },
    { chainId: 43114, name: "Avalanche" },
];

interface Props {
    open: boolean;
    onClose: () => void;
}

export function CreateProjectDialog({ open, onClose }: Props) {
    const { createProject } = useProjectStore();
    const { toast } = useToast();

    const [name, setName] = useState("");
    const [chainId, setChainId] = useState(31337);
    const [forkUrl, setForkUrl] = useState("");
    const [forkBlock, setForkBlock] = useState("");
    const [loading, setLoading] = useState(false);

    if (!open) return null;

    const handleCreate = async () => {
        if (!name.trim()) {
            toast("Project name is required", "error");
            return;
        }
        setLoading(true);
        try {
            await createProject({
                name: name.trim(),
                chainId,
                forkUrl: forkUrl.trim() || undefined,
                forkBlock: forkBlock ? parseInt(forkBlock) : undefined,
            });
            toast(`Project "${name}" created!`, "success");
            setName("");
            setForkUrl("");
            setForkBlock("");
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to create";
            toast(msg, "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative z-10 w-full max-w-md mx-4 rounded-2xl border border-border/50 bg-card shadow-2xl">
                <div className="flex items-center justify-between px-6 pt-5 pb-3">
                    <h2 className="text-lg font-semibold text-foreground">New Project</h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-accent transition-colors">
                        <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                </div>

                <div className="px-6 pb-6 space-y-4">
                    <div>
                        <Label className="text-muted-foreground text-xs mb-1.5 block">Project Name</Label>
                        <Input
                            placeholder="My Polygon Fork"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="bg-input border-border"
                        />
                    </div>

                    <div>
                        <Label className="text-muted-foreground text-xs mb-1.5 block">Network / Chain</Label>
                        <div className="grid grid-cols-4 gap-1.5">
                            {POPULAR_CHAINS.map((c) => (
                                <button
                                    key={c.chainId}
                                    onClick={() => setChainId(c.chainId)}
                                    className={`px-2 py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
                                        chainId === c.chainId
                                            ? "border-primary bg-primary/15 text-primary"
                                            : "border-border bg-card text-muted-foreground hover:border-primary/30"
                                    }`}
                                >
                                    {c.name}
                                </button>
                            ))}
                        </div>
                        <Input
                            className="mt-2 bg-input border-border text-xs font-mono h-8"
                            placeholder="Or enter custom chain ID..."
                            value={chainId}
                            onChange={(e) => setChainId(parseInt(e.target.value) || 31337)}
                        />
                    </div>

                    <div>
                        <Label className="text-muted-foreground text-xs mb-1.5 block">Fork URL (optional)</Label>
                        <Input
                            placeholder="https://polygon-rpc.com"
                            value={forkUrl}
                            onChange={(e) => setForkUrl(e.target.value)}
                            className="bg-input border-border text-xs font-mono"
                        />
                    </div>

                    {forkUrl && (
                        <div>
                            <Label className="text-muted-foreground text-xs mb-1.5 block">Fork Block # (leave empty for latest)</Label>
                            <Input
                                placeholder="latest"
                                value={forkBlock}
                                onChange={(e) => setForkBlock(e.target.value)}
                                className="bg-input border-border text-xs font-mono"
                            />
                        </div>
                    )}

                    <Button
                        onClick={handleCreate}
                        disabled={loading}
                        className="w-full bg-primary hover:bg-primary/90"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                        Create Project
                    </Button>
                </div>
            </div>
        </div>
    );
}
