import { NextResponse } from "next/server";
import { getProject, deleteProject, updateProject, updateProjectStatus } from "@/lib/projectStore";
import { isAnvilRunning, stopAnvil } from "@/lib/anvilProcess";
import { invalidateActiveProjectCache } from "@/lib/activeProject";
import { ValidationError, assertHttpUrl, assertInt, assertNonEmptyString } from "@/lib/validate";

interface RouteParams {
    params: Promise<{ id: string }>;
}

function fail(err: unknown) {
    if (err instanceof ValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
}

export async function GET(_req: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const project = getProject(id);
        if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

        return NextResponse.json({
            ...project,
            isRunning: isAnvilRunning(id),
            rpcUrl: `http://127.0.0.1:${project.port}`,
        });
    } catch (err: unknown) {
        return fail(err);
    }
}

export async function PATCH(req: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const project = getProject(id);
        if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
        if (isAnvilRunning(id)) {
            return NextResponse.json({ error: "Stop the project before editing it" }, { status: 409 });
        }

        const body = await req.json();
        const updated = updateProject(id, {
            name: body.name === undefined ? undefined : assertNonEmptyString(body.name, "name", 60),
            chainId: body.chainId === undefined ? undefined : assertInt(body.chainId, "chainId", 1, Number.MAX_SAFE_INTEGER),
            forkUrl: body.forkUrl === undefined ? undefined : body.forkUrl === null || body.forkUrl === "" ? null : assertHttpUrl(body.forkUrl, "forkUrl"),
            forkBlock: body.forkBlock === undefined ? undefined : body.forkBlock === null ? null : assertInt(body.forkBlock, "forkBlock", 0, Number.MAX_SAFE_INTEGER),
            port: body.port === undefined ? undefined : assertInt(body.port, "port", 1024, 65535),
        });
        invalidateActiveProjectCache();

        return NextResponse.json({ project: { ...updated, isRunning: false, rpcUrl: `http://127.0.0.1:${updated.port}` } });
    } catch (err: unknown) {
        return fail(err);
    }
}

export async function DELETE(_req: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const project = getProject(id);
        if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

        if (isAnvilRunning(id)) {
            await stopAnvil(id, project.port);
            updateProjectStatus(id, "stopped");
        }

        const result = deleteProject(id);
        invalidateActiveProjectCache();
        return NextResponse.json({ success: true, ...result });
    } catch (err: unknown) {
        return fail(err);
    }
}
