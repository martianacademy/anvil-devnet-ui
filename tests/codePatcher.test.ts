import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeAbiParameters, parseAbiParameters } from "viem";

const { erc20CreationBytecode } = await import("../lib/codePatcher.ts");
const { MOCK_ERC20_CREATION_BYTECODE } = await import("../lib/mockErc20.ts");

const HOLDER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ARGS = parseAbiParameters("string, string, uint8, uint256, address");

test("erc20CreationBytecode appends constructor arguments to the template", () => {
    const bytecode = erc20CreationBytecode({
        name: "Tether USD",
        symbol: "USDT",
        decimals: 18,
        totalSupply: 10n ** 24n,
        holder: HOLDER,
    });

    assert.ok(bytecode.startsWith(MOCK_ERC20_CREATION_BYTECODE));

    const encoded = `0x${bytecode.slice(MOCK_ERC20_CREATION_BYTECODE.length)}` as `0x${string}`;
    const [ name, symbol, decimals, supply, holder ] = decodeAbiParameters(ARGS, encoded);
    assert.equal(name, "Tether USD");
    assert.equal(symbol, "USDT");
    assert.equal(decimals, 18);
    assert.equal(supply, 10n ** 24n);
    assert.equal(holder.toLowerCase(), HOLDER.toLowerCase());
});

test("erc20CreationBytecode survives names longer than a storage word", () => {
    // Solidity switches string layout above 31 bytes; the constructor handles it,
    // which is the whole reason code is installed by simulating a deployment.
    const longName = "A token with a deliberately very long display name";
    const bytecode = erc20CreationBytecode({
        name: longName,
        symbol: "LONG",
        decimals: 6,
        totalSupply: 0n,
        holder: HOLDER,
    });
    const encoded = `0x${bytecode.slice(MOCK_ERC20_CREATION_BYTECODE.length)}` as `0x${string}`;
    assert.equal(decodeAbiParameters(ARGS, encoded)[0], longName);
});
