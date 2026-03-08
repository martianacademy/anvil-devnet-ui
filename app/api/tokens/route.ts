import { NextResponse } from "next/server";
import { getDB } from "@/lib/db";
import { fetchTokenBalance } from "@/lib/tokenBalances";
import { getAnvilState } from "@/lib/anvilProcess";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const db = getDB();
        const watchlist = db.prepare("SELECT * FROM token_watchlist ORDER BY added_at DESC").all() as any[];
        return NextResponse.json(watchlist);
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { token_address, wallet_address, token_name, token_symbol, token_decimals = 18, token_type = "ERC20" } = await req.json();
        const db = getDB();
        db.prepare(`
      INSERT OR IGNORE INTO token_watchlist (token_address, wallet_address, token_name, token_symbol, token_decimals, token_type, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(token_address.toLowerCase(), wallet_address.toLowerCase(), token_name, token_symbol, token_decimals, token_type, Date.now());
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { id } = await req.json();
        const db = getDB();
        db.prepare("DELETE FROM token_watchlist WHERE id = ?").run(id);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
