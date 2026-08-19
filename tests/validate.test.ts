import { test } from "node:test";
import assert from "node:assert/strict";
import {
    ValidationError,
    assertAddress,
    assertAmount,
    assertHex,
    assertHttpUrl,
    assertInt,
    assertNonEmptyString,
    assertSlot,
    assertTxHash,
    clampInt,
} from "../lib/validate.ts";

const rejects = (fn: () => unknown) => assert.throws(fn, ValidationError);

test("assertAddress normalises case and rejects malformed input", () => {
    assert.equal(
        assertAddress("0xF39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
        "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"
    );
    rejects(() => assertAddress("0x123"));
    rejects(() => assertAddress("f39fd6e51aad88f6f4ce6ab8827279cfffb92266"));
    rejects(() => assertAddress(null));
});

test("assertTxHash requires 32 bytes", () => {
    const hash = `0x${"a".repeat(64)}`;
    assert.equal(assertTxHash(hash), hash);
    rejects(() => assertTxHash("0xdead"));
});

test("assertHex accepts any 0x string, rejects the rest", () => {
    assert.equal(assertHex("0x"), "0x");
    assert.equal(assertHex("0xAB12"), "0xAB12");
    rejects(() => assertHex("nope"));
    rejects(() => assertHex("0xzz"));
});

test("assertSlot accepts hex, decimal strings and numbers", () => {
    assert.equal(assertSlot("0x1f"), "0x1f");
    assert.equal(assertSlot("31"), "0x1f");
    assert.equal(assertSlot(31), "0x1f");
    rejects(() => assertSlot("slot-one"));
    rejects(() => assertSlot(""));
});

test("assertAmount only allows positive decimals", () => {
    assert.equal(assertAmount("1.25"), "1.25");
    assert.equal(assertAmount(10), "10");
    rejects(() => assertAmount("-1"));
    rejects(() => assertAmount("1e18"));
    rejects(() => assertAmount("abc"));
});

test("assertInt enforces range and integrality", () => {
    assert.equal(assertInt("8545", "port", 1024, 65535), 8545);
    rejects(() => assertInt(80, "port", 1024, 65535));
    rejects(() => assertInt(1.5, "port", 0, 10));
});

test("assertHttpUrl blocks non-http schemes", () => {
    assert.equal(assertHttpUrl("https://rpc.example/eth"), "https://rpc.example/eth");
    rejects(() => assertHttpUrl("file:///etc/passwd"));
    rejects(() => assertHttpUrl("ws://localhost:8545"));
    rejects(() => assertHttpUrl("not a url"));
});

test("assertNonEmptyString trims and enforces a max length", () => {
    assert.equal(assertNonEmptyString("  hello  ", "name"), "hello");
    rejects(() => assertNonEmptyString("   ", "name"));
    rejects(() => assertNonEmptyString("x".repeat(20), "name", 10));
});

test("clampInt keeps query params inside bounds", () => {
    assert.equal(clampInt("50", 10, 1, 100), 50);
    assert.equal(clampInt("5000", 10, 1, 100), 100);
    assert.equal(clampInt("-3", 10, 1, 100), 1);
    assert.equal(clampInt(null, 10, 1, 100), 10);
    assert.equal(clampInt("abc", 10, 1, 100), 10);
});
