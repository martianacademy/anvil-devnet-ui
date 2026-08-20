import { test } from "node:test";
import assert from "node:assert/strict";

const { inferBlockTime, roundToEther } = await import("../lib/nodeObserver.ts");

test("inferBlockTime reads a fixed interval off evenly spaced blocks", () => {
    assert.equal(inferBlockTime([1000, 998, 996, 994]), 2);
    assert.equal(inferBlockTime([1012, 1000]), 12);
});

test("inferBlockTime gives up when the node mines on demand", () => {
    // Irregular gaps mean transactions drove the mining, not a timer.
    assert.equal(inferBlockTime([1050, 1049, 1002, 1000]), null);
    // A single block carries no interval at all.
    assert.equal(inferBlockTime([1000]), null);
    assert.equal(inferBlockTime([]), null);
});

test("inferBlockTime rejects non-advancing timestamps", () => {
    // Anvil can stamp several blocks in the same second; that is not an interval.
    assert.equal(inferBlockTime([1000, 1000, 1000]), null);
});

test("roundToEther ignores the gas an account has already burnt", () => {
    const tenThousand = 10_000n * 10n ** 18n;
    assert.equal(roundToEther(`0x${tenThousand.toString(16)}`), 10_000);
    // 9999.9998 ETH — still an account that started with 10000.
    assert.equal(roundToEther(`0x${(tenThousand - 2n * 10n ** 14n).toString(16)}`), 10_000);
    assert.equal(roundToEther("0x0"), 0);
});

test("roundToEther keeps genuinely different balances apart", () => {
    assert.equal(roundToEther(`0x${(1234n * 10n ** 18n).toString(16)}`), 1234);
});
