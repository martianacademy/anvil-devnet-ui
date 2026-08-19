import { getDB, scopeId } from "@/lib/db";
import { rpc } from "@/lib/rpc";
import { resolveFromRequest } from "@/lib/activeProject";
import { assertNonEmptyString } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export async function POST(req: Request) {
    return handleRoute(async () => {
        const { id } = await req.json();
        const snapshotId = assertNonEmptyString(id, "id", 80);
        const active = resolveFromRequest(req);

        const reverted = await rpc<boolean>("evm_revert", [snapshotId], active.port);
        if (reverted === false) {
            // Anvil returns false for an unknown/already-consumed snapshot.
            getDB().prepare("DELETE FROM snapshots WHERE id = ?").run(snapshotId);
            return { success: false, error: "Snapshot no longer exists on the node" };
        }

        // evm_revert consumes the snapshot and every snapshot taken after it.
        const db = getDB();
        const row = db.prepare("SELECT created_at FROM snapshots WHERE id = ?").get(snapshotId) as { created_at: number } | undefined;
        if (row) {
            db.prepare("DELETE FROM snapshots WHERE project_id = ? AND created_at >= ?").run(scopeId(active.projectId), row.created_at);
        } else {
            db.prepare("DELETE FROM snapshots WHERE id = ?").run(snapshotId);
        }

        const blockNumber = parseInt(await rpc<string>("eth_blockNumber", [], active.port), 16);
        return { success: true, blockNumber };
    });
}
