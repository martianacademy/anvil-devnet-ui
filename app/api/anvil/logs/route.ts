import { getAnvilLogs, getAnvilState } from "@/lib/anvilProcess";
import { resolveFromRequest } from "@/lib/activeProject";
import { clampInt } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export async function GET(req: Request) {
    return handleRoute(async () => {
        const active = resolveFromRequest(req);
        const limit = clampInt(new URL(req.url).searchParams.get("limit"), 200, 1, 500);
        const state = getAnvilState(active.projectId ?? undefined);
        return {
            logs: getAnvilLogs(active.projectId ?? undefined).slice(-limit),
            logPath: state.logPath,
            lastError: state.lastError,
            projectId: active.projectId,
        };
    });
}
