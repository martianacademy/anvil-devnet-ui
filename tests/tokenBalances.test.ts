import { test } from "node:test";
import assert from "node:assert/strict";
import { keccak256 } from "viem";
import { solidityMappingKey, vyperMappingKey } from "../lib/tokenBalances.ts";

const HOLDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

test("solidityMappingKey matches keccak256(pad(holder) ++ pad(slot))", () => {
    const expected = keccak256(
        `0x${HOLDER.slice(2).toLowerCase().padStart(64, "0")}${(0).toString(16).padStart(64, "0")}`
    );
    assert.equal(solidityMappingKey(HOLDER, 0), expected);
});

test("vyperMappingKey reverses the concatenation order", () => {
    const expected = keccak256(
        `0x${(3).toString(16).padStart(64, "0")}${HOLDER.slice(2).toLowerCase().padStart(64, "0")}`
    );
    assert.equal(vyperMappingKey(HOLDER, 3), expected);
    assert.notEqual(vyperMappingKey(HOLDER, 3), solidityMappingKey(HOLDER, 3));
});

test("different slots produce different storage keys", () => {
    assert.notEqual(solidityMappingKey(HOLDER, 0), solidityMappingKey(HOLDER, 1));
});

test("holder casing does not change the key", () => {
    assert.equal(solidityMappingKey(HOLDER, 2), solidityMappingKey(HOLDER.toLowerCase(), 2));
});
