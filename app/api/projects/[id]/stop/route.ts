import { NextResponse } from "next/server";
import { getProject, updateProjectStatus } from "@/lib/projectStore";
import { stopAnvil } from "@/lib/anvilProcess";
import { resetRpcClients } from "@/lib/rpc";
import { invalidateActiveProjectCache } from "@/lib/activeProject";

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
    try {
        const { id } = await params;
        const project = getProject(id);
        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        // Always attempt the stop: the row can say "running" after a dev-server
        // reload dropped the in-process handle, and the port still needs freeing.
        await stopAnvil(id, project.port);
        updateProjectStatus(id, "stopped");
        resetRpcClients();
        invalidateActiveProjectCache();

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
