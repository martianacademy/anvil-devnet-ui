import { getAnvilState, getAllInstances, listAnvilProcessesCached } from "./anvilProcess.ts";
import { listProjects } from "./projectStore.ts";

export interface ActiveTarget {
    port: number;
    chainId: number;
    projectId: string | null;
    /** Where the answer came from — useful for debugging "wrong port" reports. */
    source: "explicit" | "instance" | "discovered" | "database" | "default";
}

/**
 * Where to look when nothing is running yet. Override with DEVNET_RPC_PORT when the
 * node this app manages is not on the conventional 8545 (e.g. because an explorer
 * indexes a dedicated devnet port).
 */
const DEFAULT_PORT = Number(process.env.DEVNET_RPC_PORT ?? 8545) || 8545;
const DEFAULT_CHAIN_ID = Number(process.env.DEVNET_CHAIN_ID ?? 31337) || 31337;

const DEFAULT_TARGET: ActiveTarget = {
    port: DEFAULT_PORT,
    chainId: DEFAULT_CHAIN_ID,
    projectId: null,
    source: "default",
};

/** The DB fallback is the only expensive branch; cache it briefly so the SSE poll loop doesn't hammer SQLite. */
const DB_CACHE_TTL_MS = 1000;
let cachedProjects: ProjectTarget[] = [];
let cachedAt = 0;

export function invalidateActiveProjectCache() {
    cachedAt = 0;
}

/**
 * Resolve which Anvil instance API routes should talk to.
 * Priority: explicit projectId > live in-process instance > project row marked running > legacy default.
 */
export function resolveActiveProject(projectId?: string | null): ActiveTarget {
    if (projectId) {
        const state = getAnvilState(projectId);
        if (state.config) {
            return {
                port: state.config.port,
                chainId: state.config.chainId,
                projectId,
                source: "explicit",
            };
        }
        const fromDb = lookupProjects().find((p) => p.projectId === projectId);
        if (fromDb) return { ...fromDb, source: "explicit" };
    }

    for (const [key, state] of getAllInstances()) {
        if (state.proc && !state.proc.killed && state.config) {
            return {
                port: state.config.port,
                chainId: state.config.chainId,
                projectId: key === "__default__" ? null : key,
                source: "instance",
            };
        }
    }

    // Nothing in memory: a dev-server reload loses the handles, and a node may have
    // been started from a terminal. Trust what is actually listening over any config.
    const listening = listAnvilProcessesCached();
    if (listening.length > 0) {
        const preferred = listening.find((proc) => proc.port === DEFAULT_PORT) ?? listening[0];
        return {
            port: preferred.port,
            chainId: DEFAULT_CHAIN_ID,
            projectId: preferred.projectId,
            source: "discovered",
        };
    }

    const running = lookupProjects().find((p) => p.running);
    if (running) {
        return { port: running.port, chainId: running.chainId, projectId: running.projectId, source: "database" };
    }

    const legacy = getAnvilState();
    if (legacy.config) {
        return {
            port: legacy.config.port,
            chainId: legacy.config.chainId,
            projectId: null,
            source: "default",
        };
    }

    return DEFAULT_TARGET;
}

/**
 * Same as `resolveActiveProject`, but honours an explicit target coming from the
 * client (`?projectId=…` or the `x-project-id` header) so a multi-project UI can
 * pin every request to one node.
 */
export function resolveFromRequest(req: Request): ActiveTarget {
    let requested: string | null = null;
    try {
        requested = new URL(req.url).searchParams.get("projectId");
    } catch {
        /* relative URL — ignore */
    }
    return resolveActiveProject(requested ?? req.headers.get("x-project-id"));
}

interface ProjectTarget {
    port: number;
    chainId: number;
    projectId: string;
    running: boolean;
}

function lookupProjects(): ProjectTarget[] {
    const now = Date.now();
    if (cachedAt !== 0 && now - cachedAt < DB_CACHE_TTL_MS) return cachedProjects;
    try {
        cachedProjects = listProjects().map((p) => ({
            port: p.port,
            chainId: p.chain_id,
            projectId: p.id,
            running: p.status === "running",
        }));
    } catch {
        cachedProjects = [];
    }
    cachedAt = now;
    return cachedProjects;
}
