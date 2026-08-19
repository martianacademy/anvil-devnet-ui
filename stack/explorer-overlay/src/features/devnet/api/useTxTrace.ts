// SPDX-License-Identifier: LicenseRef-Blockscout

import { useQuery } from '@tanstack/react-query';
import type { Abi } from 'viem';

import { devnetApi } from './client';
import type { EvmStep, TraceResponse } from './trace';
import { parseStructLogs } from './trace';
import type { TraceEntry } from './traceEntries';
import { callTraceToEntries, collectAddresses, structLogsToEntries } from './traceEntries';

export interface DevNetTx {
  hash: string;
  from: string;
  to: string | null;
  input: string | null;
  value: string;
  gas: string | null;
  gasUsed: string | null;
  status: string;
  decoded_function: string | null;
  decoded_params: Record<string, unknown> | null;
  contractName: string | null;
}

export interface TxTraceData {
  tx: DevNetTx | null;
  steps: Array<EvmStep>;
  entries: Array<TraceEntry>;

  /** Executing contract per step index, for gas and revert attribution. */
  contexts: Array<string | undefined>;
  abis: Record<string, Abi>;
  traceError: string | null;
  source: 'opcodes' | 'calls' | null;
}

const STALE_TIME_MS = 60_000;

/**
 * Loads a devnet transaction's trace once and shares it across the trace, gas and
 * storage tabs. ABIs are resolved in a second pass: build the entries to learn which
 * contracts the trace touches, fetch their ABIs, then rebuild with real decoding.
 */
export function useTxTrace(hash: string, fallbackTo?: string | null) {
  return useQuery<TxTraceData>({
    queryKey: [ 'devnet-tx-trace', hash ],
    staleTime: STALE_TIME_MS,
    retry: false,
    queryFn: async() => {
      const [ trace, tx ] = await Promise.all([
        devnetApi.get<TraceResponse>(`/tx/${ hash }/trace`),
        devnetApi.get<DevNetTx>(`/tx/${ hash }`).catch(() => null),
      ]);

      const steps = parseStructLogs(trace.structLogs);
      const rootAddress = (tx?.to ?? fallbackTo) ?? undefined;
      const rootCall = tx ? {
        from: tx.from,
        to: tx.to,
        input: tx.input,
        value: tx.value,
        gas: tx.gas ? Number(BigInt(tx.gas)) : null,
        gasUsed: tx.gasUsed ? Number(BigInt(tx.gasUsed)) : null,
        failed: tx.status === 'failed',
      } : undefined;

      const build = (abis?: Record<string, Abi>): Array<TraceEntry> => {
        if (steps.length > 0) {
          return structLogsToEntries(steps, { rootAddress, abis, rootCall });
        }
        return trace.callTrace ? callTraceToEntries(trace.callTrace, { abis }) : [];
      };

      let entries = build();

      let abis: Record<string, Abi> = {};
      const addresses = collectAddresses(entries, rootAddress);
      if (addresses.length > 0) {
        const response = await devnetApi
          .post<{ abis: Record<string, Abi> }>('/abi/batch', { addresses })
          .catch(() => ({ abis: {} }));
        abis = response.abis ?? {};
      }
      if (Object.keys(abis).length > 0) {
        entries = build(abis);
      }

      const contexts: Array<string | undefined> = new Array(steps.length).fill(undefined);
      for (const entry of entries) {
        if (entry.idx >= 0) {
          contexts[entry.idx] = entry.context;
        }
      }

      let source: TxTraceData['source'] = null;
      if (steps.length > 0) {
        source = 'opcodes';
      } else if (trace.callTrace) {
        source = 'calls';
      }

      return { tx, steps, entries, contexts, abis, traceError: trace.traceError, source };
    },
  });
}
