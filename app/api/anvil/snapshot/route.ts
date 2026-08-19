import { getDB, scopeId } from "@/lib/db";
import { rpc } from "@/lib/rpc";
import { resolveFromRequest } from "@/lib/activeProject";
import { assertNonEmptyString } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json().catch(() => ({}));
        const active = resolveFromRequest(req);

        const id = await rpc<string>("evm_snapshot", [], active.port);
        const blockNumber = parseInt(await rpc<string>("eth_blockNumber", [], active.port), 16);
        const label = body.label ? assertNonEmptyString(body.label, "label", 80) : `Snapshot ${id}`;

        getDB().prepare(`
      INSERT OR REPLACE INTO snapshots (id, label, block_number, created_at, project_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, label, blockNumber, Date.now(), scopeId(active.projectId));

        return { id, label, blockNumber, projectId: active.projectId };
    });
}

export async function GET(req: Request) {
    return handleRoute(async () => {
        const active = resolveFromRequest(req);
        const rows = getDB()
            .prepare("SELECT * FROM snapshots WHERE project_id = ? ORDER BY created_at DESC")
            .all(scopeId(active.projectId));
        return rows;
    });
}
