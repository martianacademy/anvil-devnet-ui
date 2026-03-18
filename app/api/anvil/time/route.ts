import { NextResponse } from "next/server";
import { rpc } from "@/lib/rpc";

export async function POST(req: Request) {
    try {
        const { action, value } = await req.json();

        if (action === "increaseTime") {
            await rpc("evm_increaseTime", [Number(value)]);
            await rpc("evm_mine", [{}]);
        } else if (action === "setNextBlockTimestamp") {
            await rpc("evm_setNextBlockTimestamp", [Number(value)]);
            await rpc("evm_mine", [{}]);
        } else if (action === "setAutomine") {
            await rpc("evm_setAutomine", [Boolean(value)]);
        } else if (action === "setIntervalMining") {
            await rpc("evm_setIntervalMining", [Number(value)]);
        } else {
            return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        }

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
