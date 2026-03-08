import { NextResponse } from "next/server";
import { stopAnvil, getAnvilState } from "@/lib/anvilProcess";

export async function POST() {
    try {
        const state = getAnvilState();
        await stopAnvil(state.config?.port);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
