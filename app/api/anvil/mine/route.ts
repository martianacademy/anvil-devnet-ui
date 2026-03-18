import { NextResponse } from "next/server";
import { rpc } from "@/lib/rpc";

export async function POST(req: Request) {
    try {
        const { blocks = 1 } = await req.json();
        await rpc("evm_mine", [{ blocks }]);
        const blockHex = await rpc("eth_blockNumber", []) as string;
        const blockNumber = parseInt(blockHex, 16);
        return NextResponse.json({ success: true, blockNumber });
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
