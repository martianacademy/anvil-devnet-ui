import { createPublicClient, http } from "viem";
import { defineChain } from "viem";

let _port = 8545;

export function setRpcPort(port: number) {
    _port = port;
    _client = null;
}

let _client: ReturnType<typeof createPublicClient> | null = null;

export function publicClient() {
    if (_client) return _client;

    const anvilChain = defineChain({
        id: 31337,
        name: "Anvil Local",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: {
            default: { http: [`http://127.0.0.1:${_port}`] },
        },
    });

    _client = createPublicClient({
        chain: anvilChain,
        transport: http(`http://127.0.0.1:${_port}`),
    });

    return _client;
}

export async function rpc(method: string, params: unknown[] = []): Promise<unknown> {
    const res = await fetch(`http://127.0.0.1:${_port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.result;
}

export function getRpcUrl() {
    return `http://127.0.0.1:${_port}`;
}
