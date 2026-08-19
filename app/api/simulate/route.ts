import { resolveFromRequest } from "@/lib/activeProject";
import { rpc } from "@/lib/rpc";
import { decodeEvent, getName } from "@/lib/abiRegistry";
import { assertAddress, assertHex } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

interface StructStep { op: string; stack?: string[] }
interface RpcLog { address: string; topics: `0x${string}`[]; data: `0x${string}` }

/**
 * Dry-run a call: `eth_call` for the return value, then a real send inside an
 * EVM snapshot so we can collect gas, SSTOREs and logs, and revert afterwards.
 */
export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json();
        const to = assertAddress(body.to, "to");
        const from = body.from ? assertAddress(body.from, "from") : undefined;
        const data = body.data ? assertHex(body.data, "data") : "0x";
        const value = body.value ? assertHex(body.value, "value") : "0x0";
        const { port } = resolveFromRequest(req);

        const tx = { to, from, data, value };

        let returnData: string | null = null;
        let callError: string | null = null;
        try {
            returnData = await rpc<string>("eth_call", [tx, "latest"], port);
        } catch (err) {
            callError = err instanceof Error ? err.message : "eth_call reverted";
        }

        let gasEstimate: string | null = null;
        try {
            gasEstimate = BigInt(await rpc<string>("eth_estimateGas", [tx], port)).toString();
        } catch {
            /* estimation fails for reverting calls — leave null */
        }

        // Cap the send at the block gas limit — a hard-coded 100M is rejected outright.
        const blockGasLimit = await rpc<{ gasLimit?: string }>("eth_getBlockByNumber", ["latest", false], port)
            .then((b) => (b?.gasLimit ? BigInt(b.gasLimit) : null))
            .catch(() => null);
        const requestedGas = gasEstimate
            ? BigInt(gasEstimate) * 2n
            : blockGasLimit ?? 30_000_000n;
        const gas = `0x${(blockGasLimit && requestedGas > blockGasLimit ? blockGasLimit : requestedGas).toString(16)}`;

        const snapshotId = await rpc<string>("evm_snapshot", [], port);
        let sstores: { slot: string; value: string }[] = [];
        let events: unknown[] = [];
        let gasUsed: string | null = null;
        let executionError: string | null = null;

        try {
            const txHash = await rpc<string>("eth_sendTransaction", [{ ...tx, gas }], port);
            if (txHash) {
                await rpc("evm_mine", [], port).catch(() => { });

                const trace = await rpc<{ structLogs?: StructStep[] }>(
                    "debug_traceTransaction", [txHash, { disableStorage: false, disableMemory: true }], port
                ).catch(() => null);

                sstores = (trace?.structLogs ?? [])
                    .filter((s) => s.op === "SSTORE")
                    .map((s) => ({
                        slot: s.stack?.[s.stack.length - 1] ?? "?",
                        value: s.stack?.[s.stack.length - 2] ?? "?",
                    }));

                const receipt = await rpc<{ logs?: RpcLog[]; gasUsed?: string } | null>(
                    "eth_getTransactionReceipt", [txHash], port
                );
                gasUsed = receipt?.gasUsed ?? null;
                events = (receipt?.logs ?? []).map((log) => {
                    const decoded = decodeEvent(log.address, log);
                    return {
                        ...log,
                        contractName: getName(log.address),
                        eventName: decoded?.eventName ?? null,
                        args: decoded?.args ? JSON.parse(JSON.stringify(decoded.args, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) : null,
                    };
                });
            }
        } catch (err) {
            executionError = err instanceof Error ? err.message : "Execution failed";
        } finally {
            // Always roll the chain back — a simulation must not leave state behind.
            await rpc("evm_revert", [snapshotId], port).catch(() => { });
        }

        return {
            success: callError === null && executionError === null,
            error: callError ?? executionError,
            reverted: callError !== null,
            gasEstimate,
            gasUsed,
            returnData,
            sstores,
            events,
        };
    });
}
