/**
 * Reads an Anvil node's real settings off the wire.
 *
 * Without this, an Anvil started outside this app (or restarted by hand with
 * different flags) showed whatever the UI last remembered — numbers that look
 * authoritative and are wrong. Everything here is observed, never assumed.
 */

export type RpcCall = { method: string; params: unknown[] };

const DEFAULT_TIMEOUT_MS = 800;
/** Six calls, and the first one after a cold start can be slow. */
export const OBSERVE_TIMEOUT_MS = 2500;
/** Blocks sampled to work out whether the node mines on a fixed interval. */
const BLOCK_TIME_SAMPLES = 4;
/** Ether is scaled by this before rounding, so gas already spent does not eat a whole unit. */
const WEI_PER_MILLI_ETHER = 10n ** 15n;
const MILLI = 1000;

/** One batched round trip. Returns results positionally, `null` for any that failed. */
export async function rpcBatch(
    port: number,
    calls: RpcCall[],
    timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown[] | null> {
    try {
        const res = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(calls.map((c, id) => ({ jsonrpc: "2.0", id, ...c }))),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const rows = (await res.json()) as { id: number; result?: unknown }[];
        if (!Array.isArray(rows)) return null;
        const byId = new Map(rows.map((r) => [r.id, r.result]));
        return calls.map((_, id) => byId.get(id) ?? null);
    } catch {
        return null;
    }
}

/**
 * Anvil exposes no "what were you started with" call, so a fixed block time is
 * only knowable from the gaps between recent blocks. Identical gaps mean
 * `--block-time`; anything else is on-demand mining and stays unknown.
 *
 * @param timestamps newest first
 */
export function inferBlockTime(timestamps: number[]): number | null {
    if (timestamps.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
        gaps.push(timestamps[i - 1] - timestamps[i]);
    }
    return gaps.every((gap) => gap === gaps[0] && gap > 0) ? gaps[0] : null;
}

/**
 * Last interval measured per node. A sample that comes back short — a partial
 * batch, a slow first call — means "not measured", which is not the same as
 * "this node has no interval", and blanking the field on it made the reading
 * flicker. An irregular sample still clears it.
 */
const lastBlockTime = new Map<string, number>();

function nodeKey(port: number, chainId: number): string {
    return `${port}:${chainId}`;
}

/** Whole ether, rounded — the field means "what each account started with". */
export function roundToEther(weiHex: string): number {
    return Math.round(Number(BigInt(weiHex) / WEI_PER_MILLI_ETHER) / MILLI);
}

export interface ObservedConfig {
    chainId: number;
    port: number;
    blockTime: number | null;
    accounts: number;
    balance: number | null;
    baseFee: number | null;
    forkUrl?: string;
    forkBlockNumber?: number;
}

interface NodeInfo {
    environment?: { baseFee?: string; chainId?: number };
    forkConfig?: { forkUrl?: string | null; forkBlockNumber?: number | null };
}

interface BlockHeader {
    timestamp?: string;
}

export async function observeConfig(
    port: number,
    blockNumber: number,
    fallbackChainId: number
): Promise<ObservedConfig | null> {
    const blockCalls: RpcCall[] = [];
    for (let i = 0; i < BLOCK_TIME_SAMPLES && blockNumber - i >= 0; i++) {
        blockCalls.push({
            method: "eth_getBlockByNumber",
            params: [`0x${(blockNumber - i).toString(16)}`, false],
        });
    }

    const out = await rpcBatch(
        port,
        [
            { method: "anvil_nodeInfo", params: [] },
            { method: "eth_accounts", params: [] },
            ...blockCalls,
        ],
        OBSERVE_TIMEOUT_MS
    );
    if (!out) return null;

    const info = (out[0] ?? null) as NodeInfo | null;
    const accounts = Array.isArray(out[1]) ? (out[1] as string[]) : [];
    const timestamps = out
        .slice(2)
        .map((block) => (block as BlockHeader | null)?.timestamp)
        .filter((ts): ts is string => typeof ts === "string")
        .map((ts) => parseInt(ts, 16));

    let balance: number | null = null;
    if (accounts.length > 0) {
        const balanceOut = await rpcBatch(
            port,
            [{ method: "eth_getBalance", params: [accounts[0], "latest"] }],
            OBSERVE_TIMEOUT_MS
        );
        const hex = balanceOut?.[0] as string | null | undefined;
        if (hex) balance = roundToEther(hex);
    }

    const chainId = info?.environment?.chainId ?? fallbackChainId;
    const key = nodeKey(port, chainId);
    let blockTime: number | null;
    if (timestamps.length < 2 && blockCalls.length >= 2) {
        blockTime = lastBlockTime.get(key) ?? null;
    } else {
        blockTime = inferBlockTime(timestamps);
        if (blockTime === null) {
            lastBlockTime.delete(key);
        } else {
            lastBlockTime.set(key, blockTime);
        }
    }

    const fork = info?.forkConfig;
    return {
        chainId,
        port,
        blockTime,
        accounts: accounts.length,
        balance,
        baseFee: info?.environment?.baseFee ? parseInt(info.environment.baseFee, 16) : null,
        ...(fork?.forkUrl ? { forkUrl: fork.forkUrl } : {}),
        ...(fork?.forkBlockNumber ? { forkBlockNumber: fork.forkBlockNumber } : {}),
    };
}
