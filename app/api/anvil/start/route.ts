import { NextResponse } from "next/server";
import { startAnvil } from "@/lib/anvilProcess";
import { setRpcPort } from "@/lib/rpc";
import type { AnvilConfig } from "@/lib/anvilProcess";

export async function POST(req: Request) {
    try {
        const config: AnvilConfig = await req.json();
        setRpcPort(config.port ?? 8545);
        const resolvedConfig = await startAnvil(config);
        return NextResponse.json({
            success: true,
            port: resolvedConfig.port,
            forkBlockNumber: resolvedConfig.forkBlockNumber,
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
