import fs from "fs";
import { getDB } from "./db.ts";
import { logPathFor, stateFilePath } from "./anvilProcess.ts";

export interface Project {
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
}

export interface CreateProjectInput {
    name: string;
    chainId: number;
    forkUrl?: string;
    forkBlock?: number;
    port?: number;
    config?: Record<string, unknown>;
}

function generateId(): string {
    return `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createProject(input: CreateProjectInput): Project {
    const db = getDB();
    const id = generateId();
    const now = Date.now();
    const port = input.port ?? findAvailablePort();

    if (input.port !== undefined && isPortTaken(input.port)) {
        throw new Error(`Port ${input.port} is already assigned to another project`);
    }

    const configJson = input.config ? JSON.stringify(input.config) : null;

    db.prepare(`
    INSERT INTO projects (id, name, chain_id, fork_url, fork_block, port, status, config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'stopped', ?, ?, ?)
  `).run(id, input.name, input.chainId, input.forkUrl ?? null, input.forkBlock ?? null, port, configJson, now, now);

    return getProject(id)!;
}

export interface UpdateProjectInput {
    name?: string;
    chainId?: number;
    forkUrl?: string | null;
    forkBlock?: number | null;
    port?: number;
}

/** Patch a project row. Only the provided fields change. */
export function updateProject(id: string, input: UpdateProjectInput): Project {
    const db = getDB();
    const project = getProject(id);
    if (!project) throw new Error(`Project ${id} not found`);

    if (input.port !== undefined && input.port !== project.port && isPortTaken(input.port)) {
        throw new Error(`Port ${input.port} is already assigned to another project`);
    }

    db.prepare(`
    UPDATE projects
       SET name = ?, chain_id = ?, fork_url = ?, fork_block = ?, port = ?, updated_at = ?
     WHERE id = ?
  `).run(
        input.name ?? project.name,
        input.chainId ?? project.chain_id,
        input.forkUrl === undefined ? project.fork_url : input.forkUrl,
        input.forkBlock === undefined ? project.fork_block : input.forkBlock,
        input.port ?? project.port,
        Date.now(),
        id
    );

    return getProject(id)!;
}

function isPortTaken(port: number, exceptId?: string): boolean {
    const db = getDB();
    const row = db.prepare("SELECT id FROM projects WHERE port = ? AND id IS NOT ?").get(port, exceptId ?? null);
    return Boolean(row);
}

/** Reconcile `status` with reality — process handles are lost across dev-server reloads. */
export function reconcileProjectStatuses(isRunning: (id: string) => boolean): void {
    const db = getDB();
    const rows = db.prepare("SELECT id, status FROM projects").all() as { id: string; status: string }[];
    const update = db.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?");
    const now = Date.now();
    for (const row of rows) {
        const running = isRunning(row.id);
        if (running && row.status !== "running") update.run("running", now, row.id);
        if (!running && row.status === "running") update.run("stopped", now, row.id);
    }
}

export function getProject(id: string): Project | null {
    const db = getDB();
    return db.prepare("SELECT * FROM projects WHERE id = ?").get<Project>(id) ?? null;
}

export function listProjects(): Project[] {
    const db = getDB();
    return db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all() as Project[];
}

export function updateProjectStatus(id: string, status: string): void {
    const db = getDB();
    db.prepare("UPDATE projects SET status = ?, updated_at = ? WHERE id = ?").run(status, Date.now(), id);
}

export function updateProjectConfig(id: string, config: Record<string, unknown>): void {
    const db = getDB();
    db.prepare("UPDATE projects SET config = ?, updated_at = ? WHERE id = ?").run(JSON.stringify(config), Date.now(), id);
}

export function deleteProject(id: string): { deleted: string[] } {
    const db = getDB();
    const project = getProject(id);
    if (!project) throw new Error(`Project ${id} not found`);

    // Cascade delete all project-scoped data in one transaction
    db.transaction(() => {
        for (const table of ["blocks", "transactions", "patch_history", "snapshots", "token_watchlist"]) {
            db.prepare(`DELETE FROM ${table} WHERE project_id = ?`).run(id);
        }
    })();

    // Delete Anvil state files (fork + non-fork variants) and the log
    const deleted: string[] = [];
    for (const fork of [false, true]) {
        const file = stateFilePath(id, project.chain_id, fork);
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
            deleted.push(file);
        }
    }

    const logFile = logPathFor(id);
    if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
        deleted.push(logFile);
    }

    // Finally delete the project record
    db.prepare("DELETE FROM projects WHERE id = ?").run(id);

    return { deleted };
}

/** Find next available port starting from 8545 */
function findAvailablePort(): number {
    const db = getDB();
    const usedPorts = (db.prepare("SELECT port FROM projects").all() as { port: number }[]).map((r) => r.port);
    const usedSet = new Set(usedPorts);

    let port = 8545;
    while (usedSet.has(port)) {
        port++;
    }
    return port;
}
