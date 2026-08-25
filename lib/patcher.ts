import { parseEther, parseUnits, toHex } from "viem";
import { rpc } from "./rpc.ts";
import { setTokenBalance } from "./tokenBalances.ts";

/**
 * Put an address into the next block so the explorer notices it.
 *
 * Blockscout reads native balances out of the blocks it indexes: for each block
 * it fetches the balances of the addresses that appear in it. A state write like
 * `anvil_setBalance` touches no block, so the balance is right on chain and the
 * explorer keeps showing nothing at all.
 *
 * A zero-value transaction *to* the address is the cheapest way to make it
 * appear. Sending it to — rather than from — the address leaves that account's
 * nonce alone; the dev account pays the gas. Best effort: a chain with no
 * unlocked accounts simply does not get the refresh.
 */
async function touchForIndexer(address: string, port?: number): Promise<void> {
    try {
        const accounts = await rpc<string[]>("eth_accounts", [], port);
        const sender = accounts?.find((account) => account.toLowerCase() !== address.toLowerCase());
        if (!sender) return;

        await rpc("eth_sendTransaction", [ { from: sender, to: address, value: "0x0" } ], port);
        // A node that mines on demand would otherwise leave it pending forever.
        await rpc("anvil_mine", [ "0x1" ], port).catch(() => { });
    } catch {
        /* the balance is already set; failing to advertise it must not fail the call */
    }
}

/** Set an account's native balance via `anvil_setBalance`. */
export async function fundNative(address: string, amount: string, port?: number, announce = true): Promise<void> {
    await rpc("anvil_setBalance", [address, toHex(parseEther(amount))], port);
    if (announce) await touchForIndexer(address, port);
}

/** Set an ERC20 balance by writing the balances mapping slot. */
export async function fundERC20(
    tokenAddress: string,
    walletAddress: string,
    amount: string,
    decimals = 18,
    port?: number,
    mappingSlot?: number
): Promise<void> {
    await setTokenBalance(tokenAddress, walletAddress, parseUnits(amount, decimals), port, mappingSlot, decimals);
}

export async function writeStorageSlot(
    contractAddress: string,
    slot: string,
    value: string,
    port?: number
): Promise<void> {
    // rpc() throws on a JSON-RPC error, so a failed write surfaces instead of silently passing.
    await rpc("anvil_setStorageAt", [contractAddress, slot, value], port);
}

export async function readStorageSlot(contractAddress: string, slot: string, port?: number): Promise<string> {
    const value = await rpc<string>("eth_getStorageAt", [contractAddress, slot, "latest"], port);
    return value ?? `0x${"0".repeat(64)}`;
}

/** Overwrite the code at an address (`anvil_setCode`). */
export async function setCode(address: string, bytecode: string, port?: number): Promise<void> {
    await rpc("anvil_setCode", [address, bytecode], port);
}

/** Set an account's nonce (`anvil_setNonce`). */
export async function setNonce(address: string, nonce: number, port?: number): Promise<void> {
    await rpc("anvil_setNonce", [address, toHex(nonce)], port);
}
