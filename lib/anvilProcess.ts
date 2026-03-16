import { spawn, execSync, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

/** Fetch the latest block number from an RPC endpoint via eth_blockNumber. */
export async function fetchLatestBlock(rpcUrl: string): Promise<number> {
    const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
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

interface AnvilState {
    proc: ChildProcess | null;
    config: AnvilConfig | null;
    startedAt: number | null;
    logBuffer: string[];
}

const MAX_LOG_LINES = 500;

const state: AnvilState = {
    proc: null,
    config: null,
    startedAt: null,
    logBuffer: [],
};

export function getAnvilState() {
    return state;
}

export async function startAnvil(config: AnvilConfig): Promise<AnvilConfig> {
    if (state.proc && !state.proc.killed) {
        throw new Error("Anvil is already running");
    }

    // Auto-resolve fork block number to pin the fork and avoid excess RPC calls
    if (config.forkUrl && !config.forkBlockNumber) {
        const latestBlock = await fetchLatestBlock(config.forkUrl);
        config = { ...config, forkBlockNumber: latestBlock };
    }

    return new Promise((resolve, reject) => {
        const args: string[] = [
            "--chain-id", String(config.chainId),
            "--port", String(config.port),
            "--host", "0.0.0.0",
            "--accounts", String(config.accounts),
            "--balance", String(config.balance),
            "--block-time", String(config.blockTime),
            "--base-fee", String(config.baseFee),
            "--steps-tracing",
            "--order", "fifo",
        ];

        if (config.forkUrl) {
            args.push("--fork-url", config.forkUrl);
            if (config.forkBlockNumber) {
                args.push("--fork-block-number", String(config.forkBlockNumber));
            }
            // Reduce RPC calls: skip storage slot re-verification
            args.push("--no-storage-caching");
            // Handle transient RPC failures gracefully
            args.push("--retries", "5");
        }

        if (config.noMining) {
            args.push("--no-mining");
        }

        // Use a per-chainId state file so each chain's EVM state (deployed contracts,
        // balances, nonces) is isolated. Fork and non-fork sessions use separate
        // state files because fork state references mainnet block hashes that
        // don't exist in a clean non-fork chain (causes "Best hash not found").
        const forkSuffix = config.forkUrl ? "-fork" : "";
        const defaultStateFile = `/tmp/anvil-state-${config.chainId}${forkSuffix}.json`;
        const stateFile =
            !config.stateFile || config.stateFile === "/tmp/anvil-devnet-state.json"
                ? defaultStateFile
                : config.stateFile;
        if (config.persistState) {
            if (fs.existsSync(stateFile)) {
                args.push("--load-state", stateFile);
            }
            args.push("--dump-state", stateFile);
        }

        const proc = spawn("anvil", args, { detached: false });
        state.proc = proc;
        state.config = config;
        state.startedAt = Date.now();
        state.logBuffer = [];

        // Open log file
        const logFile = fs.createWriteStream("/tmp/anvil-devnet.log", { flags: "a" });

        const handleOutput = (data: Buffer) => {
            const lines = data.toString().split("\n");
            for (const line of lines) {
                if (line.trim()) {
                    state.logBuffer.push(line);
                    if (state.logBuffer.length > MAX_LOG_LINES) {
                        state.logBuffer.shift();
                    }
                }
            }
            logFile.write(data);
        };

        proc.stdout?.on("data", handleOutput);
        proc.stderr?.on("data", handleOutput);

        proc.on("error", (err) => {
            state.proc = null;
            state.config = null;
            reject(err);
        });

        proc.on("exit", (code) => {
            state.proc = null;
            state.config = null;
            state.startedAt = null;
        });

        // Wait for anvil to be ready by polling
        let attempts = 0;
        const maxAttempts = 40;
        const interval = setInterval(async () => {
            attempts++;
            try {
                const res = await fetch(`http://127.0.0.1:${config.port}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
                });
                if (res.ok) {
                    clearInterval(interval);
                    resolve(config);
                }
            } catch {
                // not ready yet
            }
            if (attempts >= maxAttempts) {
                clearInterval(interval);
                reject(new Error("Anvil failed to start within timeout"));
            }
        }, 250);
    });
}

export function stopAnvil(port?: number): Promise<void> {
    return new Promise((resolve) => {
        const usePort = port ?? state.config?.port ?? 8545;

        if (state.proc && !state.proc.killed) {
            state.proc.kill("SIGTERM");
            setTimeout(() => {
                if (state.proc && !state.proc.killed) {
                    state.proc.kill("SIGKILL");
                }
                cleanupPort(usePort);
                resolve();
            }, 3000);
        } else {
            cleanupPort(usePort);
            resolve();
        }

        state.proc = null;
        state.config = null;
        state.startedAt = null;
    });
}

function cleanupPort(port: number) {
    try {
        execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`);
    } catch { /* ignore */ }
}

export function getAnvilLogs(): string[] {
    return state.logBuffer;
}

export function isAnvilRunning(): boolean {
    return !!state.proc && !state.proc.killed;
}
