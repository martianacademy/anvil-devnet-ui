import { NextResponse } from "next/server";
import { getAnvilState } from "@/lib/anvilProcess";

export async function POST(req: Request) {
    try {
        const { to, from, data, value = "0x0" } = await req.json();
        const port = getAnvilState().config?.port ?? 8545;
        const baseUrl = `http://127.0.0.1:${port}`;

        const jsonRpc = (method: string, params: unknown[]) =>
            fetch(baseUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
            }).then((r) => r.json());

        // Step 1: eth_call for result
        const callResult = await jsonRpc("eth_call", [{ to, from, data, value }, "latest"]);

        // Step 2: estimate gas
        let gasEst = "0";
        try {
            const gasResult = await jsonRpc("eth_estimateGas", [{ to, from, data, value }]);
            gasEst = BigInt(gasResult.result ?? "0x0").toString();
        } catch { /* ignore */ }

        // Step 3: snapshot → send tx → trace → revert
        const snapResult = await jsonRpc("evm_snapshot", []);
        const snapId = snapResult.result;

        let sstores: Array<{ slot: string; value: string }> = [];
        let events: unknown[] = [];

        try {
            const sendResult = await jsonRpc("eth_sendTransaction", [{
                to, from, data, value,
                gas: "0x5F5E100",
            }]);
            const txHash = sendResult.result;

            if (txHash) {
                await jsonRpc("evm_mine", [{}]);
                const traceResult = await jsonRpc("debug_traceTransaction", [txHash, { disableStorage: false }]);
                const steps = traceResult.result?.structLogs ?? [];
                sstores = steps
                    .filter((s: any) => s.op === "SSTORE")
                    .map((s: any) => ({
                        slot: s.stack?.[s.stack.length - 1] ?? "?",
                        value: s.stack?.[s.stack.length - 2] ?? "?",
                    }));

                // Get receipt for events
                const rcpt = await jsonRpc("eth_getTransactionReceipt", [txHash]);
                events = rcpt.result?.logs ?? [];
            }
        } finally {
            await jsonRpc("evm_revert", [snapId]);
        }

        const success = !callResult.error;
        return NextResponse.json({
            success,
            error: callResult.error?.message ?? null,
            gasEstimate: gasEst,
            returnData: callResult.result ?? null,
            sstores,
            events,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
