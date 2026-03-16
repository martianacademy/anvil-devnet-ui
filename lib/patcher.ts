import { keccak256, parseEther, toHex, type Hex } from "viem";
import { setTokenBalance, detectBalanceSlot } from "./tokenBalances";

export async function fundNative(
    address: string,
    amount: string,
    port = 8545
): Promise<void> {
    const amountHex = toHex(parseEther(amount));
    const res = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "anvil_setBalance",
            params: [address, amountHex],
            id: 1,
        }),
    });
    if (!res.ok) throw new Error(`RPC request failed: HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(`anvil_setBalance failed: ${data.error.message ?? JSON.stringify(data.error)}`);
}

export async function fundERC20(
    tokenAddress: string,
    walletAddress: string,
    amount: string,
    decimals = 18,
    port = 8545,
    mappingSlot?: number
): Promise<void> {
    const amountBig = BigInt(Math.floor(parseFloat(amount) * 10 ** decimals));
    await setTokenBalance(tokenAddress, walletAddress, amountBig, port, mappingSlot);
}

export async function writeStorageSlot(
    contractAddress: string,
    slot: string,
    value: string,
    port = 8545
): Promise<void> {
    await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "anvil_setStorageAt",
            params: [contractAddress, slot, value],
            id: 1,
        }),
    }).then((r) => r.json());
}

export async function readStorageSlot(
    contractAddress: string,
    slot: string,
    port = 8545
): Promise<string> {
    const result = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getStorageAt",
            params: [contractAddress, slot, "latest"],
            id: 1,
        }),
    }).then((r) => r.json());

    return result.result ?? "0x0";
}
