/**
 * End-to-end smoke test: a real Anvil, the real control API, real HTTP.
 *
 * The unit tests cover the pure layers, but every bug that has actually shipped
 * lived in the seams — port discovery, reading a node's config off the wire, the
 * trace pipeline, the code patcher. This exercises those against a live node.
 *
 * Blockscout is deliberately absent: the explorer-sync paths must degrade to
 * "unavailable" rather than throw when the compose stack is not there.
 *
 * Run with `bun run smoke` (builds first) or `bun scripts/smoke.ts` against an
 * existing build.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const RPC_PORT = Number(process.env.SMOKE_RPC_PORT ?? 8555);
const API_PORT = Number(process.env.SMOKE_API_PORT ?? 3011);
const CHAIN_ID = 1337;
const BLOCK_TIME = 1;
const API = `http://127.0.0.1:${API_PORT}/api`;
const RPC = `http://127.0.0.1:${RPC_PORT}`;

/** Anvil's first default account — deterministic across every run. */
const ACCOUNT_0 = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ACCOUNT_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const KEY_0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
/** A mainnet address with no code locally — the point of the code patcher. */
const USDT_ON_BSC = "0x55d398326f99059fF775485246999027B3197955";

const workDir = mkdtempSync(join(tmpdir(), "devnet-smoke-"));
const children: ChildProcess[] = [];
let failures = 0;

function shutdown() {
    for (const child of children) {
        try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }
    rmSync(workDir, { recursive: true, force: true });
}

process.on("exit", shutdown);
for (const signal of [ "SIGINT", "SIGTERM" ] as const) {
    process.on(signal, () => { shutdown(); process.exit(1); });
}

async function step(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
    } catch (error) {
        failures++;
        console.error(`  ✗ ${name}`);
        console.error(`    ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function waitFor(label: string, check: () => Promise<boolean>, attempts = 60) {
    for (let i = 0; i < attempts; i++) {
        if (await check().catch(() => false)) return;
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error(`${label} did not come up after ${attempts}s`);
}

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status} ${JSON.stringify(body)}`);
    }
    return body as T;
}

async function rpc<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    const res = await fetch(RPC, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = await res.json() as { result?: T; error?: { message: string } };
    if (body.error) throw new Error(`${method}: ${body.error.message}`);
    return body.result as T;
}

console.log(`\nSmoke test — anvil :${RPC_PORT}, control api :${API_PORT}\n`);

// ── boot ─────────────────────────────────────────────────────────────────────
const anvil = spawn("anvil", [
    "--host", "0.0.0.0",
    "--port", String(RPC_PORT),
    "--chain-id", String(CHAIN_ID),
    "--block-time", String(BLOCK_TIME),
    "--steps-tracing",
    "--silent",
], { stdio: "ignore" });
children.push(anvil);

const server = spawn("node_modules/.bin/next", [ "start", "-p", String(API_PORT) ], {
    stdio: "ignore",
    env: {
        ...process.env,
        DEVNET_RPC_PORT: String(RPC_PORT),
        DEVNET_CHAIN_ID: String(CHAIN_ID),
        DEVNET_DB_PATH: join(workDir, "smoke.db"),
        // No Blockscout here — the watcher would spend the run failing to find it.
        DEVNET_EXPLORER_AUTOSYNC: "0",
    },
});
children.push(server);

await waitFor("anvil", async () => Boolean(await rpc("eth_blockNumber")));
await waitFor("control api", async () => {
    const res = await fetch(`${API}/anvil/status`);
    return res.ok;
});

// ── the node this app did not start ──────────────────────────────────────────
interface Status {
    running: boolean;
    port: number;
    chainId: number;
    blockNumber: number;
    configSource: string | null;
    config: { chainId?: number; port?: number; blockTime?: number | null; accounts?: number; balance?: number | null } | null;
    explorer?: { sync?: { status: string } };
}

await step("status finds a node this app did not start", async () => {
    const status = await api<Status>("/anvil/status");
    assert.equal(status.running, true, "node should be reported running");
    assert.equal(status.port, RPC_PORT, "should report the port the node is actually on");
    assert.equal(status.chainId, CHAIN_ID);
});

await step("node settings are read off the node, not remembered", async () => {
    const status = await api<Status>("/anvil/status");
    assert.equal(status.configSource, "node", "config should come from the live node");
    assert.equal(status.config?.chainId, CHAIN_ID);
    assert.equal(status.config?.port, RPC_PORT);
    assert.equal(status.config?.accounts, 10, "eth_accounts should report Anvil's ten dev accounts");
    assert.equal(status.config?.balance, 10000, "account 0 starts with 10000 ETH");
});

await step("block time is inferred from block timestamps", async () => {
    // Needs a few blocks on the clock before the gaps mean anything.
    await waitFor("blocks", async () => (await api<Status>("/anvil/status")).blockNumber >= 3, 30);
    const status = await api<Status>("/anvil/status");
    assert.equal(status.config?.blockTime, BLOCK_TIME, "even gaps should read back as --block-time");
});

await step("explorer sync degrades instead of throwing without Blockscout", async () => {
    const status = await api<Status>("/anvil/status");
    assert.ok(status.explorer, "status should still report an explorer block");
    assert.notEqual(status.explorer?.sync?.status, "syncing");
});

await step("process list sees the node and its bind address", async () => {
    const { processes } = await api<{ processes: Array<{ port: number; address: string; managed: boolean }> }>(
        "/anvil/processes",
    );
    const found = processes.find((p) => p.port === RPC_PORT);
    assert.ok(found, `expected an Anvil on port ${RPC_PORT}, got ${JSON.stringify(processes)}`);
    assert.equal(found.managed, false, "an externally started node is not managed");
});

// ── state patches ────────────────────────────────────────────────────────────
await step("native funding sets a balance outright", async () => {
    await api("/patches/fund", {
        method: "POST",
        body: JSON.stringify({ type: "native", address: ACCOUNT_1, amount: "12345" }),
    });
    const balance = await rpc<string>("eth_getBalance", [ ACCOUNT_1, "latest" ]);
    assert.equal(BigInt(balance), 12345n * 10n ** 18n);
});

await step("a funded address lands in a block, so an explorer can see it", async () => {
    // anvil_setBalance touches no block, and Blockscout reads balances out of the
    // blocks it indexes — without this the balance is right on chain and missing
    // in the explorer.
    const address = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
    const before = await rpc<string>("eth_blockNumber", []);
    await api("/patches/fund", {
        method: "POST",
        body: JSON.stringify({ type: "native", address, amount: "500" }),
    });

    const block = await rpc<{ transactions: Array<{ to: string | null }> }>(
        "eth_getBlockByNumber", [ "latest", true ],
    );
    const touched = block.transactions.some((tx) => tx.to?.toLowerCase() === address.toLowerCase());
    assert.ok(touched, "the funded address should appear as a recipient in the latest block");
    assert.ok(BigInt(await rpc<string>("eth_blockNumber", [])) >= BigInt(before), "chain should have advanced");
});

await step("storage slots round-trip", async () => {
    const value = `0x${"0".repeat(63)}7`;
    await api("/patches/storage", {
        method: "POST",
        body: JSON.stringify({ contract: USDT_ON_BSC, slot: "0x9", value }),
    });
    const read = await api<{ value: string }>(`/patches/storage?contract=${USDT_ON_BSC}&slot=0x9`);
    assert.equal(BigInt(read.value), 7n);
});

await step("an address with no code becomes a working ERC-20", async () => {
    const installed = await api<{ codeSize: number; slotsWritten: number }>("/patches/code", {
        method: "POST",
        body: JSON.stringify({
            address: USDT_ON_BSC,
            mode: "erc20",
            name: "Tether USD",
            symbol: "USDT",
            decimals: 18,
            totalSupply: "1000000",
            holder: ACCOUNT_0,
        }),
    });
    assert.ok(installed.codeSize > 0, "should have installed runtime bytecode");
    assert.ok(installed.slotsWritten >= 4, "the constructor writes name, symbol, decimals, supply and a balance");

    const info = await api<{ hasCode: boolean; token: { name: string; symbol: string; decimals: number } }>(
        `/patches/code?address=${USDT_ON_BSC}`,
    );
    assert.equal(info.hasCode, true);
    assert.equal(info.token.name, "Tether USD", "the constructor must have run — setCode alone leaves this empty");
    assert.equal(info.token.symbol, "USDT");
    assert.equal(info.token.decimals, 18);
});

// ── a real transaction, end to end ───────────────────────────────────────────
let txHash = "";

await step("the installed token can actually transfer", async () => {
    const { createWalletClient, createPublicClient, http, defineChain, parseUnits } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");

    const chain = defineChain({
        id: CHAIN_ID,
        name: "smoke",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: { default: { http: [ RPC ] } },
    });
    const wallet = createWalletClient({ account: privateKeyToAccount(KEY_0), chain, transport: http(RPC) });
    const publicClient = createPublicClient({ chain, transport: http(RPC) });

    txHash = await wallet.writeContract({
        address: USDT_ON_BSC as `0x${string}`,
        abi: [{
            type: "function",
            name: "transfer",
            stateMutability: "nonpayable",
            inputs: [ { name: "to", type: "address" }, { name: "value", type: "uint256" } ],
            outputs: [ { type: "bool" } ],
        }],
        functionName: "transfer",
        args: [ ACCOUNT_1 as `0x${string}`, parseUnits("250", 18) ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });
    assert.equal(receipt.status, "success", "transfer should not revert");
    assert.equal(receipt.logs.length, 1, "a Transfer event should have been emitted");
});

await step("the transaction is served with a decoded trace", async () => {
    const tx = await api<{ hash: string }>(`/tx/${txHash}`);
    assert.equal(tx.hash.toLowerCase(), txHash.toLowerCase());

    interface Trace {
        structLogs: Array<{ op: string }>;
        callTrace: { type?: string; to?: string } | null;
        traceError: string | null;
    }
    const trace = await api<Trace>(`/tx/${txHash}/trace`);
    assert.equal(trace.traceError, null, "tracing should be available on a --steps-tracing node");
    assert.ok(trace.structLogs.length > 0, "expected an opcode trace");
    assert.ok(trace.structLogs.some((log) => log.op === "SSTORE"), "a token transfer must write storage");
    assert.ok(trace.callTrace, "callTracer should have produced a call tree");

    // Served from SQLite the second time — the cache is what makes the tab usable.
    const cached = await api<Trace & { cached?: boolean }>(`/tx/${txHash}/trace`);
    assert.equal(cached.cached, true, "the second read should come from the trace cache");
});

await step("the Etherscan-compatible API answers", async () => {
    const result = await api<{ result: string }>("/explorer?module=proxy&action=eth_blockNumber");
    assert.ok(result.result.startsWith("0x"), `expected a hex block number, got ${JSON.stringify(result)}`);
});

await step("the RPC proxy passes reads through", async () => {
    const body = await api<{ result: string }>("/rpc", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    assert.equal(parseInt(body.result, 16), CHAIN_ID);
});

await step("bad input is refused with 400, not a 500", async () => {
    const res = await fetch(`${API}/patches/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "native", address: "not-an-address", amount: "1" }),
    });
    assert.equal(res.status, 400);
});

console.log(`\n${failures === 0 ? "smoke test passed" : `${failures} smoke check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
