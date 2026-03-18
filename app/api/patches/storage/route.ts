import { NextResponse } from "next/server";
import { writeStorageSlot, readStorageSlot } from "@/lib/patcher";
import { getDB } from "@/lib/db";
import { getAnvilState } from "@/lib/anvilProcess";

export async function POST(req: Request) {
    try {
        const { contract, slot, value } = await req.json();
        const port = getAnvilState().config?.port ?? 8545;
        await writeStorageSlot(contract, slot, value, port);

        const db = getDB();
        db.prepare(`
      INSERT INTO patch_history (type, target_address, payload, applied_at)
      VALUES (?, ?, ?, ?)
    `).run("storage_write", contract, JSON.stringify({ slot, value }), Date.now());

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const contract = searchParams.get("contract") ?? "";
        const slot = searchParams.get("slot") ?? "0x0";
        const port = getAnvilState().config?.port ?? 8545;
        const value = await readStorageSlot(contract, slot, port);
        return NextResponse.json({ value });
    } catch (err: unknown) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
    }
}
