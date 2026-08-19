import { test } from "node:test";
import assert from "node:assert/strict";
import { hexToNumber, safeStringify, toBlockRecord, toTxRecord } from "../lib/indexer.ts";

const scope = { chainId: 31337, projectId: null };

test("hexToNumber parses hex, decimal and garbage", () => {
    assert.equal(hexToNumber("0x10"), 16);
    assert.equal(hexToNumber("32"), 32);
    assert.equal(hexToNumber(undefined, 7), 7);
    assert.equal(hexToNumber(null, -1), -1);
});

test("toBlockRecord maps an RPC block onto the row shape", () => {
    const record = toBlockRecord(
        {
            hash: "0xabc",
            timestamp: "0x64",
            gasUsed: "0x5208",
            gasLimit: "0x1c9c380",
            transactions: [{ hash: "0x1", from: "0xa" }, { hash: "0x2", from: "0xb" }],
        },
        12,
        scope
    );

    assert.deepEqual(record, {
        chain_id: 31337,
        number: 12,
        hash: "0xabc",
        timestamp: 100,
        tx_count: 2,
        gas_used: "0x5208",
        gas_limit: "0x1c9c380",
        project_id: null,
    });
});

test("toTxRecord defaults missing fields and reads status from the receipt", () => {
    const record = toTxRecord(
        { hash: "0xdead", from: "0xfrom", to: "0xto", nonce: "0x3" },
        9,
        1700,
        { gasUsed: "0x5208", status: "0x0" },
        scope
    );

    assert.equal(record.value, "0x0");
    assert.equal(record.nonce, 3);
    assert.equal(record.status, 0, "a 0x0 receipt status means the tx reverted");
    assert.equal(record.gas_used, "0x5208");
    assert.equal(record.block_timestamp, 1700);
});

test("toTxRecord treats a missing receipt as success (still pending in the block)", () => {
    const record = toTxRecord({ hash: "0x1", from: "0xa" }, 1, 1, null, scope);
    assert.equal(record.status, 1);
    assert.equal(record.gas_used, null);
    assert.equal(record.to_address, null);
});

test("safeStringify survives bigint args that JSON.stringify rejects", () => {
    assert.equal(safeStringify({ amount: 10n }), '{"amount":"10"}');
    assert.equal(safeStringify({ a: 1 }), '{"a":1}');
});
