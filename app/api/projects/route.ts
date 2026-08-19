import { listProjects, createProject, reconcileProjectStatuses, type CreateProjectInput } from "@/lib/projectStore";
import { isAnvilRunning } from "@/lib/anvilProcess";
import { invalidateActiveProjectCache } from "@/lib/activeProject";
import { assertHttpUrl, assertInt, assertNonEmptyString } from "@/lib/validate";
import { handleRoute } from "@/lib/route";

export const dynamic = "force-dynamic";

export async function GET() {
    return handleRoute(async () => {
        // The DB `status` column is only a hint; the live process map is the truth.
        reconcileProjectStatuses((id) => isAnvilRunning(id));
        const projects = listProjects().map((p) => ({
            ...p,
            isRunning: isAnvilRunning(p.id),
            rpcUrl: `http://127.0.0.1:${p.port}`,
        }));
        return { projects };
    });
}

export async function POST(req: Request) {
    return handleRoute(async () => {
        const body = await req.json();
        const input: CreateProjectInput = {
            name: assertNonEmptyString(body.name, "name", 60),
            chainId: assertInt(body.chainId ?? 31337, "chainId", 1, Number.MAX_SAFE_INTEGER),
            forkUrl: body.forkUrl ? assertHttpUrl(body.forkUrl, "forkUrl") : undefined,
            forkBlock: body.forkBlock ? assertInt(body.forkBlock, "forkBlock", 0, Number.MAX_SAFE_INTEGER) : undefined,
            port: body.port === undefined || body.port === null ? undefined : assertInt(body.port, "port", 1024, 65535),
            config: typeof body.config === "object" && body.config !== null ? body.config : undefined,
        };

        const project = createProject(input);
        invalidateActiveProjectCache();
        return { project: { ...project, isRunning: false, rpcUrl: `http://127.0.0.1:${project.port}` } };
    });
}
