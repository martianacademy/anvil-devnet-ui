"use client";

import { create } from "zustand";
import { api, setApiProjectId } from "@/lib/apiClient";

export interface ProjectSummary {
    id: string;
    name: string;
    chain_id: number;
    fork_url: string | null;
    fork_block: number | null;
    port: number;
    status: string;
    config: string | null;
    created_at: number;
    updated_at: number;
    isRunning: boolean;
    rpcUrl: string;
}

export interface CreateProjectInput {
    name: string;
    chainId: number;
    forkUrl?: string;
    forkBlock?: number;
    port?: number;
}

interface ProjectStore {
    projects: ProjectSummary[];
    activeProjectId: string | null;
    loading: boolean;
    error: string | null;

    fetchProjects: () => Promise<void>;
    setActiveProject: (id: string | null) => void;
    createProject: (input: CreateProjectInput) => Promise<ProjectSummary>;
    startProject: (id: string) => Promise<void>;
    stopProject: (id: string) => Promise<void>;
    deleteProject: (id: string) => Promise<void>;
}

const STORAGE_KEY = "anvil-devnet-active-project";

function persistActive(id: string | null) {
    setApiProjectId(id);
    try {
        if (id) localStorage.setItem(STORAGE_KEY, id);
        else localStorage.removeItem(STORAGE_KEY);
    } catch { /* private mode / SSR */ }
}

function restoreActive(): string | null {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
}

const initialActive = typeof window === "undefined" ? null : restoreActive();
setApiProjectId(initialActive);

export const useProjectStore = create<ProjectStore>((set, get) => ({
    projects: [],
    activeProjectId: initialActive,
    loading: false,
    error: null,

    fetchProjects: async () => {
        set({ loading: true });
        try {
            const { projects } = await api.get<{ projects: ProjectSummary[] }>("/api/projects");
            set({ projects, error: null });

            // Keep the selection valid: drop a deleted project, and adopt a
            // running one when nothing is selected yet.
            const current = get().activeProjectId;
            if (current && !projects.some((p) => p.id === current)) {
                persistActive(null);
                set({ activeProjectId: null });
            } else if (!current) {
                const running = projects.find((p) => p.isRunning);
                if (running) {
                    persistActive(running.id);
                    set({ activeProjectId: running.id });
                }
            }
        } catch (err) {
            set({ error: err instanceof Error ? err.message : "Failed to load projects" });
        } finally {
            set({ loading: false });
        }
    },

    setActiveProject: (id) => {
        persistActive(id);
        set({ activeProjectId: id });
    },

    createProject: async (input) => {
        const { project } = await api.post<{ project: ProjectSummary }>("/api/projects", input);
        await get().fetchProjects();
        return project;
    },

    startProject: async (id) => {
        await api.post(`/api/projects/${id}/start`);
        persistActive(id);
        set({ activeProjectId: id });
        await get().fetchProjects();
    },

    stopProject: async (id) => {
        await api.post(`/api/projects/${id}/stop`);
        await get().fetchProjects();
    },

    deleteProject: async (id) => {
        await api.del(`/api/projects/${id}`);
        if (get().activeProjectId === id) {
            persistActive(null);
            set({ activeProjectId: null });
        }
        await get().fetchProjects();
    },
}));
