import { formatEther, formatUnits } from "viem";

/** 0x1234…abcd — the standard explorer address/hash abbreviation. */
export function truncateHex(value: string | null | undefined, head = 6, tail = 4): string {
    if (!value) return "—";
    if (value.length <= head + tail + 1) return value;
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** Relative age of a unix-seconds timestamp. */
export function timeAgo(seconds: number | null | undefined): string {
    if (!seconds) return "—";
    const diff = Math.floor(Date.now() / 1000) - seconds;
    if (diff < 0) return "just now";
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

export function formatTimestamp(seconds: number | null | undefined): string {
    if (!seconds) return "—";
    return new Date(seconds * 1000).toLocaleString();
}

/** Wei (hex or decimal string) → trimmed ETH amount. */
export function formatEth(value: string | bigint | null | undefined, maxDecimals = 6): string {
    if (value === null || value === undefined || value === "") return "0";
    try {
        const wei = typeof value === "bigint" ? value : BigInt(value);
        const eth = formatEther(wei);
        return trimFraction(eth, maxDecimals, wei !== 0n);
    } catch {
        return String(value);
    }
}

/** Token amount with the token's own decimals, thousands-separated. */
export function formatTokenAmount(value: string | bigint | null | undefined, decimals = 18, maxDecimals = 6): string {
    if (value === null || value === undefined || value === "") return "0";
    try {
        const raw = typeof value === "bigint" ? value : BigInt(value);
        const text = formatUnits(raw, decimals);
        return trimFraction(text, maxDecimals, raw !== 0n, true);
    } catch {
        return String(value);
    }
}

/**
 * Cut a decimal string to `maxDecimals`, dropping trailing zeros. A non-zero
 * amount that rounds away entirely is shown as "<0.000…1" rather than a bare "0",
 * so dust never reads as nothing.
 */
function trimFraction(text: string, maxDecimals: number, nonZero: boolean, group = false): string {
    const [whole, frac = ""] = text.split(".");
    const head = group ? Number(whole).toLocaleString() : whole;
    const trimmed = frac.slice(0, maxDecimals).replace(/0+$/, "");
    if (trimmed) return `${head}.${trimmed}`;
    if (nonZero && whole === "0") return `<0.${"0".repeat(Math.max(0, maxDecimals - 1))}1`;
    return head;
}

/** Hex or decimal → localised integer string ("21,000"). */
export function formatNumber(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") return "—";
    const n = typeof value === "number" ? value : value.startsWith("0x") ? parseInt(value, 16) : Number(value);
    return Number.isFinite(n) ? n.toLocaleString() : String(value);
}

/** Wei → Gwei, for gas prices. */
export function formatGwei(value: string | bigint | null | undefined, decimals = 2): string {
    if (value === null || value === undefined || value === "") return "—";
    try {
        const wei = typeof value === "bigint" ? value : BigInt(value);
        return `${(Number(wei) / 1e9).toFixed(decimals)} Gwei`;
    } catch {
        return "—";
    }
}

export function hexToInt(value: string | null | undefined, fallback = 0): number {
    if (!value) return fallback;
    const n = value.startsWith("0x") ? parseInt(value, 16) : Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** Percentage of the block gas limit that a block consumed. */
export function gasUsedPercent(gasUsed: string | null, gasLimit: string | null): number | null {
    const used = hexToInt(gasUsed, -1);
    const limit = hexToInt(gasLimit, -1);
    if (used < 0 || limit <= 0) return null;
    return Math.min(100, (used / limit) * 100);
}
