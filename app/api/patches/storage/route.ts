import { getDB, scopeId } from "@/lib/db";
import { readStorageSlot, writeStorageSlot } from "@/lib/patcher";
import { resolveFromRequest } from "@/lib/activeProject";
import { assertAddress, assertHex, assertSlot } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
    return handleRoute(async () => {
        const { contract, slot, value } = await req.json();
        const address = assertAddress(contract, "contract");
        const slotHex = assertSlot(slot);
        const valueHex = assertHex(value, "value");
        const active = resolveFromRequest(req);

        await writeStorageSlot(address, slotHex, valueHex, active.port);

        getDB().prepare(`
      INSERT INTO patch_history (type, target_address, payload, applied_at, project_id)
      VALUES (?, ?, ?, ?, ?)
    `).run("storage_write", address, JSON.stringify({ slot: slotHex, value: valueHex }), Date.now(), scopeId(active.projectId));

        return { success: true, slot: slotHex, value: valueHex };
    });
}

export async function GET(req: Request) {
    return handleRoute(async () => {
        const params = new URL(req.url).searchParams;
        const address = assertAddress(params.get("contract"), "contract");
        const slot = assertSlot(params.get("slot") ?? "0x0");
        const active = resolveFromRequest(req);
        return { slot, value: await readStorageSlot(address, slot, active.port) };
    });
}
