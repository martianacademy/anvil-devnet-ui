import { getDB } from "./db.ts";
import { decodeFunctionData, decodeEventLog, type Abi } from "viem";

export interface ContractInfo {
    address: string;
    name: string;
    abi: Abi;
    source?: string;
    verified_at: number;
}

export interface DecodedCall {
    functionName: string;
    args: Record<string, unknown>;
}

export interface DecodedResult {
    result: unknown;
}

export interface DecodedEvent {
    eventName: string;
    args: Record<string, unknown>;
}

const abiCache = new Map<string, ContractInfo>();
/** Addresses we already tried (and failed) to resolve remotely, with an expiry. */
const missCache = new Map<string, number>();
const MISS_TTL_MS = 5 * 60 * 1000;

export function saveContract(address: string, name: string, abi: Abi, source?: string) {
    const db = getDB();
    const normalized = address.toLowerCase();
    db.prepare(`
    INSERT OR REPLACE INTO contracts (address, name, abi, source, verified_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(normalized, name, JSON.stringify(abi), source ?? null, Date.now());
    abiCache.set(normalized, { address: normalized, name, abi, source, verified_at: Date.now() });
    missCache.delete(normalized);
}

/** Remove a contract from SQLite and both caches. */
export function deleteContract(address: string): boolean {
    const normalized = address.toLowerCase();
    const res = getDB().prepare("DELETE FROM contracts WHERE lower(address) = ?").run(normalized);
    abiCache.delete(normalized);
    missCache.delete(normalized);
    return res.changes > 0;
}

/** Drop every in-memory ABI cache entry (used after a chain switch). */
export function clearAbiCache() {
    abiCache.clear();
    missCache.clear();
}

export function getContract(address: string): ContractInfo | null {
    const normalized = address.toLowerCase();
    if (abiCache.has(normalized)) {
        return abiCache.get(normalized) ?? null;
    }
    const db = getDB();
    const row = db.prepare("SELECT * FROM contracts WHERE lower(address) = ?").get(normalized) as { address: string; name: string; abi: string; source?: string; verified_at: number } | undefined;
    if (!row) return null;
    const contract: ContractInfo = { ...row, abi: JSON.parse(row.abi) };
    abiCache.set(normalized, contract);
    return contract;
}

export function getAllContracts(): ContractInfo[] {
    const db = getDB();
    const rows = db.prepare("SELECT * FROM contracts ORDER BY verified_at DESC").all() as { address: string; name: string; abi: string; source?: string; verified_at: number }[];
    return rows.map((r) => {
        const contract: ContractInfo = { ...r, abi: JSON.parse(r.abi) };
        abiCache.set(r.address, contract);
        return contract;
    });
}

export function getABI(address: string): Abi | null {
    const contract = getContract(address);
    return contract?.abi ?? null;
}

export function getName(address: string): string | null {
    const contract = getContract(address);
    return contract?.name ?? null;
}

export function decodeInput(address: string, data: string): DecodedCall | null {
    try {
        const abi = getABI(address);
        if (!abi || !data || data === "0x") return null;
        const decoded = decodeFunctionData({ abi, data: data as `0x${string}` });
        return {
            functionName: decoded.functionName,
            args: decoded.args as unknown as Record<string, unknown>,
        };
    } catch {
        return null;
    }
}

export function decodeEvent(address: string, log: {
    topics: `0x${string}`[];
    data: `0x${string}`;
}): DecodedEvent | null {
    try {
        const abi = getABI(address);
        if (!abi) return null;
        const decoded = decodeEventLog({
            abi,
            data: log.data,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        return {
            eventName: decoded.eventName ?? "unknown",
            args: decoded.args as unknown as Record<string, unknown>,
        };
    } catch {
        return null;
    }
}

/**
 * Resolve an ABI: local SQLite → Sourcify → block explorer.
 * Failures are negatively cached for a few minutes so a page full of unknown
 * addresses doesn't re-hit the network on every render.
 */
export async function autoFetchABI(address: string, chainId: number): Promise<Abi | null> {
    const normalized = address.toLowerCase();

    const local = getABI(normalized);
    if (local) return local;

    const missedAt = missCache.get(normalized);
    if (missedAt && Date.now() - missedAt < MISS_TTL_MS) return null;

    const abi = (await fetchFromSourcify(normalized, chainId)) ?? (await fetchFromExplorer(normalized, chainId));
    if (!abi) missCache.set(normalized, Date.now());
    return abi;
}

/** Sourcify hosts verified metadata for most public chains — no API key needed. */
async function fetchFromSourcify(address: string, chainId: number): Promise<Abi | null> {
    for (const match of ["full_match", "partial_match"]) {
        try {
            const res = await fetch(
                `https://repo.sourcify.dev/contracts/${match}/${chainId}/${address}/metadata.json`,
                { signal: AbortSignal.timeout(6000) }
            );
            if (!res.ok) continue;
            const meta = await res.json();
            if (!meta?.output?.abi) continue;
            const name = Object.keys(meta.settings?.compilationTarget ?? {})
                .map((k) => meta.settings.compilationTarget[k])
                .find(Boolean) ?? shortAddress(address);
            saveContract(address, String(name), meta.output.abi);
            return meta.output.abi as Abi;
        } catch { /* try the next match type */ }
    }
    return null;
}

function shortAddress(address: string): string {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Etherscan V2 is one multichain endpoint keyed by `chainid`, and it requires an
 * API key. Set ETHERSCAN_API_KEY to enable this fallback; without it we stop at Sourcify.
 */
const ETHERSCAN_V2 = "https://api.etherscan.io/v2/api";

async function fetchFromExplorer(address: string, chainId: number): Promise<Abi | null> {
    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) return null;

    try {
        const url = `${ETHERSCAN_V2}?chainid=${chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) return null;

        const data = await res.json();
        if (data.status !== "1" || !Array.isArray(data.result) || data.result.length === 0) return null;

        const entry = data.result[0] as { ABI?: string; ContractName?: string; SourceCode?: string };
        if (!entry.ABI || entry.ABI.startsWith("Contract source code not verified")) return null;

        const abi = JSON.parse(entry.ABI) as Abi;
        saveContract(address, entry.ContractName || shortAddress(address), abi, entry.SourceCode || undefined);
        return abi;
    } catch {
        return null;
    }
}

/** Batch-fetch ABIs for multiple addresses with concurrency limit, returns a map of address → ABI */
export async function batchFetchABIs(
    addresses: string[],
    chainId: number,
    concurrency = 5
): Promise<Record<string, Abi>> {
    const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
    const result: Record<string, Abi> = {};

    async function worker(addr: string) {
        try {
            const abi = await autoFetchABI(addr, chainId);
            if (abi) result[addr] = abi;
        } catch { /* skip */ }
    }

    for (let i = 0; i < unique.length; i += concurrency) {
        await Promise.all(unique.slice(i, i + concurrency).map(worker));
    }

    return result;
}

