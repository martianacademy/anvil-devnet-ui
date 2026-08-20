import { killAnvilProcess, killOrphanAnvil, listAnvilProcesses } from "@/lib/anvilProcess";
import { invalidateActiveProjectCache } from "@/lib/activeProject";
import { resetRpcClients } from "@/lib/rpc";
import { ValidationError, assertInt } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

/** Every anvil listening on this machine, managed by this app or not. */
export async function GET() {
    return handleRoute(async () => ({ processes: listAnvilProcesses() }));
}

/**
 * Stop stray nodes.
 *
 * A node left running from a previous session — or started in a terminal — is the
 * usual reason a start fails with "port already in use", and nothing in the UI
 * could clear it before.
 *
 * Body: `{ pid }`, `{ port }`, or `{ all: true }`.
 */
export async function DELETE(req: Request) {
    return handleRoute(async () => {
        const body = await req.json().catch(() => ({}) as Record<string, unknown>);
        const running = listAnvilProcesses();
        const stopped: number[] = [];

        if (body.all === true) {
            for (const proc of running) {
                if (killAnvilProcess(proc.pid)) stopped.push(proc.pid);
            }
        } else if (body.pid !== undefined) {
            const pid = assertInt(body.pid, "pid", 1, Number.MAX_SAFE_INTEGER);
            if (!running.some((proc) => proc.pid === pid)) {
                throw new ValidationError(`No anvil process with pid ${pid} is listening`);
            }
            if (killAnvilProcess(pid)) stopped.push(pid);
        } else if (body.port !== undefined) {
            const port = assertInt(body.port, "port", 1, 65535);
            const target = running.find((proc) => proc.port === port);
            if (target && killAnvilProcess(target.pid)) {
                stopped.push(target.pid);
            } else if (killOrphanAnvil(port)) {
                // Fall back to the port-based sweep for anything lsof reported differently.
                stopped.push(port);
            }
        } else {
            throw new ValidationError("Pass pid, port, or all: true");
        }

        resetRpcClients();
        invalidateActiveProjectCache();

        return { success: stopped.length > 0, stopped, remaining: listAnvilProcesses() };
    });
}
