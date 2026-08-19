import { rpc } from "@/lib/rpc";
import { resolveFromRequest } from "@/lib/activeProject";
import { ValidationError, assertInt } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

const MAX_TIMESTAMP = 4_102_444_800; // 2100-01-01

export async function POST(req: Request) {
    return handleRoute(async () => {
        const { action, value } = await req.json();
        const { port } = resolveFromRequest(req);

        switch (action) {
            case "increaseTime":
                await rpc("evm_increaseTime", [assertInt(value, "value", 0, 100 * 365 * 24 * 3600)], port);
                await rpc("evm_mine", [], port);
                break;
            case "setNextBlockTimestamp":
                await rpc("evm_setNextBlockTimestamp", [assertInt(value, "value", 0, MAX_TIMESTAMP)], port);
                await rpc("evm_mine", [], port);
                break;
            case "setAutomine":
                await rpc("evm_setAutomine", [Boolean(value)], port);
                break;
            case "setIntervalMining":
                await rpc("evm_setIntervalMining", [assertInt(value, "value", 0, 86_400)], port);
                break;
            default:
                throw new ValidationError(`Unknown action: ${action}`);
        }

        const blockHex = await rpc<string>("eth_blockNumber", [], port);
        return { success: true, blockNumber: parseInt(blockHex, 16) };
    });
}
