import { rpc } from "@/lib/rpc";
import { resolveFromRequest } from "@/lib/activeProject";
import { assertInt } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json().catch(() => ({}));
        const blocks = assertInt(body.blocks ?? 1, "blocks", 1, 10_000);
        const { port } = resolveFromRequest(req);

        // `evm_mine` only accepts a timestamp — mining N blocks is `anvil_mine`.
        await rpc("anvil_mine", [`0x${blocks.toString(16)}`], port);
        const blockHex = await rpc<string>("eth_blockNumber", [], port);
        return { success: true, blockNumber: parseInt(blockHex, 16) };
    });
}
