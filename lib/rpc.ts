import { createPublicClient, defineChain, http, type PublicClient } from "viem";
import { resolveActiveProject } from "./activeProject.ts";

/** Default timeout for a single JSON-RPC round trip against the local node. */
const RPC_TIMEOUT_MS = 15_000;

export function getRpcUrl(port?: number): string {
    return `http://127.0.0.1:${port ?? resolveActiveProject().port}`;
}

const clients = new Map<string, PublicClient>();

/**
 * Cached viem client for a local Anvil instance.
 * Cached per port+chainId so a chain switch never reuses a stale chain definition.
 */
export function publicClient(port?: number, chainId?: number): PublicClient {
    const active = resolveActiveProject();
    const usePort = port ?? active.port;
    const useChainId = chainId ?? active.chainId;
    const key = `${usePort}:${useChainId}`;

    const cached = clients.get(key);
    if (cached) return cached;

    const client = createPublicClient({
        chain: buildChain(usePort, useChainId),
        transport: http(`http://127.0.0.1:${usePort}`),
    }) as PublicClient;
    clients.set(key, client);
    return client;
}

/** Drop cached viem clients — call after a node restart or chain-id change. */
export function resetRpcClients() {
    clients.clear();
}

function buildChain(port: number, chainId: number) {
    return defineChain({
        id: chainId,
        name: `Anvil (${chainId})`,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [`http://127.0.0.1:${port}`] } },
    });
}

export interface RpcErrorShape {
    code?: number;
    message?: string;
}

export class RpcError extends Error {
    readonly method: string;
    readonly code?: number;

    constructor(message: string, method: string, code?: number) {
        super(message);
        this.name = "RpcError";
        this.method = method;
        this.code = code;
    }
}

/** Raw JSON-RPC call against the active (or explicitly given) local node. */
export async function rpc<T = unknown>(method: string, params: unknown[] = [], port?: number): Promise<T> {
    const usePort = port ?? resolveActiveProject().port;
    let res: Response;
    try {
        res = await fetch(`http://127.0.0.1:${usePort}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
            signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
        });
    } catch (err) {
        throw new RpcError(
            `Cannot reach Anvil on port ${usePort} — is the node running? (${err instanceof Error ? err.message : err})`,
            method
        );
    }
    if (!res.ok) throw new RpcError(`RPC ${method} failed: HTTP ${res.status}`, method);

    const data = await res.json();
    if (data.error) {
        const e = data.error as RpcErrorShape;
        throw new RpcError(e.message ?? `RPC ${method} failed`, method, e.code);
    }
    return data.result as T;
}

/** Batched JSON-RPC — one HTTP round trip for many calls. Results keep request order. */
export async function rpcBatch<T = unknown>(
    calls: { method: string; params?: unknown[] }[],
    port?: number
): Promise<(T | null)[]> {
    if (calls.length === 0) return [];
    const usePort = port ?? resolveActiveProject().port;
    const payload = calls.map((c, i) => ({ jsonrpc: "2.0", method: c.method, params: c.params ?? [], id: i }));

    const res = await fetch(`http://127.0.0.1:${usePort}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    if (!res.ok) throw new RpcError(`Batch RPC failed: HTTP ${res.status}`, "batch");

    const data = await res.json();
    const rows: { id: number; result?: unknown }[] = Array.isArray(data) ? data : [data];
    const out: (T | null)[] = new Array(calls.length).fill(null);
    for (const row of rows) {
        if (typeof row?.id === "number" && row.id < out.length) {
            out[row.id] = (row.result ?? null) as T | null;
        }
    }
    return out;
}
