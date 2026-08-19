import { getDB, scopeId } from "@/lib/db";
import { resolveFromRequest } from "@/lib/activeProject";
import { fetchTokenMetadata } from "@/lib/tokenBalances";
import { ValidationError, assertAddress, assertInt } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    return handleRoute(async () => {
        const active = resolveFromRequest(req);
        return getDB()
            .prepare("SELECT * FROM token_watchlist WHERE project_id = ? ORDER BY added_at DESC")
            .all(scopeId(active.projectId));
    });
}

export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json();
        const token = assertAddress(body.token_address, "token_address");
        const wallet = assertAddress(body.wallet_address, "wallet_address");
        const active = resolveFromRequest(req);

        // Fill in name/symbol/decimals from the chain when the client didn't supply them.
        const meta = await fetchTokenMetadata(token, active.port);
        const decimals = body.token_decimals === undefined
            ? meta.decimals ?? 18
            : assertInt(body.token_decimals, "token_decimals", 0, 36);

        getDB().prepare(`
      INSERT OR IGNORE INTO token_watchlist
        (token_address, wallet_address, token_name, token_symbol, token_decimals, token_type, added_at, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            token,
            wallet,
            body.token_name ?? meta.name ?? null,
            body.token_symbol ?? meta.symbol ?? null,
            decimals,
            body.token_type === "ERC721" ? "ERC721" : "ERC20",
            Date.now(),
            scopeId(active.projectId)
        );

        return { success: true, token, wallet, metadata: meta };
    });
}

export async function DELETE(req: Request) {
    return handleRoute(async () => {
        const { id } = await req.json();
        if (typeof id !== "number") throw new ValidationError("id must be a number");
        const active = resolveFromRequest(req);
        const res = getDB()
            .prepare("DELETE FROM token_watchlist WHERE id = ? AND project_id = ?")
            .run(id, scopeId(active.projectId));
        return { success: res.changes > 0 };
    });
}
