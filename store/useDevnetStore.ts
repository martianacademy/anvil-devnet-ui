"use client";

import { create } from "zustand";
import type { AnvilConfig } from "@/lib/anvilProcess";
import type { EvmStep, CallNode } from "@/lib/traceParser";

export type NodeStatus = "stopped" | "starting" | "running" | "error";

export interface TxSummary {
    hash: string;
    block_number: number;
    block_timestamp: number;
    from_address: string;
    to_address: string | null;
    value: string;
    gas_used: string | null;
    status: number;
    decoded_function: string | null;
    input: string | null;
}

export interface ContractInfo {
    address: string;
    name: string;
    abi: unknown[];
}

interface DevnetStore {
    // Node state
    nodeStatus: NodeStatus;
    nodeConfig: Partial<AnvilConfig>;
    latestBlock: number;
    chainId: number;
    port: number;

    // Block/tx data
    transactions: TxSummary[];

    // Debugger state
    selectedTx: string | null;
    traceSteps: EvmStep[];
    currentStep: number;
    callTree: CallNode | null;

    // ABI registry (in-memory cache)
    contracts: Record<string, ContractInfo>;

    // Actions
    setNodeStatus: (s: NodeStatus) => void;
    setNodeConfig: (c: Partial<AnvilConfig>) => void;
    setLatestBlock: (n: number) => void;
    setChainId: (id: number) => void;
    setPort: (p: number) => void;
    addTransactions: (txs: TxSummary[]) => void;
    clearTransactions: () => void;
    selectTx: (hash: string) => void;
    setTraceSteps: (steps: EvmStep[]) => void;
    setCurrentStep: (n: number) => void;
    setCallTree: (tree: CallNode | null) => void;
    registerContract: (address: string, name: string, abi: unknown[]) => void;
}

export const useDevnetStore = create<DevnetStore>((set) => ({
    nodeStatus: "stopped",
    nodeConfig: {
        chainId: 31337,
        port: 8545,
        blockTime: 2,
        accounts: 10,
        balance: 10000,
        baseFee: 0,
        stepsTracing: true,
        persistState: true,
        stateFile: "/tmp/anvil-devnet-state.json",
    },
    latestBlock: 0,
    chainId: 31337,
    port: 8545,
    transactions: [],
    selectedTx: null,
    traceSteps: [],
    currentStep: 0,
    callTree: null,
    contracts: {},

    setNodeStatus: (s) => set({ nodeStatus: s }),
    setNodeConfig: (c) => set((state) => ({ nodeConfig: { ...state.nodeConfig, ...c } })),
    setLatestBlock: (n) => set({ latestBlock: n }),
    setChainId: (id) =>
        set((state) =>
            id !== state.chainId
                ? { chainId: id, transactions: [], latestBlock: 0 }
                : { chainId: id }
        ),
    setPort: (p) => set({ port: p }),
    addTransactions: (txs) =>
        set((state) => {
            const existing = new Set(state.transactions.map((t) => t.hash));
            const newTxs = txs.filter((t) => !existing.has(t.hash));
            return {
                transactions: [...newTxs, ...state.transactions].slice(0, 500),
            };
        }),
    clearTransactions: () => set({ transactions: [] }),
    selectTx: (hash) => set({ selectedTx: hash }),
    setTraceSteps: (steps) => set({ traceSteps: steps, currentStep: 0 }),
    setCurrentStep: (n) => set({ currentStep: n }),
    setCallTree: (tree) => set({ callTree: tree }),
    registerContract: (address, name, abi) =>
        set((state) => ({
            contracts: {
                ...state.contracts,
                [address.toLowerCase()]: { address, name, abi },
            },
        })),
}));
