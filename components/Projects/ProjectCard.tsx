"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjectStore, type ProjectSummary } from "@/store/useProjectStore";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
    Play,
    Square,
    Trash2,
    Copy,
    Check,
    Loader2,
    GitFork,
    Globe,
    Clock,
} from "lucide-react";

interface Props {
    project: ProjectSummary;
}

export function ProjectCard({ project }: Props) {
    const { startProject, stopProject, deleteProject, setActiveProject } = useProjectStore();
    const { toast } = useToast();
    const { confirm } = useConfirm();
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const isRunning = project.isRunning || project.status === "running";
    const isStarting = project.status === "starting";

    const handleStart = async () => {
        setActionLoading("start");
        try {
            await startProject(project.id);
            setActiveProject(project.id);
            toast(`${project.name} started!`, "success");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed";
            toast(msg, "error");
        } finally {
            setActionLoading(null);
        }
    };

    const handleStop = async () => {
        setActionLoading("stop");
        try {
            await stopProject(project.id);
            toast(`${project.name} stopped`, "success");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed";
            toast(msg, "error");
        } finally {
            setActionLoading(null);
        }
    };

    const handleDelete = async () => {
        const ok = await confirm({
            title: "Delete Project",
            description: `This will permanently delete "${project.name}" and all its data including blocks, transactions, and state files. This cannot be undone.`,
            confirmLabel: "Delete Forever",
            variant: "destructive",
        });
        if (!ok) return;

        setActionLoading("delete");
        try {
            await deleteProject(project.id);
            toast(`${project.name} deleted`, "success");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed";
            toast(msg, "error");
        } finally {
            setActionLoading(null);
        }
    };

    const copyRpc = () => {
        navigator.clipboard.writeText(project.rpcUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const createdDate = new Date(project.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    const statusStyles = isRunning
        ? "border-green-800/40 bg-gradient-to-br from-green-950/30 to-card"
        : isStarting
            ? "border-yellow-800/40 bg-gradient-to-br from-yellow-950/20 to-card"
            : "border-border/50 bg-card";

    return (
        <div className={`group relative rounded-2xl border p-5 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 ${statusStyles}`}>
            {/* Status indicator dot */}
            <div className="absolute top-4 right-4">
                <div className={`w-2.5 h-2.5 rounded-full ${
                    isRunning
                        ? "bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.5)] animate-pulse"
                        : isStarting
                            ? "bg-yellow-400 shadow-[0_0_8px_2px_rgba(250,204,21,0.5)] animate-pulse"
                            : "bg-muted-foreground/30"
                }`} />
            </div>

            {/* Header */}
            <div className="mb-3">
                <h3 className="text-base font-semibold text-foreground truncate pr-8">{project.name}</h3>
                <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                        Chain {project.chain_id}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                        Port {project.port}
                    </Badge>
                </div>
            </div>

            {/* Info rows */}
            <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
                {project.fork_url && (
                    <div className="flex items-center gap-1.5">
                        <GitFork className="w-3 h-3 shrink-0" />
                        <span className="truncate font-mono text-[10px]">{project.fork_url}</span>
                    </div>
                )}
                <div className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="font-mono text-[10px]">{project.rpcUrl}</span>
                    <button onClick={copyRpc} className="ml-auto hover:text-foreground transition-colors">
                        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                </div>
                <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>Created {createdDate}</span>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
                {isRunning ? (
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleStop}
                        disabled={actionLoading !== null}
                        className="flex-1 h-8 text-xs"
                    >
                        {actionLoading === "stop" ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Square className="w-3 h-3 mr-1" />}
                        Stop
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        onClick={handleStart}
                        disabled={actionLoading !== null || isStarting}
                        className="flex-1 h-8 text-xs bg-green-700 hover:bg-green-600 text-white"
                    >
                        {actionLoading === "start" || isStarting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Play className="w-3 h-3 mr-1" />}
                        {isStarting ? "Starting..." : "Start"}
                    </Button>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDelete}
                    disabled={actionLoading !== null}
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-950/30"
                >
                    {actionLoading === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </Button>
            </div>
        </div>
    );
}
