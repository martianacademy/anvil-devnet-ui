import { test } from "node:test";
import assert from "node:assert/strict";
import {
    formatEth,
    formatGwei,
    formatNumber,
    formatTokenAmount,
    gasUsedPercent,
    hexToInt,
    timeAgo,
    truncateHex,
} from "../lib/format.ts";

test("truncateHex abbreviates long hex and passes short values through", () => {
    assert.equal(truncateHex("0x1234567890abcdef1234567890abcdef12345678"), "0x1234…5678");
    assert.equal(truncateHex("0x1234"), "0x1234");
    assert.equal(truncateHex(null), "—");
});

test("formatEth trims trailing zeros and keeps precision", () => {
    assert.equal(formatEth("0xde0b6b3a7640000"), "1");
    assert.equal(formatEth(1500000000000000000n), "1.5");
    assert.equal(formatEth("0"), "0");
    // Dust below the display precision must not render as a flat "0".
    assert.equal(formatEth(1n, 9), "<0.000000001");
});

test("formatTokenAmount honours token decimals", () => {
    assert.equal(formatTokenAmount("1000000", 6), "1");
    assert.equal(formatTokenAmount("1234567", 6), "1.234567");
    assert.equal(formatTokenAmount("1000123456789000000000", 18), "1,000.123456");
});

test("formatNumber accepts hex and decimal", () => {
    assert.equal(formatNumber("0x5208"), "21,000");
    assert.equal(formatNumber(1234), "1,234");
    assert.equal(formatNumber(null), "—");
});

test("formatGwei converts wei to gwei", () => {
    assert.equal(formatGwei("0x3b9aca00"), "1.00 Gwei");
    assert.equal(formatGwei(null), "—");
});

test("hexToInt falls back on garbage", () => {
    assert.equal(hexToInt("0x10"), 16);
    assert.equal(hexToInt("42"), 42);
    assert.equal(hexToInt(undefined, -1), -1);
});

test("gasUsedPercent needs both values", () => {
    assert.equal(gasUsedPercent("0x5208", "0x1c9c380"), 21000 / 30000000 * 100);
    assert.equal(gasUsedPercent(null, "0x1"), null);
    assert.equal(gasUsedPercent("0x1", null), null);
});

test("timeAgo buckets by magnitude", () => {
    const now = Math.floor(Date.now() / 1000);
    assert.equal(timeAgo(now), "just now");
    assert.equal(timeAgo(now - 30), "30s ago");
    assert.equal(timeAgo(now - 600), "10m ago");
    assert.equal(timeAgo(now - 7200), "2h ago");
    assert.equal(timeAgo(now - 172800), "2d ago");
});
