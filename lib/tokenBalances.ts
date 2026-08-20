import { keccak256, hexToString, type Hex } from "viem";
import { rpc, rpcBatch } from "./rpc.ts";
import { MOCK_ERC20_BALANCE_SLOT } from "./mockErc20.ts";
import { deployAt, erc20CreationBytecode } from "./codePatcher.ts";

export interface TokenWatch {
    id: number;
    token_address: string;
    wallet_address: string;
    token_name?: string | null;
    token_symbol?: string | null;
    token_decimals: number;
    token_type: "ERC20" | "ERC721";
}

export interface TokenBalance {
    token_address: string;
    wallet_address: string;
    balance: string;
    token_type: "ERC20" | "ERC721";
}

export interface TokenMetadata {
    name: string | null;
    symbol: string | null;
    decimals: number | null;
}

const SELECTOR = {
    balanceOf: "0x70a08231",
    name: "0x06fdde03",
    symbol: "0x95d89b41",
    decimals: "0x313ce567",
} as const;

const ZERO_WORD = `0x${"0".repeat(64)}`;

function pad32(address: string): string {
    return address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function toWord(value: bigint | number): string {
    return `0x${value.toString(16).padStart(64, "0")}`;
}

function balanceCall(token: string, wallet: string) {
    return { method: "eth_call", params: [{ to: token, data: `${SELECTOR.balanceOf}${pad32(wallet)}` }, "latest"] };
}

function parseUint(result: string | null | undefined): string {
    if (!result || result === "0x") return "0";
    try {
        return BigInt(result).toString();
    } catch {
        return "0";
    }
}

/** ERC20/ERC721 `balanceOf` for one holder. Returns "0" when the call reverts. */
export async function fetchTokenBalance(tokenAddress: string, walletAddress: string, port?: number): Promise<string> {
    try {
        const result = await rpc<string>("eth_call", [
            { to: tokenAddress, data: `${SELECTOR.balanceOf}${pad32(walletAddress)}` },
            "latest",
        ], port);
        return parseUint(result);
    } catch {
        return "0";
    }
}

/** Balances for a whole watchlist in a single batched RPC round trip. */
export async function fetchTokenBalances(watchlist: TokenWatch[], port?: number): Promise<string[]> {
    if (watchlist.length === 0) return [];
    try {
        const results = await rpcBatch<string>(
            watchlist.map((w) => balanceCall(w.token_address, w.wallet_address)),
            port
        );
        return results.map(parseUint);
    } catch {
        return watchlist.map(() => "0");
    }
}

export async function fetchAllWatchedBalances(watchlist: TokenWatch[], port?: number): Promise<TokenBalance[]> {
    const balances = await fetchTokenBalances(watchlist, port);
    return watchlist.map((w, i) => ({
        token_address: w.token_address,
        wallet_address: w.wallet_address,
        balance: balances[i],
        token_type: w.token_type,
    }));
}

/** Decode a string returned either ABI-encoded (dynamic) or as a bytes32 (older tokens). */
function decodeStringResult(result: string | null): string | null {
    if (!result || result === "0x") return null;
    try {
        const body = result.slice(2);
        if (body.length === 64) {
            // bytes32 — trim trailing zero padding
            const trimmed = body.replace(/(00)+$/, "");
            const text = hexToString(`0x${trimmed}` as Hex);
            return text.replace(/\0/g, "").trim() || null;
        }
        // offset (32) + length (32) + data
        const length = parseInt(body.slice(64, 128), 16);
        if (!Number.isFinite(length) || length === 0) return null;
        const data = body.slice(128, 128 + length * 2);
        return hexToString(`0x${data}` as Hex).replace(/\0/g, "").trim() || null;
    } catch {
        return null;
    }
}

/** name / symbol / decimals in one batched call. Any field the token doesn't implement comes back null. */
export async function fetchTokenMetadata(tokenAddress: string, port?: number): Promise<TokenMetadata> {
    try {
        const [name, symbol, decimals] = await rpcBatch<string>([
            { method: "eth_call", params: [{ to: tokenAddress, data: SELECTOR.name }, "latest"] },
            { method: "eth_call", params: [{ to: tokenAddress, data: SELECTOR.symbol }, "latest"] },
            { method: "eth_call", params: [{ to: tokenAddress, data: SELECTOR.decimals }, "latest"] },
        ], port);
        const dec = decimals && decimals !== "0x" ? Number(BigInt(decimals)) : null;
        return {
            name: decodeStringResult(name),
            symbol: decodeStringResult(symbol),
            decimals: dec !== null && dec >= 0 && dec <= 36 ? dec : null,
        };
    } catch {
        return { name: null, symbol: null, decimals: null };
    }
}

/** Storage key of `balances[holder]` for a Solidity (`keccak(key ++ slot)`) mapping. */
export function solidityMappingKey(holder: string, slot: number): Hex {
    return keccak256(`0x${pad32(holder)}${slot.toString(16).padStart(64, "0")}` as Hex);
}

/** Storage key for the Vyper layout (`keccak(slot ++ key)`). */
export function vyperMappingKey(holder: string, slot: number): Hex {
    return keccak256(`0x${slot.toString(16).padStart(64, "0")}${pad32(holder)}` as Hex);
}

const MAX_SLOT = 20;
const PROBE_AMOUNT = 10n ** 18n;

/**
 * Brute-force the balances mapping slot by writing a probe value and reading
 * `balanceOf` back. Everything happens inside an EVM snapshot that is always
 * reverted, so chain state is untouched.
 */
export async function detectBalanceSlot(tokenAddress: string, walletAddress: string, port?: number): Promise<number> {
    const snapshotId = await rpc<string>("evm_snapshot", [], port);
    try {
        for (let slot = 0; slot <= MAX_SLOT; slot++) {
            for (const key of [solidityMappingKey(walletAddress, slot), vyperMappingKey(walletAddress, slot)]) {
                await rpc("anvil_setStorageAt", [tokenAddress, key, toWord(PROBE_AMOUNT)], port);
                const balance = await fetchTokenBalance(tokenAddress, walletAddress, port);
                if (BigInt(balance) === PROBE_AMOUNT) return slot;
                await rpc("anvil_setStorageAt", [tokenAddress, key, ZERO_WORD], port);
            }
        }
    } finally {
        // Always roll back the probe writes, found or not.
        await rpc("evm_revert", [snapshotId], port).catch(() => { });
    }
    throw new Error(`Could not auto-detect balance slot (tried slots 0-${MAX_SLOT}, Solidity & Vyper layouts)`);
}

async function hasCode(address: string, port?: number): Promise<boolean> {
    const code = await rpc<string>("eth_getCode", [address, "latest"], port).catch(() => "0x");
    return code !== "0x" && code !== "0x0";
}

/**
 * Guarantee a usable ERC20 at `tokenAddress`, installing the built-in token when
 * the address has no working one. The supply is minted to `holder` by the
 * constructor, so the injected token reports a coherent totalSupply rather than
 * balances that add up to more than exists.
 *
 * Returns true when we installed — the caller then knows the balance slot is 0
 * and that the balance is already set.
 */
async function ensureContractExists(
    tokenAddress: string,
    holder: string,
    amount: bigint,
    decimals: number,
    port?: number
): Promise<boolean> {
    if (await hasCode(tokenAddress, port)) {
        const probe = await rpc<string>("eth_call", [
            { to: tokenAddress, data: `${SELECTOR.balanceOf}${pad32("0x1")}` },
            "latest",
        ], port).catch(() => null);
        if (probe !== null) return false; // existing token works — leave it alone
    }

    await deployAt(
        tokenAddress,
        erc20CreationBytecode({ name: "Mock Token", symbol: "MOCK", decimals, totalSupply: amount, holder }),
        port
    );
    return true;
}

/**
 * Force a holder's token balance by writing the mapping slot directly.
 * Slot resolution order: explicit `mappingSlot` → known slot of the injected mock →
 * auto-detection → slot 0.
 */
export async function setTokenBalance(
    tokenAddress: string,
    walletAddress: string,
    amount: bigint,
    port?: number,
    mappingSlot?: number,
    decimals = 18
): Promise<void> {
    const injected = await ensureContractExists(tokenAddress, walletAddress, amount, decimals, port);
    // The constructor already credited the holder and set totalSupply to match.
    if (injected) return;

    let slot = mappingSlot ?? MOCK_ERC20_BALANCE_SLOT;
    if (mappingSlot === undefined) {
        try {
            slot = await detectBalanceSlot(tokenAddress, walletAddress, port);
        } catch {
            slot = 0; // non-standard layout — best effort
        }
    }

    await rpc("anvil_setStorageAt", [tokenAddress, solidityMappingKey(walletAddress, slot), toWord(amount)], port);
}
