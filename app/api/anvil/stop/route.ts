import { NextResponse } from "next/server";
import { stopAnvil, getAnvilState } from "@/lib/anvilProcess";

export async function POST() {
    try {
        const state = getAnvilState();
        await stopAnvil(state.config?.port);
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
