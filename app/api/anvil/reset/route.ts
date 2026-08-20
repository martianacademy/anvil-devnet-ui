import fs from "fs";
import { getAnvilState, isAnvilRunning, stopAnvil, stateFilePath, logPathFor, LEGACY_KEY } from "@/lib/anvilProcess";
import { getDB, scopeId } from "@/lib/db";
import { resolveFromRequest, invalidateActiveProjectCache } from "@/lib/activeProject";
import { syncExplorer } from "@/lib/explorerStack";
import { resetRpcClients } from "@/lib/rpc";
import { assertInt } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

/**
 * Wipes indexed data + persisted EVM state for the active chain/project.
 * Stops the node first so anvil's `--dump-state` can't rewrite the file we delete.
 */
export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json().catch(() => ({}) as Record<string, unknown>);
        const active = resolveFromRequest(req);
        const projectId = active.projectId;
        const chainId = body.chainId
            ? assertInt(body.chainId, "chainId", 1, Number.MAX_SAFE_INTEGER)
            : active.chainId;

        if (isAnvilRunning(projectId ?? undefined)) {
            await stopAnvil(projectId ?? undefined, active.port);
        }

        const db = getDB();
        const deletedRows = db.transaction(() => {
            const scope = scopeId(projectId);
            const blocks = db.prepare("DELETE FROM blocks WHERE chain_id = ? AND project_id = ?").run(chainId, scope);
            const txs = db.prepare("DELETE FROM transactions WHERE chain_id = ? AND project_id = ?").run(chainId, scope);
            db.prepare("DELETE FROM patch_history WHERE project_id = ?").run(scope);
            db.prepare("DELETE FROM snapshots WHERE project_id = ?").run(scope);
            return { blocks: blocks.changes, transactions: txs.changes };
        })();

        // Remove persisted EVM state (fork + non-fork variants) and truncate the log.
        const key = projectId ?? LEGACY_KEY;
        const deleted: string[] = [];
        for (const fork of [false, true]) {
            const file = stateFilePath(key, chainId, fork);
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
                deleted.push(file);
            }
        }
        const custom = getAnvilState(projectId ?? undefined).stateFile;
        if (custom && !deleted.includes(custom) && fs.existsSync(custom)) {
            fs.unlinkSync(custom);
            deleted.push(custom);
        }

        const logFile = logPathFor(key);
        if (fs.existsSync(logFile)) fs.writeFileSync(logFile, "");

        resetRpcClients();
        invalidateActiveProjectCache();

        // The explorer's index belongs to the chain we just wiped.
        const explorerSync = syncExplorer(chainId, active.port);

        return { success: true, chainId, projectId, deleted, deletedRows, explorerSync };
    });
}
