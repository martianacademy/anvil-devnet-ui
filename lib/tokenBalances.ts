import { rpc } from "./rpc";
import { keccak256, pad, toHex, type Hex } from "viem";

export interface TokenWatch {
    id: number;
    token_address: string;
    wallet_address: string;
    token_name?: string;
    token_symbol?: string;
    token_decimals: number;
    token_type: "ERC20" | "ERC721";
}

export interface TokenBalance {
    token_address: string;
    wallet_address: string;
    balance: string;
    token_type: "ERC20" | "ERC721";
}

const ERC20_BALANCE_ABI = [{
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
}] as const;

export async function fetchTokenBalance(
    tokenAddress: string,
    walletAddress: string,
    port = 8545
): Promise<string> {
    try {
        // ABI encode: balanceOf(address) = keccak256 selector + padded address
        const selector = "0x70a08231"; // balanceOf(address)
        const paddedAddr = walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");
        const data = selector + paddedAddr;

        const result = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_call",
                params: [{ to: tokenAddress, data }, "latest"],
                id: 1,
            }),
        }).then((r) => r.json());

        if (result.result && result.result !== "0x") {
            return BigInt(result.result).toString();
        }
        return "0";
    } catch {
        return "0";
    }
}

export async function fetchAllWatchedBalances(
    watchlist: TokenWatch[],
    port = 8545
): Promise<TokenBalance[]> {
    const results = await Promise.all(
        watchlist.map(async (w) => ({
            token_address: w.token_address,
            wallet_address: w.wallet_address,
            balance: await fetchTokenBalance(w.token_address, w.wallet_address, port),
            token_type: w.token_type,
        }))
    );
    return results;
}

export async function detectBalanceSlot(
    tokenAddress: string,
    walletAddress: string,
    port = 8545
): Promise<number> {
    const MAX_SLOT = 20;
    const testAmount = BigInt("1000000000000000000"); // 1 token
    const paddedAddr = walletAddress.toLowerCase().replace("0x", "").padStart(64, "0");

    // Take snapshot so we can revert after probing
    const snapRes = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "evm_snapshot", params: [], id: 1 }),
    }).then((r) => r.json());
    const snapshotId = snapRes.result;

    try {
        for (let slot = 0; slot <= MAX_SLOT; slot++) {
            const slotHex = slot.toString(16).padStart(64, "0");

            // Two storage layouts to try:
            // Solidity: keccak256(address ++ slot)
            // Vyper:    keccak256(slot ++ address)
            const keys = [
                keccak256(`0x${paddedAddr}${slotHex}` as Hex),
                keccak256(`0x${slotHex}${paddedAddr}` as Hex),
            ];

            for (const storageKey of keys) {
                await fetch(`http://127.0.0.1:${port}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "anvil_setStorageAt",
                        params: [tokenAddress, storageKey, `0x${testAmount.toString(16).padStart(64, "0")}`],
                        id: 1,
                    }),
                });

                const bal = await fetchTokenBalance(tokenAddress, walletAddress, port);
                if (BigInt(bal) === testAmount) {
                    // Revert snapshot to undo test writes
                    await fetch(`http://127.0.0.1:${port}`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ jsonrpc: "2.0", method: "evm_revert", params: [snapshotId], id: 1 }),
                    });
                    return slot;
                }

                // Reset this key before trying next
                await fetch(`http://127.0.0.1:${port}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        method: "anvil_setStorageAt",
                        params: [tokenAddress, storageKey, `0x${"0".padStart(64, "0")}`],
                        id: 1,
                    }),
                });
            }
        }
    } finally {
        // Always revert to clean state even if we didn't find the slot
        await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "evm_revert", params: [snapshotId], id: 1 }),
        });
    }

    throw new Error(`Could not auto-detect balance slot (tried slots 0-${MAX_SLOT}, both Solidity & Vyper layouts)`);
}

/**
 * Check if a contract exists at the given address.
 * Returns true if there is non-empty code.
 */
async function hasCode(address: string, port: number): Promise<boolean> {
    const res = await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "eth_getCode",
            params: [address, "latest"],
            id: 1,
        }),
    }).then((r) => r.json());
    const code = res.result ?? "0x";
    return code !== "0x" && code !== "0x0";
}

// Compiled runtime bytecode of a minimal ERC20 (Solidity 0.8.28, optimized).
// Storage layout: slot 0 = balances mapping, slot 1 = allowances mapping,
// slot 2 = totalSupply. Supports: balanceOf, transfer, transferFrom,
// approve, allowance, totalSupply, name ("Mock Token"), symbol ("MOCK"), decimals (18).
const MINIMAL_ERC20_BYTECODE =
    "0x608060405234801561000f575f5ffd5b5060043610610090575f3560e01c8063313ce56711610063578063313ce567146100ff57806370a082311461011e57806395d89b411461013d578063a9059cbb14610145578063dd62ed3e14610158575f5ffd5b806306fdde0314610094578063095ea7b3146100b257806318160ddd146100d557806323b872dd146100ec575b5f5ffd5b61009c610182565b6040516100a99190610503565b60405180910390f35b6100c56100c0366004610553565b61020e565b60405190151581526020016100a9565b6100de60025481565b6040519081526020016100a9565b6100c56100fa36600461057b565b61027a565b60055461010c9060ff1681565b60405160ff90911681526020016100a9565b6100de61012c3660046105b5565b5f6020819052908152604090205481565b61009c61041d565b6100c5610153366004610553565b61042a565b6100de6101663660046105d5565b600160209081525f928352604080842090915290825290205481565b6003805461018f90610606565b80601f01602080910402602001604051908101604052809291908181526020018280546101bb90610606565b80156102065780601f106101dd57610100808354040283529160200191610206565b820191905f5260205f20905b8154815290600101906020018083116101e957829003601f168201915b505050505081565b335f8181526001602090815260408083206001600160a01b038716808552925280832085905551919290917f8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925906102689086815260200190565b60405180910390a35060015b92915050565b6001600160a01b0383165f908152602081905260408120548211156102d55760405162461bcd60e51b815260206004820152600c60248201526b1a5b9cdd59999a58da595b9d60a21b60448201526064015b60405180910390fd5b6001600160a01b0384165f9081526001602090815260408083203384529091529020548211156103355760405162461bcd60e51b815260206004820152600b60248201526a1b9bdd08185b1b1bddd95960aa1b60448201526064016102cc565b6001600160a01b0384165f90815260016020908152604080832033845290915281208054849290610367908490610652565b90915550506001600160a01b0384165f9081526020819052604081208054849290610393908490610652565b90915550506001600160a01b0383165f90815260208190526040812080548492906103bf908490610665565b92505081905550826001600160a01b0316846001600160a01b03167fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef8460405161040b91815260200190565b60405180910390a35060019392505050565b6004805461018f90610606565b335f908152602081905260408120548211156104775760405162461bcd60e51b815260206004820152600c60248201526b1a5b9cdd59999a58da595b9d60a21b60448201526064016102cc565b335f9081526020819052604081208054849290610495908490610652565b90915550506001600160a01b0383165f90815260208190526040812080548492906104c1908490610665565b90915550506040518281526001600160a01b0384169033907fddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef90602001610268565b602081525f82518060208401528060208501604085015e5f604082850101526040601f19601f83011684010191505092915050565b80356001600160a01b038116811461054e575f5ffd5b919050565b5f5f60408385031215610564575f5ffd5b61056d83610538565b946020939093013593505050565b5f5f5f6060848603121561058d575f5ffd5b61059684610538565b92506105a460208501610538565b929592945050506040919091013590565b5f602082840312156105c5575f5ffd5b6105ce82610538565b9392505050565b5f5f604083850312156105e6575f5ffd5b6105ef83610538565b91506105fd60208401610538565b90509250929050565b600181811c9082168061061a57607f821691505b60208210810361063857634e487b7160e01b5f52602260045260245ffd5b50919050565b634e487b7160e01b5f52601160045260245ffd5b818103818111156102745761027461063e565b808201808211156102745761027461063e56fea2646970667358221220f68e5917498be4d1b4641bcc844be3a0fa4b0a5ef815ccdb27f3fa852b20a5bd64736f6c634300081c0033";

/**
 * Ensure a working ERC20 contract exists at tokenAddress.
 * If no code exists OR the existing code can't handle balanceOf, inject our bytecode.
 * Returns true if we deployed/replaced the contract (slot 0 is guaranteed).
 */
async function ensureContractExists(tokenAddress: string, port: number): Promise<boolean> {
    const codeExists = await hasCode(tokenAddress, port);

    if (codeExists) {
        // Test if balanceOf actually works on the existing code
        const testAddr = "0000000000000000000000000000000000000000000000000000000000000001";
        const testRes = await fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "eth_call",
                params: [{ to: tokenAddress, data: `0x70a08231${testAddr}` }, "latest"],
                id: 1,
            }),
        }).then((r) => r.json());

        // If balanceOf works (no error), the existing contract is fine
        if (!testRes.error) return false;
    }

    // Inject our minimal ERC20 (either no code or broken code)
    const setStorage = (slot: string, value: string) =>
        fetch(`http://127.0.0.1:${port}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "anvil_setStorageAt",
                params: [tokenAddress, slot, value],
                id: 1,
            }),
        });

    await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "anvil_setCode",
            params: [tokenAddress, MINIMAL_ERC20_BYTECODE],
            id: 1,
        }),
    }).then((r) => r.json());

    // Initialize metadata storage (constructor doesn't run with anvil_setCode)
    // Solidity short string: rightpad(utf8) | (length * 2) in last byte
    // Slot 3 = name ("Mock Token", 10 bytes → 0x14 length encoding)
    const nameHex = "4d6f636b20546f6b656e" + "00".repeat(21) + "14"; // "Mock Token" + padding + len*2
    // Slot 4 = symbol ("MOCK", 4 bytes → 0x08 length encoding)
    const symbolHex = "4d4f434b" + "00".repeat(27) + "08"; // "MOCK" + padding + len*2
    // Slot 5 = decimals (18 = 0x12)
    const decimalsHex = "12".padStart(64, "0");

    await Promise.all([
        setStorage("0x" + "3".padStart(64, "0"), "0x" + nameHex),
        setStorage("0x" + "4".padStart(64, "0"), "0x" + symbolHex),
        setStorage("0x" + "5".padStart(64, "0"), "0x" + decimalsHex),
    ]);

    return true; // we deployed it, balance slot is 0
}

export async function setTokenBalance(
    tokenAddress: string,
    walletAddress: string,
    amount: bigint,
    port = 8545,
    mappingSlot?: number
): Promise<void> {
    // Auto-deploy minimal ERC20 if no contract exists (local chain)
    const wasDeployed = await ensureContractExists(tokenAddress, port);

    // Determine storage slot:
    // 1. Use explicit mappingSlot if provided
    // 2. If we just deployed the contract, use slot 0 (our known layout)
    // 3. Try auto-detection (works for forked mainnet contracts)
    // 4. Fall back to slot 0 (handles injected/non-standard bytecode)
    let slot = mappingSlot ?? 0;
    if (mappingSlot === undefined && !wasDeployed) {
        try {
            slot = await detectBalanceSlot(tokenAddress, walletAddress, port);
        } catch {
            slot = 0; // fallback for injected or non-standard contracts
        }
    }

    const storageKey = keccak256(
        `0x${walletAddress.toLowerCase().replace("0x", "").padStart(64, "0")}${slot.toString(16).padStart(64, "0")}` as Hex
    );

    await fetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            method: "anvil_setStorageAt",
            params: [tokenAddress, storageKey, `0x${amount.toString(16).padStart(64, "0")}`],
            id: 1,
        }),
    }).then((r) => r.json());
}

