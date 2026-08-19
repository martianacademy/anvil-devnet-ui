import { getDB, scopeId } from "@/lib/db";
import { fetchTokenBalances, type TokenWatch } from "@/lib/tokenBalances";
import { resolveFromRequest } from "@/lib/activeProject";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
    return handleRoute(async () => {
        const active = resolveFromRequest(req);
        const watchlist = getDB()
            .prepare("SELECT * FROM token_watchlist WHERE project_id = ? ORDER BY added_at DESC")
            .all(scopeId(active.projectId)) as TokenWatch[];

        // One batched RPC round trip for the whole watchlist instead of N calls.
        const balances = await fetchTokenBalances(watchlist, active.port);
        return watchlist.map((w, i) => ({ ...w, balance: balances[i] }));
    });
}
