// SPDX-License-Identifier: LicenseRef-Blockscout

import React from 'react';

import type { NodeStatus } from './types';

import { devnetApi } from './client';

/** Poll `loader` on an interval, keeping the last good value on transient errors. */
export function usePolledResource<T>(loader: () => Promise<T>, intervalMs: number, initial: T) {
  const [ data, setData ] = React.useState<T>(initial);
  const [ error, setError ] = React.useState<string | null>(null);
  const [ isLoading, setIsLoading ] = React.useState(true);

  const loaderRef = React.useRef(loader);
  React.useEffect(() => {
    loaderRef.current = loader;
  });

  const [ nonce, setNonce ] = React.useState(0);
  const refetch = React.useCallback(() => setNonce((value) => value + 1), []);

  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async() => {
      try {
        const result = await loaderRef.current();
        if (!stopped) {
          setData(result);
          setError(null);
        }
      } catch (err) {
        if (!stopped) {
          setError(err instanceof Error ? err.message : 'Request failed');
        }
      } finally {
        if (!stopped) {
          setIsLoading(false);
          timer = setTimeout(tick, intervalMs);
        }
      }
    };

    tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ intervalMs, nonce ]);

  return { data, error, isLoading, refetch };
}

const STATUS_POLL_MS = 3000;

const INITIAL_STATUS: NodeStatus = {
  running: false,
  managed: false,
  pid: null,
  port: 8545,
  chainId: null,
  blockNumber: 0,
  gasPrice: null,
  lanIp: null,
  rpcUrl: '',
  uptime: 0,
  projectId: null,
  lastError: null,
  config: null,
};

/** Live status of the Anvil node the control plane is pointed at. */
export function useNodeStatus() {
  return usePolledResource<NodeStatus>(
    () => devnetApi.get<NodeStatus>('/anvil/status'),
    STATUS_POLL_MS,
    INITIAL_STATUS,
  );
}
