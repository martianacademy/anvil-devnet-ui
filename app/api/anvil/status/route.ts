import { NextResponse } from "next/server";
import { getAnvilState, isAnvilRunning } from "@/lib/anvilProcess";
import os from "os";

function getLanIp(): string | null {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] ?? []) {
            if (iface.family === "IPv4" && !iface.internal) {
                return iface.address;
            }
        }
    }
    return null;
}

async function probePort(port: number): Promise<{ blockNumber: number; chainId: number } | null> {
    try {
        const rpc = (method: string, id: number) =>
            fetch(`http://127.0.0.1:${port}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id }),
                signal: AbortSignal.timeout(600),
            }).then((r) => r.json());

        const [blk, chain] = await Promise.all([
            rpc("eth_blockNumber", 1),
            rpc("eth_chainId", 2),
        ]);
        if (!blk.result) return null;
        return {
            blockNumber: parseInt(blk.result, 16),
            chainId: chain.result ? parseInt(chain.result, 16) : 31337,
        };
    } catch {
        return null;
    }
}

export async function GET() {
    try {
        const state = getAnvilState();
        const configuredPort = state.config?.port ?? 8545;

        let running = isAnvilRunning();
        let port = configuredPort;
        let blockNumber = 0;
        let chainId: number | null = state.config?.chainId ?? null;

        const portsToTry = [...new Set([configuredPort, 8545])];
        for (const p of portsToTry) {
            const probe = await probePort(p);
            if (probe) {
                running = true;
                port = p;
                blockNumber = probe.blockNumber;
                chainId = probe.chainId;
                break;
            }
        }

        if (!running) {
            running = isAnvilRunning();
        }

        return NextResponse.json({
            running,
            pid: state.proc?.pid ?? null,
            port,
            chainId,
            blockNumber,
            lanIp: getLanIp(),
            uptime: state.startedAt ? Math.floor((Date.now() - state.startedAt) / 1000) : 0,
            config: running
                ? { ...(state.config ?? {}), port, chainId }
                : state.config,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

