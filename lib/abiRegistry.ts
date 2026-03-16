import { getDB } from "./db";
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

export function saveContract(address: string, name: string, abi: Abi, source?: string) {
    const db = getDB();
    db.prepare(`
    INSERT OR REPLACE INTO contracts (address, name, abi, source, verified_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(address.toLowerCase(), name, JSON.stringify(abi), source ?? null, Date.now());
}

export function getContract(address: string): ContractInfo | null {
    const db = getDB();
    const row = db.prepare("SELECT * FROM contracts WHERE lower(address) = ?").get(address.toLowerCase()) as any;
    if (!row) return null;
    return { ...row, abi: JSON.parse(row.abi) };
}

export function getAllContracts(): ContractInfo[] {
    const db = getDB();
    const rows = db.prepare("SELECT * FROM contracts ORDER BY verified_at DESC").all() as any[];
    return rows.map((r) => ({ ...r, abi: JSON.parse(r.abi) }));
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

export async function autoFetchABI(address: string, chainId: number): Promise<Abi | null> {
    // 1. Check local SQLite first
    const local = getABI(address);
    if (local) return local;

    // 2. Try Sourcify
    try {
        const res = await fetch(
            `https://repo.sourcify.dev/contracts/full_match/${chainId}/${address}/metadata.json`
        );
        if (res.ok) {
            const meta = await res.json();
            if (meta?.output?.abi) {
                const name = Object.keys(meta.settings?.compilationTarget ?? {})[0] ?? address;
                saveContract(address, name, meta.output.abi);
                return meta.output.abi;
            }
        }
    } catch { /* ignore */ }

    // 3. Try block explorer (Etherscan / BSCScan etc.)
    try {
        const abi = await fetchFromExplorer(address, chainId);
        if (abi) return abi;
    } catch { /* ignore */ }

    return null;
}

/** Explorer API base URLs by chain ID */
const EXPLORER_APIS: Record<number, string> = {
    1: "https://api.etherscan.io/api",
    56: "https://api.bscscan.com/api",
    137: "https://api.polygonscan.com/api",
    42161: "https://api.arbiscan.io/api",
    10: "https://api-optimistic.etherscan.io/api",
    8453: "https://api.basescan.org/api",
    43114: "https://api.snowtrace.io/api",
    250: "https://api.ftmscan.com/api",
};

async function fetchFromExplorer(address: string, chainId: number): Promise<Abi | null> {
    const baseUrl = EXPLORER_APIS[chainId];
    if (!baseUrl) return null;

    const url = `${baseUrl}?module=contract&action=getabi&address=${address}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.status !== "1" || !data.result) return null;

    try {
        const abi = JSON.parse(data.result) as Abi;
        // Extract contract name from ABI (first function or event name)
        const firstName = (abi as unknown as Array<{ name?: string }>).find((x) => x.name)?.name ?? "Unknown";
        saveContract(address, firstName, abi);
        return abi;
    } catch {
        return null;
    }
}

/** Batch-fetch ABIs for multiple addresses, returns a map of address → ABI */
export async function batchFetchABIs(
    addresses: string[],
    chainId: number
): Promise<Record<string, Abi>> {
    const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
    const result: Record<string, Abi> = {};

    await Promise.all(
        unique.map(async (addr) => {
            try {
                const abi = await autoFetchABI(addr, chainId);
                if (abi) result[addr] = abi;
            } catch { /* skip */ }
        })
    );

    return result;
}

