import { NextResponse } from "next/server";
import { rpc } from "@/lib/rpc";
import { getDB } from "@/lib/db";

export async function POST(req: Request) {
    try {
        const { id } = await req.json();
        await rpc("evm_revert", [id]);

        // Remove snapshot from DB (evm_revert consumes it)
        const db = getDB();
        db.prepare("DELETE FROM snapshots WHERE id = ?").run(id);

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
