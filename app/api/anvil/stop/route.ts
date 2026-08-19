import { stopAnvil } from "@/lib/anvilProcess";
import { resolveFromRequest, invalidateActiveProjectCache } from "@/lib/activeProject";
import { resetRpcClients } from "@/lib/rpc";
import { handleRoute } from "@/lib/route";

export async function POST(req: Request) {
    return handleRoute(async () => {
        const active = resolveFromRequest(req);
        await stopAnvil(active.projectId ?? undefined, active.port);
        resetRpcClients();
        invalidateActiveProjectCache();
        return { success: true, port: active.port };
    });
}
