import { rpc } from "./rpc";
import { keccak256, pad, toHex, type Hex } from "viem";

export interface TokenWatch {
    id: number;
    token_address: string;
    wallet_address: string;
    token_name?: string;
    token_symbol?: string;
    token_decimals: number;
    token_type: "ERC20" | "ERC721";
}

export interface TokenBalance {
    token_address: string;
    wallet_address: string;
    balance: string;
    token_type: "ERC20" | "ERC721";
}

const ERC20_BALANCE_ABI = [{
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
}] as const;

export async function fetchTokenBalance(
    tokenAddress: string,
    walletAddress: string,
    port = 8545
): Promise<string> {
    try {
        // ABI encode: balanceOf(address) = keccak256 selector + padded address
        const selector = "0x70a08231"; // balanceOf(address)
        const paddedAddr = walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");
        const data = selector + paddedAddr;

        const result = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_call",
                params: [{ to: tokenAddress, data }, "latest"],
                id: 1,
            }),
        }).then((r) => r.json());

        if (result.result && result.result !== "0x") {
            return BigInt(result.result).toString();
        }
        return "0";
    } catch {
        return "0";
    }
}

export async function fetchAllWatchedBalances(
    watchlist: TokenWatch[],
    port = 8545
): Promise<TokenBalance[]> {
    const results = await Promise.all(
        watchlist.map(async (w) => ({
            token_address: w.token_address,
            wallet_address: w.wallet_address,
            balance: await fetchTokenBalance(w.token_address, w.wallet_address, port),
            token_type: w.token_type,
        }))
    );
    return results;
}

export async function detectBalanceSlot(
    tokenAddress: string,
    walletAddress: string,
    port = 8545
): Promise<number> {
    // Try slots 0-9
    const testAmount = BigInt("1000000000000000000"); // 1 token

    for (let slot = 0; slot <= 9; slot++) {
        try {
            const storageKey = keccak256(
                `0x${walletAddress.toLowerCase().replace("0x", "").padStart(64, "0")}${slot.toString(16).padStart(64, "0")}` as Hex
            );

            // Temporarily write a test value
            await fetch(`http://127.0.0.1:${port}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "anvil_setStorageAt",
                    params: [tokenAddress, storageKey, `0x${testAmount.toString(16).padStart(64, "0")}`],
                    id: 1,
                }),
            });

            // Check balanceOf
            const bal = await fetchTokenBalance(tokenAddress, walletAddress, port);

            // Restore 0
            await fetch(`http://127.0.0.1:${port}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "anvil_setStorageAt",
                    params: [tokenAddress, storageKey, `0x${"0".padStart(64, "0")}`],
                    id: 1,
                }),
            });

            if (BigInt(bal) === testAmount) return slot;
        } catch { /* try next slot */ }
    }

    throw new Error("Could not auto-detect balance slot (tried slots 0-9)");
}

export async function setTokenBalance(
    tokenAddress: string,
    walletAddress: string,
    amount: bigint,
    port = 8545,
    mappingSlot?: number
): Promise<void> {
    const slot = mappingSlot ?? (await detectBalanceSlot(tokenAddress, walletAddress, port));

    const storageKey = keccak256(
        `0x${walletAddress.toLowerCase().replace("0x", "").padStart(64, "0")}${slot.toString(16).padStart(64, "0")}` as Hex
    );

    await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "anvil_setStorageAt",
            params: [tokenAddress, storageKey, `0x${amount.toString(16).padStart(64, "0")}`],
            id: 1,
        }),
    }).then((r) => r.json());
}
