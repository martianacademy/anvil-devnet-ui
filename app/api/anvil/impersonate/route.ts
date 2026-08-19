import { rpc } from "@/lib/rpc";
import { resolveFromRequest } from "@/lib/activeProject";
import { ValidationError, assertAddress } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export async function POST(req: Request) {
    return handleRoute(async () => {
        const { action, address } = await req.json();
        const target = assertAddress(address);
        const { port } = resolveFromRequest(req);

        if (action === "start") {
            await rpc("anvil_impersonateAccount", [target], port);
            return { success: true, impersonating: target };
        }
        if (action === "stop") {
            await rpc("anvil_stopImpersonatingAccount", [target], port);
            return { success: true, impersonating: null };
        }
        throw new ValidationError(`Unknown action: ${action}`);
    });
}
