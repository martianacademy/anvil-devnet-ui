// SPDX-License-Identifier: LicenseRef-Blockscout

import type { Abi } from 'viem';
import { decodeEventLog, decodeFunctionData } from 'viem';

import type { CallNode, EvmStep } from './trace';

/**
 * Turns raw `debug_traceTransaction` output into a flat, indented trace log:
 * one row per meaningful operation (calls, storage access, logs, returns),
 * decoded where possible. This is the data behind the EVM trace tab.
 */

export type TraceKind =
  | 'CALL' |
  'DELEGATECALL' |
  'STATICCALL' |
  'CREATE' |
  'SLOAD' |
  'SSTORE' |
  'LOG' |
  'JUMP' |
  'RETURN' |
  'REVERT' |
  'OTHER';

export interface DecodedParam {
  label: string;
  value: string;
}

export interface TraceEntry {
  idx: number;
  op: string;
  kind: TraceKind;
  gas: number;
  gasCost: number;
  depth: number;
  pc: number;

  /** Contract executing this step (call context). */
  context?: string;

  /** SLOAD/SSTORE slot. */
  slot?: string;

  /** SLOAD: value read. SSTORE: value written. */
  value?: string;

  /** SSTORE: value the slot held before this write. */
  previousValue?: string;

  /** Call target. */
  to?: string;
  from?: string;
  input?: string;
  callValue?: string;
  topics?: Array<string>;
  logData?: string;
  decoded?: string;
  decodedCallParams?: Array<DecodedParam>;
  decodedEventParams?: Array<DecodedParam>;
  error?: boolean;
}

export interface TraceFilters {
  showGas: boolean;
  showFullTrace: boolean;
  showStorage: boolean;
  showEvents: boolean;
  search: string;
}

/* ── Fallback signature tables, used when no ABI is available ── */

const SELECTORS: Record<string, { name: string; params: Array<string> }> = {
  '0x70a08231': { name: 'balanceOf', params: [ 'address' ] },
  '0xa9059cbb': { name: 'transfer', params: [ 'address', 'uint256' ] },
  '0x23b872dd': { name: 'transferFrom', params: [ 'address', 'address', 'uint256' ] },
  '0x095ea7b3': { name: 'approve', params: [ 'address', 'uint256' ] },
  '0xdd62ed3e': { name: 'allowance', params: [ 'address', 'address' ] },
  '0x18160ddd': { name: 'totalSupply', params: [] },
  '0x313ce567': { name: 'decimals', params: [] },
  '0x06fdde03': { name: 'name', params: [] },
  '0x95d89b41': { name: 'symbol', params: [] },
  '0x40c10f19': { name: 'mint', params: [ 'address', 'uint256' ] },
  '0x42966c68': { name: 'burn', params: [ 'uint256' ] },
  '0x3ccfd60b': { name: 'withdraw', params: [] },
  '0xd0e30db0': { name: 'deposit', params: [] },
  '0x2e1a7d4d': { name: 'withdraw', params: [ 'uint256' ] },
  '0x39509351': { name: 'increaseAllowance', params: [ 'address', 'uint256' ] },
  '0xa457c2d7': { name: 'decreaseAllowance', params: [ 'address', 'uint256' ] },
  '0x79cc6790': { name: 'burnFrom', params: [ 'address', 'uint256' ] },
};

const EVENTS: Record<string, { name: string; params: Array<string> }> = {
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef':
    { name: 'Transfer', params: [ 'from', 'to', 'value' ] },
  '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925':
    { name: 'Approval', params: [ 'owner', 'spender', 'value' ] },
};

const ADDRESS_LABELS = new Set([ 'from', 'to', 'owner', 'spender', 'account', 'sender', 'recipient' ]);

/* ── Formatting helpers ── */

function hex0x(value: string): string {
  if (!value) {
    return '0x0';
  }
  return `0x${ value.replace(/^(?:0x)+/i, '') }`;
}

export function shortAddr(address: string): string {
  if (!address) {
    return '—';
  }
  const value = hex0x(address);
  return `${ value.slice(0, 6) }…${ value.slice(-4) }`;
}

export function shortHex(value: string, maxLen = 16): string {
  if (!value) {
    return '—';
  }
  const hex = hex0x(value);
  return hex.length <= maxLen ? hex : `${ hex.slice(0, maxLen) }…${ hex.slice(-4) }`;
}

function extractAddress(word: string): string {
  return `0x${ word.replace(/^0x/i, '').padStart(64, '0').slice(24) }`;
}

function formatUint(value: string): string {
  try {
    const n = BigInt(value.startsWith('0x') ? value : `0x${ value }`);
    if (n === BigInt(0)) {
      return '0';
    }
    // Anything this large is almost always an 18-decimal token amount.
    if (n > BigInt('1000000000000000')) {
      const scaled = Number(n) / 1e18;
      if (scaled >= 0.001 && scaled < 1e15) {
        return scaled.toLocaleString(undefined, { maximumFractionDigits: 4 });
      }
    }
    return n.toLocaleString();
  } catch {
    return shortHex(value);
  }
}

function formatAbiArg(value: unknown): string {
  if (value === undefined || value === null) {
    return '—';
  }
  if (typeof value === 'bigint') {
    return formatUint(`0x${ value.toString(16) }`);
  }
  if (typeof value === 'string') {
    return value.startsWith('0x') && value.length === 42 ? shortAddr(value) : value;
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    return `[${ value.map(formatAbiArg).join(', ') }]`;
  }
  return String(value);
}

function classifyOp(op: string): TraceKind {
  if (op === 'CALLCODE') {
    return 'CALL';
  }
  if ([ 'CALL', 'DELEGATECALL', 'STATICCALL' ].includes(op)) {
    return op as TraceKind;
  }
  if ([ 'CREATE', 'CREATE2' ].includes(op)) {
    return 'CREATE';
  }
  if (op === 'SLOAD' || op === 'SSTORE') {
    return op;
  }
  if (op.startsWith('LOG')) {
    return 'LOG';
  }
  if ([ 'JUMP', 'JUMPI', 'JUMPDEST' ].includes(op)) {
    return 'JUMP';
  }
  if (op === 'RETURN' || op === 'STOP') {
    return 'RETURN';
  }
  if (op === 'REVERT' || op === 'INVALID') {
    return 'REVERT';
  }
  return 'OTHER';
}

/* ── Decoding ── */

export function decodeCalldata(input: string, abi?: Abi): { name: string; params: Array<DecodedParam> } | undefined {
  if (!input || input.length < 10) {
    return undefined;
  }

  if (abi) {
    try {
      const decoded = decodeFunctionData({ abi, data: input as `0x${ string }` });
      const item = abi.find((entry) => entry.type === 'function' && entry.name === decoded.functionName);
      const inputs = item && 'inputs' in item ? item.inputs : [];
      const args = (decoded.args ?? []) as Array<unknown>;
      return {
        name: decoded.functionName,
        params: args.map((arg, index) => ({
          label: inputs?.[index]?.name || `arg${ index }`,
          value: formatAbiArg(arg),
        })),
      };
    } catch { /* not this ABI — fall through to the selector table */ }
  }

  const info = SELECTORS[input.slice(0, 10).toLowerCase()];
  if (!info) {
    return undefined;
  }

  const data = input.slice(10);
  const params = info.params.map((type, index) => {
    const chunk = data.slice(index * 64, (index + 1) * 64);
    if (!chunk) {
      return { label: type, value: '—' };
    }
    return {
      label: type,
      value: type === 'address' ? shortAddr(extractAddress(chunk)) : formatUint(chunk),
    };
  });

  return { name: info.name, params };
}

export function decodeLog(topics: Array<string>, data?: string, abi?: Abi): { name: string; params: Array<DecodedParam> } | undefined {
  if (topics.length === 0) {
    return undefined;
  }

  if (abi) {
    try {
      const decoded = decodeEventLog({
        abi,
        topics: topics.map(hex0x) as [`0x${ string }`, ...Array<`0x${ string }`>],
        data: (data ?? '0x') as `0x${ string }`,
      });
      const args = decoded.args as Record<string, unknown> | Array<unknown> | undefined;
      const params: Array<DecodedParam> = Array.isArray(args) ?
        args.map((arg, index) => ({ label: `arg${ index }`, value: formatAbiArg(arg) })) :
        Object.entries(args ?? {}).map(([ label, value ]) => ({ label, value: formatAbiArg(value) }));
      return { name: decoded.eventName ?? 'event', params };
    } catch { /* not this ABI — fall through to the topic table */ }
  }

  const info = EVENTS[hex0x(topics[0]).toLowerCase()];
  if (!info) {
    return undefined;
  }

  const params: Array<DecodedParam> = [];
  for (let i = 1; i < topics.length && i - 1 < info.params.length; i++) {
    const label = info.params[i - 1];
    params.push({
      label,
      value: ADDRESS_LABELS.has(label) ? shortAddr(extractAddress(topics[i])) : formatUint(topics[i]),
    });
  }

  if (data && data.length > 2) {
    const body = data.replace('0x', '');
    let paramIndex = topics.length - 1;
    for (let i = 0; i * 64 < body.length && paramIndex < info.params.length; i++, paramIndex++) {
      const label = info.params[paramIndex];
      const chunk = body.slice(i * 64, (i + 1) * 64);
      params.push({
        label,
        value: ADDRESS_LABELS.has(label) ? shortAddr(extractAddress(chunk)) : formatUint(chunk),
      });
    }
  }

  return { name: info.name, params };
}

/* ── Struct logs → entries ── */

function readMemory(memory: Array<string>, offsetWord: string, sizeWord: string): string | undefined {
  const offset = parseInt(offsetWord.replace(/^0x/i, ''), 16);
  const size = parseInt(sizeWord.replace(/^0x/i, ''), 16);
  if (!Number.isFinite(offset) || !Number.isFinite(size) || size <= 0 || memory.length === 0) {
    return undefined;
  }
  // Anvil prefixes every memory word with 0x, geth does not — strip before joining,
  // otherwise the byte offsets below land in the middle of a prefix.
  const joined = memory.map((word) => word.replace(/^0x/i, '')).join('');
  return `0x${ joined.slice(offset * 2, offset * 2 + size * 2) }`;
}

export interface RootCall {
  from?: string;
  to?: string | null;
  input?: string | null;
  value?: string | null;
  gas?: number | null;
  gasUsed?: number | null;
  failed?: boolean;
}

export interface BuildOptions {

  /** Address the transaction was sent to — the initial execution context. */
  rootAddress?: string;

  /** address (lowercase) → ABI, used to decode calls and logs properly. */
  abis?: Record<string, Abi>;

  /** The transaction itself, rendered as the first row of the trace. */
  rootCall?: RootCall;
}

/**
 * Walks the opcode trace and emits one entry per interesting operation, tracking
 * the current call context so storage rows can say *which* contract they touched.
 */
export function structLogsToEntries(steps: Array<EvmStep>, options: BuildOptions = {}): Array<TraceEntry> {
  const entries: Array<TraceEntry> = [];
  const contextStack: Array<string> = [ (options.rootAddress ?? '').toLowerCase() ];
  const storageSeen = new Map<string, string>();
  const abis = options.abis ?? {};

  // An opcode trace starts *inside* the called contract, so the transaction's own
  // call has no opcode of its own. Synthesize it as the root of the tree.
  const { rootCall } = options;
  const hasRoot = Boolean(rootCall?.to || rootCall?.from);
  if (rootCall && hasRoot) {
    const decoded = decodeCalldata(rootCall.input ?? '', rootCall.to ? abis[rootCall.to.toLowerCase()] : undefined);
    entries.push({
      idx: -1,
      op: 'CALL',
      kind: 'CALL',
      gas: rootCall.gas ?? 0,
      gasCost: rootCall.gasUsed ?? 0,
      depth: 1,
      pc: 0,
      context: rootCall.to?.toLowerCase(),
      from: rootCall.from,
      to: rootCall.to ?? undefined,
      input: rootCall.input ?? undefined,
      callValue: rootCall.value ?? undefined,
      decoded: decoded?.name,
      decodedCallParams: decoded?.params,
      error: rootCall.failed,
    });
  }
  const depthOffset = hasRoot ? 1 : 0;

  steps.forEach((step, index) => {
    const kind = classifyOp(step.op);
    const stack = step.stack ?? [];
    const depth = step.depth ?? 1;

    // Depth drops mean the previous call returned.
    while (contextStack.length > depth) {
      contextStack.pop();
    }
    const context = contextStack[contextStack.length - 1];

    const entry: TraceEntry = {
      idx: index,
      op: step.op,
      kind,
      gas: step.gas,
      gasCost: step.gasCost,
      depth: depth + depthOffset,
      pc: step.pc,
      context,
    };

    if (kind === 'SLOAD' && stack.length >= 1) {
      entry.slot = hex0x(stack[stack.length - 1]);
      // The loaded value lands on top of the stack in the following step.
      const next = steps[index + 1]?.stack ?? [];
      if (next.length > 0) {
        entry.value = hex0x(next[next.length - 1]);
        storageSeen.set(`${ context }:${ entry.slot }`, entry.value);
      }
    }

    if (kind === 'SSTORE' && stack.length >= 2) {
      entry.slot = hex0x(stack[stack.length - 1]);
      entry.value = hex0x(stack[stack.length - 2]);
      // "Before" comes from the last read/write we saw for this slot; the step's own
      // storage map is a fallback (its keys are unprefixed).
      const key = `${ context }:${ entry.slot }`;
      entry.previousValue = storageSeen.get(key) ??
        step.storage?.[entry.slot.replace(/^0x/, '')] ??
        step.storage?.[entry.slot] ??
        '0x0';
      storageSeen.set(key, entry.value);
    }

    if (kind === 'LOG') {
      const topicCount = parseInt(step.op.replace('LOG', ''), 10) || 0;
      if (stack.length >= 2 + topicCount) {
        const topics: Array<string> = [];
        for (let t = 0; t < topicCount; t++) {
          topics.push(hex0x(stack[stack.length - 3 - t]));
        }
        entry.topics = topics;
        entry.logData = readMemory(step.memory ?? [], stack[stack.length - 1], stack[stack.length - 2]);

        const decoded = decodeLog(topics, entry.logData, context ? abis[context] : undefined);
        if (decoded) {
          entry.decoded = decoded.name;
          entry.decodedEventParams = decoded.params;
        }
      }
    }

    // CALL takes an extra `value` argument, so its stack layout is one deeper.
    if (kind === 'CALL' && stack.length >= 7) {
      entry.callValue = hex0x(stack[stack.length - 3]);
      entry.to = `0x${ stack[stack.length - 2].replace(/^0x/i, '').slice(-40) }`;
      entry.input = readMemory(step.memory ?? [], stack[stack.length - 4], stack[stack.length - 5]);
    }

    if ((kind === 'STATICCALL' || kind === 'DELEGATECALL') && stack.length >= 6) {
      entry.to = `0x${ stack[stack.length - 2].replace(/^0x/i, '').slice(-40) }`;
      entry.input = readMemory(step.memory ?? [], stack[stack.length - 3], stack[stack.length - 4]);
    }

    if (entry.to && entry.input) {
      const decoded = decodeCalldata(entry.input, abis[entry.to.toLowerCase()]);
      if (decoded) {
        entry.decoded = decoded.name;
        entry.decodedCallParams = decoded.params;
      }
    }

    if (entry.to) {
      entry.from = context;
      // DELEGATECALL keeps the caller's storage, so the context address stays put.
      contextStack.push(kind === 'DELEGATECALL' ? (context ?? '') : entry.to.toLowerCase());
    }

    entries.push(entry);
  });

  return entries;
}

/** Fallback for nodes that expose only callTracer output (no opcode trace). */
export function callTraceToEntries(node: CallNode, options: BuildOptions = {}, depth = 1, startIdx = 0): Array<TraceEntry> {
  const abis = options.abis ?? {};
  const decoded = decodeCalldata(node.input ?? '', node.to ? abis[node.to.toLowerCase()] : undefined);

  const entries: Array<TraceEntry> = [ {
    idx: startIdx,
    op: node.type ?? 'CALL',
    kind: classifyOp(node.type ?? 'CALL'),
    gas: parseInt(node.gas ?? '0', 16) || 0,
    gasCost: parseInt(node.gasUsed ?? '0', 16) || 0,
    depth,
    pc: 0,
    context: node.to?.toLowerCase(),
    from: node.from,
    to: node.to,
    input: node.input,
    callValue: node.value,
    decoded: decoded?.name,
    decodedCallParams: decoded?.params,
    error: Boolean(node.error),
  } ];

  let idx = startIdx + 1;
  for (const child of node.calls ?? []) {
    const childEntries = callTraceToEntries(child, options, depth + 1, idx);
    entries.push(...childEntries);
    idx += childEntries.length;
  }

  return entries;
}

/** Addresses worth resolving ABIs for. */
export function collectAddresses(entries: Array<TraceEntry>, rootAddress?: string): Array<string> {
  const addresses = new Set<string>();
  if (rootAddress) {
    addresses.add(rootAddress.toLowerCase());
  }
  for (const entry of entries) {
    if (entry.to && /^0x[0-9a-f]{40}$/i.test(entry.to)) {
      addresses.add(entry.to.toLowerCase());
    }
    if (entry.context && /^0x[0-9a-f]{40}$/i.test(entry.context)) {
      addresses.add(entry.context.toLowerCase());
    }
  }
  return [ ...addresses ];
}

const ALWAYS_SHOWN: Array<TraceKind> = [ 'CALL', 'DELEGATECALL', 'STATICCALL', 'CREATE', 'RETURN', 'REVERT' ];

/** Apply the toolbar filters + free-text search. */
export function filterEntries(entries: Array<TraceEntry>, filters: TraceFilters): Array<TraceEntry> {
  const term = filters.search.trim().toLowerCase();

  return entries.filter((entry) => {
    if (entry.kind === 'SLOAD' || entry.kind === 'SSTORE') {
      if (!filters.showStorage) {
        return false;
      }
    } else if (entry.kind === 'LOG') {
      if (!filters.showEvents) {
        return false;
      }
    } else if (!ALWAYS_SHOWN.includes(entry.kind) && !filters.showFullTrace) {
      return false;
    }

    if (!term) {
      return true;
    }
    return [ entry.op, entry.decoded, entry.to, entry.context, entry.slot, entry.value, entry.topics?.[0] ]
      .some((field) => field?.toLowerCase().includes(term));
  });
}
