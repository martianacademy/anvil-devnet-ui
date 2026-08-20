import { parseEther, parseUnits, toHex } from "viem";
import { rpc } from "./rpc.ts";
import { setTokenBalance } from "./tokenBalances.ts";

/** Set an account's native balance via `anvil_setBalance`. */
export async function fundNative(address: string, amount: string, port?: number): Promise<void> {
    await rpc("anvil_setBalance", [address, toHex(parseEther(amount))], port);
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
