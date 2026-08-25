import { getDB, scopeId } from "@/lib/db";
import { fundNative } from "@/lib/patcher";
import { setTokenBalance } from "@/lib/tokenBalances";
import { resolveFromRequest } from "@/lib/activeProject";
import { ValidationError, assertAddress, assertAmount, assertInt } from "@/lib/validate";
import { handleRoute } from "@/lib/route";
import { parseUnits } from "viem";

export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json();
        const active = resolveFromRequest(req);
        const address = assertAddress(body.address, "address");
        const amount = assertAmount(body.amount, "amount");

        if (body.type === "native") {
            // `announce: false` skips the zero-value transaction that makes the
            // explorer notice the new balance — useful when a test counts blocks.
            await fundNative(address, amount, active.port, body.announce !== false);
        } else if (body.type === "erc20") {
            const token = assertAddress(body.token, "token");
            const decimals = assertInt(body.decimals ?? 18, "decimals", 0, 36);
            const mappingSlot = body.mappingSlot === undefined || body.mappingSlot === null
                ? undefined
                : assertInt(body.mappingSlot, "mappingSlot", 0, 200);
            // parseUnits keeps full precision — float math loses it above ~15 digits.
            await setTokenBalance(
                token, address, parseUnits(amount, decimals), active.port, mappingSlot, decimals, body.announce !== false,
            );
        } else {
            throw new ValidationError(`Unknown fund type: ${body.type}`);
        }

        getDB().prepare(`
      INSERT INTO patch_history (type, target_address, payload, applied_at, project_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
            body.type === "native" ? "fund_native" : "fund_erc20",
            address,
            JSON.stringify(body),
            Date.now(),
            scopeId(active.projectId)
        );

        return { success: true };
    });
}
