import { NextResponse } from "next/server";
import { getAnvilState } from "@/lib/anvilProcess";
import { getDB } from "@/lib/db";
import { rpc } from "@/lib/rpc";

export async function POST(req: Request) {
    try {
        const { label } = await req.json();
        const id = await rpc("evm_snapshot", []) as string;

        // Get current block number
        const blockHex = await rpc("eth_blockNumber", []) as string;
        const blockNumber = parseInt(blockHex, 16);

        const db = getDB();
        db.prepare(`
      INSERT OR REPLACE INTO snapshots (id, label, block_number, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, label ?? `Snapshot ${id}`, blockNumber, Date.now());

        return NextResponse.json({ id, label, blockNumber });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function GET() {
    try {
        const db = getDB();
        const snapshots = db.prepare("SELECT * FROM snapshots ORDER BY created_at DESC").all();
        return NextResponse.json(snapshots);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
