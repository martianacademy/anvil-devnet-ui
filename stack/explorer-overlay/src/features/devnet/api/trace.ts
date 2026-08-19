// SPDX-License-Identifier: LicenseRef-Blockscout

/** Types + helpers for the raw debug_traceTransaction payload served by the control API. */

export interface EvmStep {
  pc: number;
  op: string;
  gas: number;
  gasCost: number;
  depth: number;
  stack: Array<string>;
  memory: Array<string>;
  storage: Record<string, string>;
}

export interface CallNode {
  type: string;
  from: string;
  to?: string;
  input?: string;
  output?: string;
  gas?: string;
  gasUsed?: string;
  value?: string;
  error?: string;
  calls?: Array<CallNode>;
}

export interface StorageWrite {
  step: number;
  depth: number;
  slot: string;
  before: string;
  after: string;
}

export interface TraceResponse {
  structLogs: Array<Record<string, unknown>>;
  callTrace: CallNode | null;
  traceError: string | null;
  cached?: boolean;
}

export function parseStructLogs(raw: Array<Record<string, unknown>> | undefined): Array<EvmStep> {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((step) => ({
    pc: Number(step.pc ?? 0),
    op: String(step.op ?? ''),
    gas: Number(step.gas ?? 0),
    gasCost: Number(step.gasCost ?? 0),
    depth: Number(step.depth ?? 1),
    stack: (step.stack as Array<string>) ?? [],
    memory: (step.memory as Array<string>) ?? [],
    storage: (step.storage as Record<string, string>) ?? {},
  }));
}

/**
 * Every SSTORE in execution order, with the value the slot held beforehand.
 * The stack layout for SSTORE is [… value, slot] with `slot` on top.
 */
export function extractStorageWrites(steps: Array<EvmStep>): Array<StorageWrite> {
  const writes: Array<StorageWrite> = [];
  const lastValue = new Map<string, string>();

  steps.forEach((step, index) => {
    if (step.op !== 'SSTORE') {
      return;
    }
    const slot = step.stack[step.stack.length - 1];
    const value = step.stack[step.stack.length - 2];
    if (!slot) {
      return;
    }
    const before = lastValue.get(slot) ?? step.storage[slot] ?? '0x0';
    writes.push({ step: index, depth: step.depth, slot, before, after: value ?? '0x0' });
    lastValue.set(slot, value ?? '0x0');
  });

  return writes;
}

const OPCODE_COLORS: Record<string, string> = {
  SSTORE: 'orange.400',
  SLOAD: 'orange.400',
  CALL: 'blue.400',
  DELEGATECALL: 'blue.400',
  STATICCALL: 'blue.400',
  CALLCODE: 'blue.400',
  CREATE: 'purple.400',
  CREATE2: 'purple.400',
  REVERT: 'red.400',
  INVALID: 'red.400',
  RETURN: 'green.400',
  STOP: 'green.400',
  MSTORE: 'purple.300',
  MLOAD: 'purple.300',
  JUMP: 'yellow.400',
  JUMPI: 'yellow.400',
  JUMPDEST: 'yellow.500',
};

export function opcodeColor(op: string): string {
  return OPCODE_COLORS[op] ?? 'text.primary';
}

/** Count every node in a call tree, including the root. */
export function countCalls(node: CallNode | null): number {
  if (!node) {
    return 0;
  }
  return 1 + (node.calls ?? []).reduce((sum, child) => sum + countCalls(child), 0);
}
