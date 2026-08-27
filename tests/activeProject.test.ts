import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DEVNET_DB_PATH = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "devnet-active-")),
    "test.db"
);

const { getAnvilState, getAllInstances, LEGACY_KEY } = await import("../lib/anvilProcess.ts");
const { resolveActiveProject, resolveFromRequest, invalidateActiveProjectCache } =
    await import("../lib/activeProject.ts");
const { createProject, updateProjectStatus } = await import("../lib/projectStore.ts");

const config = (port: number, chainId: number) => ({
    chainId,
    port,
    blockTime: 2,
    accounts: 10,
    balance: 10000,
    baseFee: 0,
    stepsTracing: true,
    persistState: false,
    stateInterval: 0,
    stateFile: "",
});

test("falls back to 8545/31337 when nothing is running", () => {
    getAllInstances().clear();
    invalidateActiveProjectCache();
    const target = resolveActiveProject(undefined, { listProcesses: () => [] });
    assert.deepEqual(
        { port: target.port, chainId: target.chainId, projectId: target.projectId },
        { port: 8545, chainId: 31337, projectId: null }
    );
});

test("an explicit project id wins over everything else", () => {
    getAllInstances().clear();
    getAnvilState(LEGACY_KEY).config = config(8545, 31337);
    getAnvilState("proj_x").config = config(8600, 56);

    const target = resolveActiveProject("proj_x");
    assert.equal(target.port, 8600);
    assert.equal(target.chainId, 56);
    assert.equal(target.source, "explicit");
});

test("a live in-process instance beats the database", () => {
    getAllInstances().clear();
    const state = getAnvilState("proj_live");
    state.config = config(8700, 137);
    // Only the fields resolveActiveProject inspects need to look like a process.
    state.proc = { killed: false } as unknown as NonNullable<typeof state.proc>;

    const target = resolveActiveProject(undefined, { listProcesses: () => [] });
    assert.equal(target.port, 8700);
    assert.equal(target.projectId, "proj_live");
    assert.equal(target.source, "instance");
    state.proc = null;
});

/** No anvil listening — the machine running the tests must not change the outcome. */
const noProcesses = { listProcesses: () => [] };

test("a listening anvil beats a stale project row", () => {
    getAllInstances().clear();
    const project = createProject({ name: "stale", chainId: 1, port: 8801 });
    updateProjectStatus(project.id, "running");
    invalidateActiveProjectCache();

    const target = resolveActiveProject(undefined, {
        listProcesses: () => [ { port: 9545, projectId: null, managed: false } ],
    });

    // The row claims a node; the process list proves one. The proof wins.
    assert.equal(target.port, 9545);
    assert.equal(target.source, "discovered");

    // Leave no running row behind for the next test.
    updateProjectStatus(project.id, "stopped");
    invalidateActiveProjectCache();
});

test("a project row marked running is used when no process handle survived a reload", () => {
    getAllInstances().clear();
    const project = createProject({ name: "reloaded", chainId: 8453, port: 8900 });
    updateProjectStatus(project.id, "running");
    invalidateActiveProjectCache();

    const target = resolveActiveProject(undefined, noProcesses);
    assert.equal(target.port, 8900);
    assert.equal(target.chainId, 8453);
    assert.equal(target.projectId, project.id);
    assert.equal(target.source, "database");
});

test("resolveFromRequest honours the query param and the header", () => {
    getAllInstances().clear();
    getAnvilState("proj_q").config = config(9100, 10);
    getAnvilState("proj_h").config = config(9200, 42161);

    assert.equal(
        resolveFromRequest(new Request("http://localhost/api/rpc?projectId=proj_q")).port,
        9100
    );
    assert.equal(
        resolveFromRequest(
            new Request("http://localhost/api/rpc", { headers: { "x-project-id": "proj_h" } })
        ).port,
        9200
    );
});
