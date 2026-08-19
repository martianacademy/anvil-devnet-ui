import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The DB module reads DEVNET_DB_PATH at first use — point it at a scratch file
// before anything imports it.
const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "devnet-test-")), "test.db");
process.env.DEVNET_DB_PATH = dbFile;

const { getDB, closeDB, scopeId, NO_PROJECT } = await import("../lib/db.ts");
const { insertBlocksAndTxs, getRecentBlocks, getRecentTxs, countTxs, getTxByHash } = await import("../lib/txStore.ts");

const block = (number: number, projectId: string | null) => ({
    chain_id: 31337,
    number,
    hash: `0xblock${number}${projectId ?? "default"}`,
    timestamp: 1700 + number,
    tx_count: 1,
    gas_used: "0x5208",
    gas_limit: "0x1c9c380",
    project_id: projectId,
});

const tx = (hash: string, projectId: string | null) => ({
    hash,
    chain_id: 31337,
    block_number: 1,
    block_timestamp: 1700,
    from_address: "0xfrom",
    to_address: "0xto",
    value: "0x0",
    input: "0x",
    gas: "0x5208",
    gas_used: "0x5208",
    gas_price: "0x1",
    nonce: 0,
    status: 1,
    revert_reason: null,
    decoded_function: null,
    decoded_params: null,
    project_id: projectId,
});

before(() => { getDB(); });
after(() => {
    closeDB();
    fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
});

test("migration creates every table the app queries", () => {
    const names = getDB()
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all<{ name: string }>()
        .map((r) => r.name);

    for (const table of [
        "projects", "blocks", "transactions", "contracts", "tx_traces",
        "snapshots", "token_watchlist", "chain_profiles", "patch_history", "patch_scripts",
    ]) {
        assert.ok(names.includes(table), `missing table: ${table}`);
    }
});

test("blocks are keyed by (chain_id, project_id, number)", () => {
    // Same chain id, same height, two different projects — both rows must survive.
    insertBlocksAndTxs([block(1, "proj_a"), block(1, "proj_b")], []);

    assert.equal(getRecentBlocks(31337, 10, 0, "proj_a").length, 1);
    assert.equal(getRecentBlocks(31337, 10, 0, "proj_b").length, 1);
    assert.notEqual(
        getRecentBlocks(31337, 10, 0, "proj_a")[0].hash,
        getRecentBlocks(31337, 10, 0, "proj_b")[0].hash
    );
});

test("null project id is stored as the sentinel, not NULL", () => {
    insertBlocksAndTxs([block(2, null)], []);
    const row = getDB()
        .prepare("SELECT project_id FROM blocks WHERE number = 2")
        .get<{ project_id: string }>();
    assert.equal(row?.project_id, NO_PROJECT);
    assert.equal(scopeId(null), NO_PROJECT);
    assert.equal(getRecentBlocks(31337, 10, 0, null).length, 1);
});

test("transactions are scoped per project and counted per scope", () => {
    insertBlocksAndTxs([], [tx("0xaaa", "proj_a"), tx("0xbbb", "proj_b"), tx("0xccc", null)]);

    assert.equal(countTxs(31337, "proj_a"), 1);
    assert.equal(countTxs(31337, "proj_b"), 1);
    assert.equal(countTxs(31337, null), 1);
    assert.equal(getRecentTxs(31337, 10, "proj_a")[0].hash, "0xaaa");
});

test("getTxByHash is case-insensitive and scope-independent", () => {
    assert.equal(getTxByHash("0xAAA")?.hash, "0xaaa");
    assert.equal(getTxByHash("0xnope"), null);
});

test("batch insert is atomic — a bad row rolls the whole batch back", () => {
    const before = countTxs(31337, "proj_a");
    assert.throws(() => {
        insertBlocksAndTxs(
            [block(9, "proj_a")],
            // An object is not a bindable SQLite value, so the second row throws
            // mid-transaction and everything before it must be rolled back.
            [tx("0xddd", "proj_a"), { ...tx("0xeee", "proj_a"), nonce: {} as unknown as number }]
        );
    });
    assert.equal(countTxs(31337, "proj_a"), before, "no partial writes");
    assert.equal(getRecentBlocks(31337, 50, 0, "proj_a").some((b) => b.number === 9), false);
});
