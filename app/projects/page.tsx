"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { CreateProjectDialog, ProjectCard } from "@/components/Projects";
import { Plus, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProjectsPage() {
    const { projects, loading, fetchProjects } = useProjectStore();
    const [showCreate, setShowCreate] = useState(false);

    useEffect(() => {
        fetchProjects();
        const interval = setInterval(fetchProjects, 5000);
        return () => clearInterval(interval);
    }, [fetchProjects]);

    return (
        <div className="min-h-screen bg-background">
            {/* Hero */}
            <div className="relative overflow-hidden border-b border-border/30">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5" />
                <div className="relative max-w-5xl mx-auto px-4 py-10">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                                    <FolderKanban className="w-5 h-5 text-primary" />
                                </div>
                                <h1 className="text-2xl font-bold text-foreground">Projects</h1>
                            </div>
                            <p className="text-sm text-muted-foreground max-w-md">
                                Each project runs an isolated Anvil instance with its own RPC endpoint, chain data,
                                and state. Create, start, stop, and delete projects independently.
                            </p>
                        </div>
                        <Button
                            onClick={() => setShowCreate(true)}
                            className="bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20"
                        >
                            <Plus className="w-4 h-4 mr-1.5" />
                            New Project
                        </Button>
                    </div>
                </div>
            </div>

            {/* Project Grid */}
            <div className="max-w-5xl mx-auto px-4 py-8">
                {loading && projects.length === 0 ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    </div>
                ) : projects.length === 0 ? (
                    <EmptyState onCreateClick={() => setShowCreate(true)} />
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {projects.map((project) => (
                            <ProjectCard key={project.id} project={project} />
                        ))}
                    </div>
                )}
            </div>

            <CreateProjectDialog open={showCreate} onClose={() => setShowCreate(false)} />
        </div>
    );
}

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 rounded-2xl bg-accent/50 border border-border/50 mb-4">
                <FolderKanban className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No projects yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                Create your first project to spin up an isolated devnet environment with its own
                blockchain data and RPC endpoint.
            </p>
            <Button onClick={onCreateClick} className="bg-primary hover:bg-primary/90">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Your First Project
            </Button>
        </div>
    );
}
