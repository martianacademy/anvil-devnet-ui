import { NextResponse } from "next/server";
import { getAnvilState, isAnvilRunning } from "@/lib/anvilProcess";

export async function GET() {
    try {
        const state = getAnvilState();
        const port = state.config?.port ?? 8545;
        let blockNumber = 0;
        let running = isAnvilRunning();

        if (running) {
            try {
                const res = await fetch(`http://127.0.0.1:${port}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
                });
                const data = await res.json();
                blockNumber = parseInt(data.result ?? "0", 16);
            } catch {
                running = false;
            }
        }

        return NextResponse.json({
            running,
            pid: state.proc?.pid ?? null,
            port,
            chainId: state.config?.chainId ?? null,
            blockNumber,
            uptime: state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0,
            config: state.config,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
