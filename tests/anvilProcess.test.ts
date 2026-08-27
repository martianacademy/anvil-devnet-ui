import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { LEGACY_KEY, buildAnvilArgs, logPathFor, stateFilePath, type AnvilConfig } from "../lib/anvilProcess.ts";

const base: AnvilConfig = {
    chainId: 31337,
    port: 8545,
    blockTime: 2,
    accounts: 10,
    balance: 10000,
    baseFee: 0,
    stepsTracing: true,
    persistState: false,
    stateInterval: 30,
    stateFile: "",
};

function argValue(args: string[], flag: string): string | undefined {
    const i = args.indexOf(flag);
    return i === -1 ? undefined : args[i + 1];
}

test("base args carry the chain config through to the CLI", () => {
    const args = buildAnvilArgs(base, "/tmp/state.json");
    assert.equal(argValue(args, "--chain-id"), "31337");
    assert.equal(argValue(args, "--port"), "8545");
    assert.equal(argValue(args, "--accounts"), "10");
    assert.equal(argValue(args, "--balance"), "10000");
    assert.equal(argValue(args, "--block-time"), "2");
    assert.ok(args.includes("--steps-tracing"));
});

test("block time 0 omits --block-time (anvil rejects 0 and mines on demand)", () => {
    const args = buildAnvilArgs({ ...base, blockTime: 0 }, "/tmp/state.json");
    assert.ok(!args.includes("--block-time"));
});

test("steps tracing can be turned off", () => {
    const args = buildAnvilArgs({ ...base, stepsTracing: false }, "/tmp/state.json");
    assert.ok(!args.includes("--steps-tracing"));
});

test("fork settings add the fork flags and pin the block", () => {
    const args = buildAnvilArgs(
        { ...base, forkUrl: "https://rpc.example", forkBlockNumber: 1234 },
        "/tmp/state.json"
    );
    assert.equal(argValue(args, "--fork-url"), "https://rpc.example");
    assert.equal(argValue(args, "--fork-block-number"), "1234");
    assert.ok(args.includes("--no-storage-caching"));
});

test("persistState only persists when asked", () => {
    assert.ok(!buildAnvilArgs(base, "/tmp/state.json").includes("--state"));
    assert.equal(
        argValue(buildAnvilArgs({ ...base, persistState: true }, "/tmp/state.json"), "--state"),
        "/tmp/state.json"
    );
});

test("state is dumped on an interval, not only at exit", () => {
    // --dump-state writes on a clean exit and nowhere else, so a node that is
    // killed or whose container is recreated loses everything since it started.
    const args = buildAnvilArgs({ ...base, persistState: true }, "/tmp/state.json");
    assert.equal(argValue(args, "--state-interval"), "30");
    assert.ok(!args.includes("--dump-state"), "--state already implies load and dump");
});

test("a zero interval leaves the dump to a clean exit", () => {
    const args = buildAnvilArgs({ ...base, persistState: true, stateInterval: 0 }, "/tmp/state.json");
    assert.ok(!args.includes("--state-interval"));
    assert.equal(argValue(args, "--state"), "/tmp/state.json");
});

test("no-mining is passed through", () => {
    assert.ok(buildAnvilArgs({ ...base, noMining: true }, "/tmp/s.json").includes("--no-mining"));
});

test("state files and logs live under the OS temp dir, scoped per project", () => {
    const projectState = stateFilePath("proj_1", 31337, false);
    const legacyState = stateFilePath(LEGACY_KEY, 56, true);

    assert.ok(projectState.startsWith(path.join(os.tmpdir(), "anvil-devnet-ui")));
    assert.ok(projectState.includes("proj_1"));
    // The legacy (project-less) node is keyed by chain, and forks get their own file.
    assert.ok(legacyState.includes("chain-56"));
    assert.ok(legacyState.includes("-fork"));
    assert.notEqual(projectState, stateFilePath("proj_2", 31337, false));
    assert.ok(logPathFor("proj_1").endsWith("anvil-proj_1.log"));
});
