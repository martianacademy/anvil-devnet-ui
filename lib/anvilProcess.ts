import { spawn, execFileSync, ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/** Fetch the latest block number from an RPC endpoint via eth_blockNumber. */
export async function fetchLatestBlock(rpcUrl: string): Promise<number> {
    const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
        signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Failed to fetch latest block: HTTP ${res.status}`);
    const json = await res.json();
    if (json.error) throw new Error(`RPC error: ${json.error.message}`);
    return parseInt(json.result, 16);
}

export interface AnvilConfig {
    chainId: number;
    port: number;
    blockTime: number;
    accounts: number;
    balance: number;
    baseFee: number;
    stepsTracing: boolean;
    persistState: boolean;
    stateFile: string;
    forkUrl?: string;
    forkBlockNumber?: number;
    noMining?: boolean;
}

export interface AnvilState {
    proc: ChildProcess | null;
    config: AnvilConfig | null;
    startedAt: number | null;
    logBuffer: string[];
    logPath: string | null;
    stateFile: string | null;
    lastError: string | null;
    projectId: string;
}

const MAX_LOG_LINES = 500;
/** Anvil is considered failed to boot after this long. */
const START_TIMEOUT_MS = 20_000;
const READY_POLL_MS = 250;
/** How long SIGTERM gets before SIGKILL. */
const GRACEFUL_STOP_MS = 3_000;

/** Where state dumps and logs live — honours TMPDIR instead of hard-coding /tmp. */
export const RUNTIME_DIR = path.join(os.tmpdir(), "anvil-devnet-ui");

function ensureRuntimeDir() {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

export function logPathFor(projectKey: string): string {
    return path.join(RUNTIME_DIR, `anvil-${projectKey}.log`);
}

export function stateFilePath(projectKey: string, chainId: number, fork: boolean): string {
    const suffix = fork ? "-fork" : "";
    const name = projectKey === LEGACY_KEY ? `chain-${chainId}` : projectKey;
    return path.join(RUNTIME_DIR, `state-${name}${suffix}.json`);
}

/** Map of projectId → AnvilState for multi-instance support */
const instances = new Map<string, AnvilState>();

/** Legacy single-instance key, used when no project is selected. */
export const LEGACY_KEY = "__default__";

function getOrCreateState(projectId: string): AnvilState {
    let state = instances.get(projectId);
    if (!state) {
        state = {
            proc: null,
            config: null,
            startedAt: null,
            logBuffer: [],
            logPath: null,
            stateFile: null,
            lastError: null,
            projectId,
        };
        instances.set(projectId, state);
    }
    return state;
}

/** Get state for a specific project (or the legacy default). */
export function getAnvilState(projectId?: string): AnvilState {
    return getOrCreateState(projectId ?? LEGACY_KEY);
}

/** Get all known instances (running or not). */
export function getAllInstances(): Map<string, AnvilState> {
    return instances;
}

export async function startAnvil(config: AnvilConfig, projectId?: string): Promise<AnvilConfig> {
    const key = projectId ?? LEGACY_KEY;
    const state = getOrCreateState(key);

    if (state.proc && !state.proc.killed) {
        throw new Error("Anvil is already running for this project");
    }
    if (await isPortInUse(config.port)) {
        throw new Error(`Port ${config.port} is already in use — stop the other node or pick a different port`);
    }

    // Auto-resolve fork block number so restarts are reproducible.
    if (config.forkUrl && !config.forkBlockNumber) {
        const latestBlock = await fetchLatestBlock(config.forkUrl);
        config = { ...config, forkBlockNumber: latestBlock };
    }

    ensureRuntimeDir();
    const stateFile = resolveStateFile(config, key);
    const logPath = logPathFor(key);

    return new Promise((resolve, reject) => {
        const args = buildAnvilArgs(config, stateFile);

        let proc: ChildProcess;
        try {
            proc = spawn("anvil", args, { detached: false });
        } catch (err) {
            reject(new Error(`Failed to spawn anvil — is Foundry installed and on your PATH? (${err instanceof Error ? err.message : err})`));
            return;
        }

        state.proc = proc;
        state.config = config;
        state.startedAt = Date.now();
        state.logBuffer = [];
        state.logPath = logPath;
        state.stateFile = stateFile;
        state.lastError = null;

        const logFile = fs.createWriteStream(logPath, { flags: "a" });
        logFile.on("error", () => { /* logging must never crash the server */ });

        const handleOutput = (data: Buffer) => {
            for (const line of data.toString().split("\n")) {
                if (!line.trim()) continue;
                state.logBuffer.push(line);
                if (state.logBuffer.length > MAX_LOG_LINES) state.logBuffer.shift();
            }
            logFile.write(data);
        };

        proc.stdout?.on("data", handleOutput);
        proc.stderr?.on("data", handleOutput);

        let settled = false;
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearInterval(poll);
            fn();
        };

        proc.on("error", (err) => {
            state.proc = null;
            state.config = null;
            state.lastError = err.message;
            logFile.end();
            finish(() => reject(
                (err as NodeJS.ErrnoException).code === "ENOENT"
                    ? new Error("`anvil` not found on PATH — install Foundry: https://book.getfoundry.sh/getting-started/installation")
                    : err
            ));
        });

        proc.on("exit", (code) => {
            const wasStarting = !settled;
            state.proc = null;
            state.config = null;
            state.startedAt = null;
            logFile.end();
            if (wasStarting) {
                const tail = state.logBuffer.slice(-5).join(" | ");
                state.lastError = tail || `anvil exited with code ${code}`;
                finish(() => reject(new Error(`Anvil exited during startup (code ${code}): ${tail}`)));
            }
        });

        const deadline = Date.now() + START_TIMEOUT_MS;
        const poll = setInterval(async () => {
            if (await isPortInUse(config.port)) {
                finish(() => resolve(config));
                return;
            }
            if (Date.now() > deadline) {
                const tail = state.logBuffer.slice(-5).join(" | ");
                finish(() => reject(new Error(`Anvil failed to start within ${START_TIMEOUT_MS / 1000}s${tail ? `: ${tail}` : ""}`)));
            }
        }, READY_POLL_MS);
    });
}

function resolveStateFile(config: AnvilConfig, projectKey: string): string {
    const auto = stateFilePath(projectKey, config.chainId, Boolean(config.forkUrl));
    const custom = config.stateFile?.trim();
    // Treat the historical hard-coded default as "unset" so per-project files win.
    if (!custom || custom === "/tmp/anvil-devnet-state.json") return auto;
    return custom;
}

export function buildAnvilArgs(config: AnvilConfig, stateFile: string): string[] {
    const args: string[] = [
        "--chain-id", String(config.chainId),
        "--port", String(config.port),
        "--host", "0.0.0.0",
        "--accounts", String(config.accounts),
        "--balance", String(config.balance),
        "--base-fee", String(config.baseFee),
        "--order", "fifo",
    ];

    // `--block-time 0` is rejected by anvil; omitting it means "mine on demand".
    if (config.blockTime > 0) args.push("--block-time", String(config.blockTime));
    if (config.stepsTracing !== false) args.push("--steps-tracing");

    if (config.forkUrl) {
        args.push("--fork-url", config.forkUrl);
        if (config.forkBlockNumber) args.push("--fork-block-number", String(config.forkBlockNumber));
        args.push("--no-storage-caching");
        args.push("--retries", "5");
    }

    if (config.noMining) args.push("--no-mining");

    if (config.persistState) {
        if (fs.existsSync(stateFile)) args.push("--load-state", stateFile);
        args.push("--dump-state", stateFile);
    }

    return args;
}

export async function stopAnvil(projectId?: string, port?: number): Promise<void> {
    const key = projectId ?? LEGACY_KEY;
    const state = getOrCreateState(key);
    const usePort = port ?? state.config?.port;
    const proc = state.proc;

    state.proc = null;
    state.config = null;
    state.startedAt = null;

    if (proc && !proc.killed) {
        await new Promise<void>((resolve) => {
            const kill = setTimeout(() => {
                try { proc.kill("SIGKILL"); } catch { /* already gone */ }
            }, GRACEFUL_STOP_MS);
            proc.once("exit", () => {
                clearTimeout(kill);
                resolve();
            });
            try {
                proc.kill("SIGTERM");
            } catch {
                clearTimeout(kill);
                resolve();
            }
        });
    }

    // A previous dev-server reload can leave an orphan anvil holding the port.
    if (usePort !== undefined) killOrphanAnvil(usePort);
}

/** Kill a leftover anvil holding `port` — never touches non-anvil processes. */
export function killOrphanAnvil(port: number): boolean {
    for (const pid of pidsOnPort(port)) {
        if (!isAnvilPid(pid)) continue;
        try {
            process.kill(pid, "SIGKILL");
            return true;
        } catch { /* already gone */ }
    }
    return false;
}

function pidsOnPort(port: number): number[] {
    try {
        const out = execFileSync("lsof", ["-ti", `:${port}`, "-sTCP:LISTEN"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        return out.split("\n").map((l) => parseInt(l.trim(), 10)).filter((n) => Number.isInteger(n) && n > 0);
    } catch {
        return [];
    }
}

function isAnvilPid(pid: number): boolean {
    try {
        const cmd = execFileSync("ps", ["-p", String(pid), "-o", "comm="], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        return cmd.trim().split("/").pop() === "anvil";
    } catch {
        return false;
    }
}

/** True when something answers a JSON-RPC request on the port. */
export async function isPortInUse(port: number, timeoutMs = 600): Promise<boolean> {
    try {
        const res = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        return res.ok;
    } catch {
        return false;
    }
}

export function getAnvilLogs(projectId?: string): string[] {
    return instances.get(projectId ?? LEGACY_KEY)?.logBuffer ?? [];
}

export function isAnvilRunning(projectId?: string): boolean {
    const state = instances.get(projectId ?? LEGACY_KEY);
    return !!state?.proc && !state.proc.killed;
}

/** Stop every tracked instance — used on graceful shutdown. */
export async function stopAllAnvils(): Promise<void> {
    await Promise.all([...instances.keys()].map((key) => stopAnvil(key === LEGACY_KEY ? undefined : key)));
}
