// SPDX-License-Identifier: LicenseRef-Blockscout

import type { Abi } from 'viem';
import { decodeAbiParameters, keccak256, pad } from 'viem';

import type { EvmStep } from './trace';
import type { TraceEntry } from './traceEntries';

/**
 * Derived views over an opcode trace: why a transaction reverted, where its gas
 * went, what storage it actually changed, and what its calldata means.
 */

/* ── Revert analysis ───────────────────────────────────────────────────────── */

const ERROR_SELECTOR = '0x08c379a0'; // Error(string)
const PANIC_SELECTOR = '0x4e487b71'; // Panic(uint256)

/** Solidity's documented panic codes — the reason behind a bare "reverted". */
const PANIC_REASONS: Record<string, string> = {
  '0x00': 'Generic compiler panic',
  '0x01': 'assert() evaluated to false',
  '0x11': 'Arithmetic overflow or underflow',
  '0x12': 'Division or modulo by zero',
  '0x21': 'Value converted to an invalid enum member',
  '0x22': 'Incorrectly encoded storage byte array',
  '0x31': 'pop() on an empty array',
  '0x32': 'Array index out of bounds',
  '0x41': 'Out of memory — allocation too large',
  '0x51': 'Called a zero-initialised internal function',
};

export type RevertKind = 'error-string' | 'panic' | 'custom-error' | 'raw' | 'invalid-opcode' | 'out-of-gas' | 'unknown';

export interface RevertInfo {
  kind: RevertKind;

  /** Human-readable one-liner for the banner. */
  message: string;

  /** Extra context: panic code meaning, decoded custom-error args, etc. */
  detail?: string;
  rawData?: string;
  selector?: string;
  address?: string;
  pc?: number;
  depth?: number;
  stepIndex?: number;
}

function readMemory(memory: Array<string>, offsetWord?: string, sizeWord?: string): string | undefined {
  if (!offsetWord || !sizeWord) {
    return undefined;
  }
  const offset = parseInt(offsetWord.replace(/^0x/i, ''), 16);
  const size = parseInt(sizeWord.replace(/^0x/i, ''), 16);
  if (!Number.isFinite(offset) || !Number.isFinite(size) || size <= 0) {
    return undefined;
  }
  const joined = memory.map((word) => word.replace(/^0x/i, '')).join('');
  return `0x${ joined.slice(offset * 2, offset * 2 + size * 2) }`;
}

function decodeRevertData(data: string, abi?: Abi): Pick<RevertInfo, 'kind' | 'message' | 'detail' | 'selector'> {
  const selector = data.slice(0, 10).toLowerCase();

  if (selector === ERROR_SELECTOR) {
    try {
      const [ reason ] = decodeAbiParameters([ { type: 'string' } ], `0x${ data.slice(10) }`);
      return { kind: 'error-string', message: `require/revert: "${ reason }"`, selector };
    } catch {
      return { kind: 'raw', message: 'revert with an undecodable Error(string)', selector };
    }
  }

  if (selector === PANIC_SELECTOR) {
    try {
      const [ code ] = decodeAbiParameters([ { type: 'uint256' } ], `0x${ data.slice(10) }`);
      const numeric = Number(code);
      const key = `0x${ numeric.toString(16).padStart(2, '0') }`;
      return {
        kind: 'panic',
        message: PANIC_REASONS[key] ?? `Solidity panic ${ key }`,
        detail: `Panic(${ key })`,
        selector,
      };
    } catch {
      return { kind: 'panic', message: 'Solidity panic with an undecodable code', selector };
    }
  }

  if (abi) {
    const errorItem = abi.find((item) => {
      if (item.type !== 'error') {
        return false;
      }
      const signature = `${ item.name }(${ (item.inputs ?? []).map((input) => input.type).join(',') })`;
      return keccak256(new TextEncoder().encode(signature)).slice(0, 10) === selector;
    });

    if (errorItem && errorItem.type === 'error') {
      try {
        const args = decodeAbiParameters(errorItem.inputs ?? [], `0x${ data.slice(10) }`);
        const printed = (errorItem.inputs ?? [])
          .map((input, index) => `${ input.name || input.type }: ${ String(args[index]) }`)
          .join(', ');
        return { kind: 'custom-error', message: `${ errorItem.name }(${ printed })`, selector };
      } catch {
        return { kind: 'custom-error', message: `${ errorItem.name }(…)`, selector };
      }
    }
  }

  return {
    kind: 'raw',
    message: `Reverted with unknown error data (selector ${ selector })`,
    detail: 'Register the contract ABI to decode custom errors.',
    selector,
  };
}

/**
 * Find the revert (or invalid opcode / gas exhaustion) that ended the transaction.
 * Returns null for a successful run.
 */
export function analyzeRevert(steps: Array<EvmStep>, failed: boolean, abis: Record<string, Abi> = {}, contexts?: Array<string | undefined>): RevertInfo | null {
  if (!failed) {
    return null;
  }

  for (let index = steps.length - 1; index >= 0; index--) {
    const step = steps[index];
    const address = contexts?.[index];

    if (step.op === 'REVERT') {
      const stack = step.stack ?? [];
      const data = readMemory(step.memory ?? [], stack[stack.length - 1], stack[stack.length - 2]);
      const decoded = data && data.length > 10 ?
        decodeRevertData(data, address ? abis[address] : undefined) :
        { kind: 'raw' as const, message: 'Reverted without a reason string', selector: undefined };

      return { ...decoded, rawData: data, address, pc: step.pc, depth: step.depth, stepIndex: index };
    }

    if (step.op === 'INVALID') {
      return {
        kind: 'invalid-opcode',
        message: 'Hit an INVALID opcode — all remaining gas was consumed',
        detail: 'Usually an assert() in older Solidity, or a jump into non-code.',
        address,
        pc: step.pc,
        depth: step.depth,
        stepIndex: index,
      };
    }
  }

  const last = steps[steps.length - 1];
  return {
    kind: steps.length > 0 && last.gas <= last.gasCost ? 'out-of-gas' : 'unknown',
    message: steps.length > 0 && last.gas <= last.gasCost ?
      'Ran out of gas' :
      'Transaction failed without an explicit revert',
    stepIndex: steps.length - 1,
  };
}

/* ── Gas profile ───────────────────────────────────────────────────────────── */

export type GasCategory = 'storage-write' | 'storage-read' | 'call' | 'log' | 'memory' | 'compute' | 'other';

const CATEGORY_LABELS: Record<GasCategory, string> = {
  'storage-write': 'Storage writes (SSTORE)',
  'storage-read': 'Storage reads (SLOAD)',
  call: 'Call overhead',
  log: 'Events (LOG)',
  memory: 'Memory & copying',
  compute: 'Computation',
  other: 'Other',
};

const CALL_OPS = new Set([ 'CALL', 'DELEGATECALL', 'STATICCALL', 'CALLCODE', 'CREATE', 'CREATE2' ]);
const MEMORY_OPS = new Set([ 'MSTORE', 'MSTORE8', 'MLOAD', 'MCOPY', 'CALLDATACOPY', 'CODECOPY', 'RETURNDATACOPY', 'EXTCODECOPY' ]);

function categorize(op: string): GasCategory {
  if (op === 'SSTORE') {
    return 'storage-write';
  }
  if (op === 'SLOAD') {
    return 'storage-read';
  }
  if (CALL_OPS.has(op)) {
    return 'call';
  }
  if (op.startsWith('LOG')) {
    return 'log';
  }
  if (MEMORY_OPS.has(op)) {
    return 'memory';
  }
  return 'compute';
}

export interface GasCategoryRow {
  key: GasCategory;
  label: string;
  gas: number;
  share: number;
  count: number;
}

export interface GasOpRow {
  op: string;
  count: number;
  gas: number;
  share: number;
}

export interface GasFrameRow {
  address?: string;
  depth: number;
  gas: number;
  share: number;
}

export interface GasStepRow {
  index: number;
  op: string;
  gas: number;
  pc: number;
  address?: string;
}

export interface GasProfile {
  gasUsed: number | null;
  intrinsic: number;
  calldata: { zeroBytes: number; nonZeroBytes: number; gas: number };
  execution: number;
  unaccounted: number | null;
  categories: Array<GasCategoryRow>;
  topOps: Array<GasOpRow>;
  topSteps: Array<GasStepRow>;
  frames: Array<GasFrameRow>;
}

const INTRINSIC_BASE = 21_000;
const CREATE_BASE = 32_000;
const CALLDATA_ZERO_GAS = 4;
const CALLDATA_NONZERO_GAS = 16;

export interface GasProfileInput {
  steps: Array<EvmStep>;
  contexts?: Array<string | undefined>;
  input?: string | null;
  gasUsed?: number | null;
  isCreate?: boolean;
}

/**
 * Attribute gas per opcode. A call opcode's `gasCost` includes the gas handed to
 * the callee, so only the difference (the call overhead) is charged to the caller
 * — the callee's own steps are counted where they happen.
 */
export function profileGas({ steps, contexts, input, gasUsed, isCreate }: GasProfileInput): GasProfile {
  const body = (input ?? '0x').replace(/^0x/, '');
  let zeroBytes = 0;
  let nonZeroBytes = 0;
  for (let i = 0; i < body.length; i += 2) {
    if (body.slice(i, i + 2) === '00') {
      zeroBytes++;
    } else {
      nonZeroBytes++;
    }
  }
  const calldataGas = zeroBytes * CALLDATA_ZERO_GAS + nonZeroBytes * CALLDATA_NONZERO_GAS;
  const intrinsic = INTRINSIC_BASE + calldataGas + (isCreate ? CREATE_BASE : 0);

  const categoryTotals = new Map<GasCategory, { gas: number; count: number }>();
  const opTotals = new Map<string, { gas: number; count: number }>();
  const frameTotals = new Map<string, { gas: number; depth: number; address?: string }>();
  const stepCosts: Array<GasStepRow> = [];
  let execution = 0;

  steps.forEach((step, index) => {
    const next = steps[index + 1];
    let selfCost = step.gasCost;

    if (CALL_OPS.has(step.op) && next && next.depth > step.depth) {
      // gasCost includes the gas forwarded to the callee — charge only the overhead.
      selfCost = Math.max(0, step.gasCost - next.gas);
    }
    if (!Number.isFinite(selfCost) || selfCost < 0) {
      selfCost = 0;
    }

    execution += selfCost;

    const category = categorize(step.op);
    const categoryEntry = categoryTotals.get(category) ?? { gas: 0, count: 0 };
    categoryTotals.set(category, { gas: categoryEntry.gas + selfCost, count: categoryEntry.count + 1 });

    const opEntry = opTotals.get(step.op) ?? { gas: 0, count: 0 };
    opTotals.set(step.op, { gas: opEntry.gas + selfCost, count: opEntry.count + 1 });

    const address = contexts?.[index];
    const frameKey = `${ step.depth }:${ address ?? '' }`;
    const frameEntry = frameTotals.get(frameKey) ?? { gas: 0, depth: step.depth, address };
    frameTotals.set(frameKey, { ...frameEntry, gas: frameEntry.gas + selfCost });

    if (selfCost > 0) {
      stepCosts.push({ index, op: step.op, gas: selfCost, pc: step.pc, address });
    }
  });

  const total = execution || 1;

  return {
    gasUsed: gasUsed ?? null,
    intrinsic,
    calldata: { zeroBytes, nonZeroBytes, gas: calldataGas },
    execution,
    unaccounted: gasUsed !== null && gasUsed !== undefined ? gasUsed - intrinsic - execution : null,
    categories: [ ...categoryTotals.entries() ]
      .map(([ key, value ]) => ({ key, label: CATEGORY_LABELS[key], gas: value.gas, count: value.count, share: value.gas / total }))
      .sort((a, b) => b.gas - a.gas),
    topOps: [ ...opTotals.entries() ]
      .map(([ op, value ]) => ({ op, gas: value.gas, count: value.count, share: value.gas / total }))
      .sort((a, b) => b.gas - a.gas)
      .slice(0, 12),
    topSteps: [ ...stepCosts ].sort((a, b) => b.gas - a.gas).slice(0, 12),
    frames: [ ...frameTotals.values() ]
      .map((frame) => ({ ...frame, share: frame.gas / total }))
      .sort((a, b) => b.gas - a.gas),
  };
}

/* ── Net storage diff ──────────────────────────────────────────────────────── */

export interface StorageDiffRow {
  address?: string;
  slot: string;
  before: string;
  after: string;
  writes: number;
  label?: string;
}

/** Collapse the chronological SSTORE list into one before/after per slot. */
export function netStorageDiff(entries: Array<TraceEntry>): Array<StorageDiffRow> {
  const rows = new Map<string, StorageDiffRow>();

  for (const entry of entries) {
    if (entry.kind !== 'SSTORE' || !entry.slot) {
      continue;
    }
    const key = `${ entry.context ?? '' }:${ entry.slot }`;
    const existing = rows.get(key);
    if (existing) {
      existing.after = entry.value ?? existing.after;
      existing.writes++;
    } else {
      rows.set(key, {
        address: entry.context,
        slot: entry.slot,
        before: entry.previousValue ?? '0x0',
        after: entry.value ?? '0x0',
        writes: 1,
      });
    }
  }

  // A slot written back to its original value is not a change.
  return [ ...rows.values() ].filter((row) => normalizeWord(row.before) !== normalizeWord(row.after));
}

function normalizeWord(value: string): string {
  try {
    return BigInt(value).toString();
  } catch {
    return value;
  }
}

const MAX_MAPPING_SLOT = 16;

/**
 * Try to name a storage key: Solidity puts `mapping[key]` at
 * keccak256(pad32(key) ++ pad32(slot)), so replaying that for every address the
 * transaction touched turns an opaque hash into `slot 0 → mapping[0x…]`.
 */
export function labelStorageSlots(rows: Array<StorageDiffRow>, addresses: Array<string>): Array<StorageDiffRow> {
  const lookup = new Map<string, string>();

  for (const address of addresses) {
    if (!/^0x[0-9a-f]{40}$/i.test(address)) {
      continue;
    }
    const key = pad(address.toLowerCase() as `0x${ string }`, { size: 32 });
    for (let slot = 0; slot <= MAX_MAPPING_SLOT; slot++) {
      const slotWord = pad(`0x${ slot.toString(16) }` as `0x${ string }`, { size: 32 });
      const hash = keccak256(`0x${ key.slice(2) }${ slotWord.slice(2) }` as `0x${ string }`);
      lookup.set(BigInt(hash).toString(), `mapping @ slot ${ slot } [${ address.slice(0, 8) }…${ address.slice(-4) }]`);
    }
  }

  return rows.map((row) => {
    let label = lookup.get(normalizeWord(row.slot));
    if (!label) {
      const asNumber = normalizeWord(row.slot);
      if (asNumber.length <= 3) {
        label = `slot ${ asNumber }`;
      }
    }
    return label ? { ...row, label } : row;
  });
}

/* ── Calldata inspection ───────────────────────────────────────────────────── */

export interface CalldataWord {
  offset: number;
  hex: string;
  guess: string;
}

export interface CalldataView {
  selector: string | null;
  words: Array<CalldataWord>;
  byteLength: number;
}

/** 32-byte word view with a best-effort reading of each word — the fallback when no ABI is known. */
export function inspectCalldata(input?: string | null): CalldataView {
  const data = (input ?? '0x').replace(/^0x/, '');
  if (data.length === 0) {
    return { selector: null, words: [], byteLength: 0 };
  }

  const selector = data.length >= 8 ? `0x${ data.slice(0, 8) }` : null;
  const body = data.length >= 8 ? data.slice(8) : data;
  const words: Array<CalldataWord> = [];

  for (let i = 0; i * 64 < body.length; i++) {
    const hex = body.slice(i * 64, (i + 1) * 64).padEnd(64, '0');
    words.push({ offset: i * 32, hex: `0x${ hex }`, guess: guessWord(hex) });
  }

  return { selector, words, byteLength: data.length / 2 };
}

function guessWord(hex: string): string {
  const trimmed = hex.replace(/^0+/, '');
  if (trimmed === '') {
    return '0 / false / empty';
  }
  // 12 zero bytes then 20 non-zero-ish bytes reads as an address.
  if (hex.startsWith('000000000000000000000000') && hex.slice(24) !== '0'.repeat(40)) {
    return `address 0x${ hex.slice(24) }`;
  }
  try {
    const value = BigInt(`0x${ hex }`);
    if (value === BigInt(1)) {
      return '1 / true';
    }
    if (value < BigInt(1_000_000_000)) {
      return `uint ${ value.toString() } (offset or small number)`;
    }
    const asToken = Number(value) / 1e18;
    if (asToken >= 0.000001 && asToken < 1e12) {
      return `uint ${ value.toString() } (≈ ${ asToken.toLocaleString(undefined, { maximumFractionDigits: 6 }) } × 10¹⁸)`;
    }
    return `uint ${ value.toString() }`;
  } catch {
    return 'bytes32';
  }
}
