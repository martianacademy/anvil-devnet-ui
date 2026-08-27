import { getProject, updateProjectStatus, updateProjectConfig } from "@/lib/projectStore";
import { startAnvil, stateFilePath, type AnvilConfig } from "@/lib/anvilProcess";
import { resetRpcClients } from "@/lib/rpc";
import { invalidateActiveProjectCache } from "@/lib/activeProject";
import { syncExplorer } from "@/lib/explorerStack";
import { NextResponse } from "next/server";

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(_req: Request, { params }: RouteParams) {
    const { id } = await params;
    try {
        const project = getProject(id);
        if (!project) {
            return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }

        updateProjectStatus(id, "starting");
        const existingConfig = project.config ? JSON.parse(project.config) : {};

        const config: AnvilConfig = {
            chainId: project.chain_id,
            port: project.port,
            blockTime: existingConfig.blockTime ?? 15,
            accounts: existingConfig.accounts ?? 10,
            balance: existingConfig.balance ?? 10000,
            baseFee: existingConfig.baseFee ?? 0,
            stepsTracing: existingConfig.stepsTracing !== false,
            stateInterval: existingConfig.stateInterval ?? 30,
            persistState: existingConfig.persistState !== false,
            stateFile: stateFilePath(id, project.chain_id, Boolean(project.fork_url)),
            forkUrl: project.fork_url ?? undefined,
            forkBlockNumber: project.fork_block ?? undefined,
        };

        const resolved = await startAnvil(config, id);
        updateProjectStatus(id, "running");
        updateProjectConfig(id, { ...existingConfig, forkBlockNumber: resolved.forkBlockNumber });
        resetRpcClients();
        invalidateActiveProjectCache();
        const explorerSync = syncExplorer(resolved.chainId, resolved.port);

        return NextResponse.json({
            success: true,
            explorerSync,
            port: resolved.port,
            chainId: resolved.chainId,
            forkBlockNumber: resolved.forkBlockNumber ?? null,
            rpcUrl: `http://127.0.0.1:${resolved.port}`,
        });
    } catch (err: unknown) {
        updateProjectStatus(id, "error");
        invalidateActiveProjectCache();
        const msg = err instanceof Error ? err.message : "Unknown error";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
