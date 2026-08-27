import { execFile, execFileSync, spawn } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Keeps the Blockscout stack pointed at whatever node this app is running.
 *
 * Blockscout is configured at container-start time (chain id, RPC port) and
 * indexes by block height, so a devnet that restarts at block 0 — or comes back
 * on a different chain id — leaves the explorer serving a chain that no longer
 * exists. Every start/reset therefore recreates the containers with fresh env and
 * an empty database.
 */

export type ExplorerSyncStatus = "idle" | "syncing" | "ready" | "error" | "unavailable";

export interface ExplorerSyncState {
    status: ExplorerSyncStatus;
    chainId: number | null;
    port: number | null;
    message: string | null;
    startedAt: number | null;
    finishedAt: number | null;
}

/**
 * Dev-mode module reloads would otherwise give each compiled copy its own state,
 * so the status route could read a stale sync from a previous module instance.
 */
interface SyncGlobal {
    state: ExplorerSyncState;
    pending: Promise<void>;
}

const globalStore = globalThis as typeof globalThis & { __devnetExplorerSync?: SyncGlobal };

globalStore.__devnetExplorerSync ??= {
    state: { status: "idle", chainId: null, port: null, message: null, startedAt: null, finishedAt: null },
    pending: Promise.resolve(),
};

const store = globalStore.__devnetExplorerSync;

export function getExplorerSyncState(): ExplorerSyncState {
    return store.state;
}

export interface ExplorerConfig {
    chainId: number | null;
    port: number | null;
}

let configCache: { at: number; value: ExplorerConfig } = { at: 0, value: { chainId: null, port: null } };
const CONFIG_CACHE_TTL_MS = 5000;

/**
 * What the running Blockscout backend is actually configured for, read from the
 * container rather than from this process's env — the two drift as soon as the
 * stack is reconfigured for a different node.
 */
export function readExplorerConfig(): ExplorerConfig {
    const now = Date.now();
    if (now - configCache.at < CONFIG_CACHE_TTL_MS) return configCache.value;

    let value: ExplorerConfig = { chainId: null, port: null };
    try {
        const raw = execFileSync("docker", [ "inspect", "backend", "--format", "{{json .Config.Env}}" ], {
            encoding: "utf8",
            stdio: [ "ignore", "pipe", "ignore" ],
            timeout: 5000,
        });
        const env: string[] = JSON.parse(raw);
        const find = (key: string) => env.find((entry) => entry.startsWith(`${key}=`))?.split("=").slice(1).join("=");

        const chainId = Number(find("CHAIN_ID"));
        const url = find("ETHEREUM_JSONRPC_HTTP_URL") ?? "";
        const port = Number(url.match(/:(\d+)\/?$/)?.[1]);

        value = {
            chainId: Number.isFinite(chainId) ? chainId : null,
            port: Number.isFinite(port) ? port : null,
        };
    } catch {
        /* container not running */
    }

    configCache = { at: now, value };
    return value;
}

/** Force the next {@link readExplorerConfig} to hit docker again. */
function invalidateConfigCache() {
    configCache = { at: 0, value: configCache.value };
}

const FOLLOW_COOLDOWN_MS = 60_000;
let lastFollowAt = 0;
let lastSeen: { chainId: number; port: number } | null = null;

/**
 * Keep the explorer pointed at whatever node is actually running.
 *
 * Called by the watcher on an interval. A node has to be observed twice with the
 * same identity before the stack is recreated, so a node that is mid-restart does
 * not cost a full reindex.
 */
export function followNode(node: { chainId: number; port: number }): void {
    if (AUTOSYNC_DISABLED || store.state.status === "syncing") {
        return;
    }

    const stable = lastSeen?.chainId === node.chainId && lastSeen?.port === node.port;
    lastSeen = node;
    if (!stable) {
        return;
    }

    const config = readExplorerConfig();
    if (config.chainId === null || config.port === null) {
        return;
    }
    if (config.chainId === node.chainId && config.port === node.port) {
        return;
    }
    if (Date.now() - lastFollowAt < FOLLOW_COOLDOWN_MS) {
        return;
    }

    lastFollowAt = Date.now();
    syncExplorer(node.chainId, node.port);
}

/** Where the Blockscout compose files live — cloned next to this repo by stack/setup.sh. */
export function composeDir(): string | null {
    const configured = process.env.DEVNET_COMPOSE_DIR;
    const candidates = configured ?
        [ configured ] :
        [ path.join(process.cwd(), "..", "blockscout", "docker-compose") ];

    for (const dir of candidates) {
        if (fs.existsSync(path.join(dir, "anvil.yml")) && fs.existsSync(path.join(dir, "devnet.override.yml"))) {
            return path.resolve(dir);
        }
    }
    return null;
}

/**
 * Blockscout's compose keeps Postgres in bind mounts, not named volumes, so
 * `docker compose down -v` leaves the old chain's data on disk. These are the
 * directories that actually have to go for a clean reindex.
 */
const DATA_DIRS = [
    "services/blockscout-db-data",
    "services/stats-db-data",
    "services/dets",
];

function wipeDataDirs(dir: string): void {
    for (const relative of DATA_DIRS) {
        const target = path.resolve(dir, relative);
        // Never delete outside the compose directory, whatever the config says.
        if (!target.startsWith(path.resolve(dir))) continue;
        fs.rmSync(target, { recursive: true, force: true });
    }
}

function frontendDir(): string | null {
    const dir = process.env.DEVNET_FRONTEND_DIR ?? path.join(process.cwd(), "..", "blockscout-frontend");
    return fs.existsSync(path.join(dir, ".env.local")) ? path.resolve(dir) : null;
}

const AUTOSYNC_DISABLED = process.env.DEVNET_EXPLORER_AUTOSYNC === "0";
/**
 * Where to ask whether the explorer is back. Not a constant because "localhost"
 * is only right on the host path — inside a container it is the container, so
 * readiness never arrives and a successful sync reports a four-minute timeout.
 * The compose file points this at the proxy service.
 */
const BACKEND_URL = process.env.DEVNET_EXPLORER_API ?? "http://localhost/api/v2/config/backend-version";

/** True when this API is itself one of the containers in the stack it manages. */
const IN_STACK = process.env.DEVNET_STACK_MODE === "docker";

/**
 * Is the single-origin front door in use?
 *
 * It matters here because recreating Blockscout's nginx resets FRONT_PROXY_PASS
 * to the stock frontend unless devnet-proxy.yml is in the file set — the
 * explorer comes back serving Blockscout's own UI, and /devnet answers 404.
 */
function frontDoorRunning(): boolean {
    try {
        const names = execFileSync("docker", [ "ps", "--format", "{{.Names}}" ], {
            encoding: "utf8",
            timeout: 5_000,
        });
        return names.split("\n").some((name) => name.trim() === "devnet-proxy");
    } catch {
        return false;
    }
}
const READY_TIMEOUT_MS = 4 * 60 * 1000;

function run(command: string, args: string[], options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(
            command,
            args,
            { cwd: options.cwd, env: { ...process.env, ...options.env }, timeout: options.timeoutMs ?? 300_000, maxBuffer: 8 * 1024 * 1024 },
            (error, stdout, stderr) => {
                if (error) {
                    reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || error.message}`));
                    return;
                }
                resolve(stdout);
            }
        );
    });
}

async function waitForBackend(): Promise<boolean> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(BACKEND_URL, { signal: AbortSignal.timeout(3000) });
            if (res.ok) return true;
        } catch {
            /* still booting */
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    return false;
}

/** Chain names for the few networks whose ticker is not ETH. */
const CHAIN_LABELS: Record<number, { name: string; symbol: string; currency: string }> = {
    1: { name: "Ethereum DevNet", symbol: "ETH", currency: "Ether" },
    56: { name: "BNB Chain DevNet", symbol: "BNB", currency: "BNB" },
    97: { name: "BNB Testnet DevNet", symbol: "tBNB", currency: "tBNB" },
    137: { name: "Polygon DevNet", symbol: "POL", currency: "POL" },
    204: { name: "opBNB DevNet", symbol: "BNB", currency: "BNB" },
    8453: { name: "Base DevNet", symbol: "ETH", currency: "Ether" },
    42161: { name: "Arbitrum DevNet", symbol: "ETH", currency: "Ether" },
    43114: { name: "Avalanche DevNet", symbol: "AVAX", currency: "Avalanche" },
    31337: { name: "Anvil DevNet", symbol: "ETH", currency: "Ether" },
};

function labelFor(chainId: number) {
    return CHAIN_LABELS[chainId] ?? { name: `Chain ${chainId} DevNet`, symbol: "ETH", currency: "Ether" };
}

/**
 * Rewrite the explorer UI's build-time network config and restart its dev server,
 * so the chain id, name and ticker it displays match the node.
 */
async function syncFrontend(chainId: number, port: number): Promise<void> {
    const dir = frontendDir();
    if (!dir) return;

    const envPath = path.join(dir, ".env.local");
    const label = labelFor(chainId);
    const rewrites: Record<string, string> = {
        NEXT_PUBLIC_NETWORK_ID: String(chainId),
        NEXT_PUBLIC_NETWORK_NAME: label.name,
        NEXT_PUBLIC_NETWORK_SHORT_NAME: label.name,
        NEXT_PUBLIC_NETWORK_CURRENCY_NAME: label.currency,
        NEXT_PUBLIC_NETWORK_CURRENCY_SYMBOL: label.symbol,
    };

    let contents = fs.readFileSync(envPath, "utf8");
    // Keep whatever host the user exposed the UI on; only the network identity changes.
    contents = contents.replace(/^NEXT_PUBLIC_NETWORK_RPC_URL=(.*):\d+$/m, `NEXT_PUBLIC_NETWORK_RPC_URL=$1:${port}`);
    for (const [key, value] of Object.entries(rewrites)) {
        contents = new RegExp(`^${key}=.*$`, "m").test(contents) ?
            contents.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`) :
            `${contents.trimEnd()}\n${key}=${value}\n`;
    }
    fs.writeFileSync(envPath, contents);

    // NEXT_PUBLIC_* values are baked at boot, so the dev server has to come back up.
    try {
        await run("pkill", [ "-f", "next dev -p 3000" ], { timeoutMs: 10_000 });
    } catch {
        /* not running — nothing to restart */
    }
    const child = spawn("pnpm", [ "dev:local" ], {
        cwd: dir,
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
    });
    child.unref();
}

/**
 * Recreate the Blockscout stack for `chainId`/`port` with an empty database.
 * Returns immediately; progress is readable through {@link getExplorerSyncState}.
 */
export function syncExplorer(chainId: number, port: number): ExplorerSyncState {
    if (AUTOSYNC_DISABLED) {
        return store.state;
    }

    const dir = composeDir();
    if (!dir) {
        store.state = {
            status: "unavailable",
            chainId,
            port,
            message: "Blockscout compose files not found — run stack/setup.sh, or set DEVNET_COMPOSE_DIR.",
            startedAt: Date.now(),
            finishedAt: Date.now(),
        };
        return store.state;
    }

    store.state = { status: "syncing", chainId, port, message: "Recreating the explorer with an empty database…", startedAt: Date.now(), finishedAt: null };

    const env = {
        DEVNET_RPC_PORT: String(port),
        DEVNET_CHAIN_ID: String(chainId),
        DEVNET_FIRST_BLOCK: "0",
        // Which host the indexer reaches the node on. On the host path that is
        // the Docker host; when this API runs as a container, the node is inside
        // it and host.docker.internal would point at the wrong machine.
        DEVNET_RPC_HOST: process.env.DEVNET_RPC_HOST ?? "host.docker.internal",
        // The containerised UI reads its network identity from compose, so the
        // same labels the host path writes into .env.local are passed here.
        DEVNET_NETWORK_NAME: labelFor(chainId).name,
        DEVNET_CURRENCY_NAME: labelFor(chainId).currency,
        DEVNET_CURRENCY_SYMBOL: labelFor(chainId).symbol,
    };

    store.pending = store.pending
        .catch(() => { })
        .then(async () => {
            const compose = [ "compose", "-f", "anvil.yml", "-f", "devnet.override.yml" ];
            const withFrontDoor = frontDoorRunning();
            if (withFrontDoor) {
                compose.push("-f", "devnet-proxy.yml");
            }

            // --timeout caps the backend's five-minute stop grace period.
            await run("docker", [ ...compose, "down", "-v", "--timeout", "15" ], { cwd: dir, env, timeoutMs: 180_000 });

            // The databases live in bind mounts, which `down -v` does not touch.
            wipeDataDirs(dir);

            // --pull never: the images are already local, and a flaky registry
            // should not take the explorer down.
            await run("docker", [ ...compose, "up", "-d", "--pull", "never" ], { cwd: dir, env, timeoutMs: 300_000 });

            store.state = { ...store.state, message: "Waiting for the indexer to come up…" };
            const ready = await waitForBackend();

            // nginx resolves the backend once at boot; a recreated backend gets a new IP.
            await run("docker", [ "restart", "proxy" ], { cwd: dir, timeoutMs: 60_000 }).catch(() => { });

            // And the front door resolved *those* once, so it is now pointing at
            // addresses that no longer exist — 502 on everything it forwards.
            if (withFrontDoor) {
                await run("docker", [ "restart", "devnet-proxy" ], { cwd: dir, timeoutMs: 60_000 }).catch(() => { });
            }

            // The host path rewrites the frontend's .env.local; a containerised UI
            // has no such file — its network identity comes from compose, so the
            // container has to be recreated to pick up the new chain. --no-deps
            // keeps it from recreating this very API out from under itself.
            if (IN_STACK) {
                await run("docker", [
                    ...compose, "-f", "devnet-stack.yml",
                    "up", "-d", "--force-recreate", "--no-deps", "--pull", "never", "devnet-ui",
                ], { cwd: dir, env, timeoutMs: 180_000 }).catch(() => { });
            } else {
                await syncFrontend(chainId, port).catch(() => { });
            }
            invalidateConfigCache();

            store.state = {
                status: ready ? "ready" : "error",
                chainId,
                port,
                message: ready ?
                    `Explorer reindexing chain ${chainId} from block 0.` :
                    "The explorer did not come up in time — check `docker compose logs backend`.",
                startedAt: store.state.startedAt,
                finishedAt: Date.now(),
            };
        })
        .catch((error: unknown) => {
            store.state = {
                status: "error",
                chainId,
                port,
                message: error instanceof Error ? error.message : "Explorer sync failed",
                startedAt: store.state.startedAt,
                finishedAt: Date.now(),
            };
        });

    return store.state;
}
