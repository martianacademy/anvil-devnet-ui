// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid, Code } from '@chakra-ui/react';
import React from 'react';

import type { NodeStatus } from 'src/features/devnet/api/types';

import PageTitle from 'src/shell/page/title/PageTitle';

import { devnetApi, DevNetApiError } from 'src/features/devnet/api/client';
import { useNodeStatus, usePolledResource } from 'src/features/devnet/api/useDevnet';
import DevNetField from 'src/features/devnet/components/DevNetField';
import DevNetProcessList from 'src/features/devnet/components/DevNetProcessList';
import DevNetSection from 'src/features/devnet/components/DevNetSection';
import DevNetStatusBar from 'src/features/devnet/components/DevNetStatusBar';

import { Alert } from 'src/toolkit/chakra/alert';
import { Button } from 'src/toolkit/chakra/button';
import { toaster } from 'src/toolkit/chakra/toaster';

const LOGS_POLL_MS = 4000;
const DEFAULT_CHAIN_ID = 31337;
const DEFAULT_PORT = 8546;
const DEFAULT_BLOCK_TIME = 2;
const DEFAULT_ACCOUNTS = 10;
const DEFAULT_BALANCE = 10000;

/** Blank and unparseable inputs fall back rather than reaching the API as NaN. */
function numberOr(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  return value.trim() === '' || Number.isNaN(parsed) ? fallback : parsed;
}

interface LogsResponse {
  logs: Array<string>;
  logPath: string | null;
  lastError: string | null;
}

const DevNetControl = () => {
  const { data: status, isLoading, refetch } = useNodeStatus();
  const { data: logs } = usePolledResource<LogsResponse>(
    () => devnetApi.get<LogsResponse>('/anvil/logs?limit=200'),
    LOGS_POLL_MS,
    { logs: [], logPath: null, lastError: null },
  );

  const [ isBusy, setIsBusy ] = React.useState(false);
  const [ chainId, setChainId ] = React.useState(String(DEFAULT_CHAIN_ID));
  const [ port, setPort ] = React.useState(String(DEFAULT_PORT));
  const [ blockTime, setBlockTime ] = React.useState(String(DEFAULT_BLOCK_TIME));
  const [ accounts, setAccounts ] = React.useState(String(DEFAULT_ACCOUNTS));
  const [ balance, setBalance ] = React.useState(String(DEFAULT_BALANCE));
  const [ forkUrl, setForkUrl ] = React.useState('');
  const [ forkBlock, setForkBlock ] = React.useState('');

  // Mirror whatever the node is really running with. The inputs are disabled while
  // it runs, so this is a readout; once it stops the last values stay in the form
  // and a restart reuses them.
  React.useEffect(() => {
    const config = status.config;
    if (!config || !status.running) {
      return;
    }
    setChainId(String(config.chainId ?? status.chainId ?? DEFAULT_CHAIN_ID));
    setPort(String(config.port ?? status.port));
    setBlockTime(typeof config.blockTime === 'number' ? String(config.blockTime) : '');
    setAccounts(String(config.accounts ?? DEFAULT_ACCOUNTS));
    setBalance(typeof config.balance === 'number' ? String(config.balance) : '');
    setForkUrl(config.forkUrl ?? '');
    setForkBlock(typeof config.forkBlockNumber === 'number' ? String(config.forkBlockNumber) : '');
  }, [ status.config, status.running, status.chainId, status.port ]);

  const run = React.useCallback(async(label: string, action: () => Promise<string | void>) => {
    setIsBusy(true);
    try {
      const detail = await action();
      toaster.create({ title: label, description: detail || undefined, type: 'success' });
      refetch();
    } catch (error) {
      toaster.create({
        title: `${ label } failed`,
        description: error instanceof DevNetApiError ? error.message : String(error),
        type: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  }, [ refetch ]);

  const handleStart = React.useCallback(() => {
    return run('Anvil started', async() => {
      const payload = {
        chainId: numberOr(chainId, DEFAULT_CHAIN_ID),
        port: numberOr(port, DEFAULT_PORT),
        // An observed on-demand node leaves this blank; 0 is what that means to Anvil.
        blockTime: numberOr(blockTime, 0),
        accounts: numberOr(accounts, DEFAULT_ACCOUNTS),
        balance: numberOr(balance, DEFAULT_BALANCE),
        baseFee: 0,
        ...(forkUrl.trim() ? { forkUrl: forkUrl.trim() } : {}),
        ...(forkUrl.trim() && forkBlock.trim() ? { forkBlockNumber: numberOr(forkBlock, 0) } : {}),
      };
      const result = await devnetApi.post<{ port: number; chainId: number; forkBlockNumber: number | null }>(
        '/anvil/start',
        payload,
      );
      if (result.forkBlockNumber && !forkBlock.trim()) {
        setForkBlock(String(result.forkBlockNumber));
      }
      return `Chain ${ result.chainId } listening on port ${ result.port }`;
    });
  }, [ run, chainId, port, blockTime, accounts, balance, forkUrl, forkBlock ]);

  const handleStop = React.useCallback(() => {
    return run('Anvil stopped', async() => {
      await devnetApi.post('/anvil/stop');
    });
  }, [ run ]);

  const handleSyncExplorer = React.useCallback(() => {
    return run('Explorer sync started', async() => {
      await devnetApi.post('/anvil/explorer-sync');
      return 'Rebuilding the explorer index for this node…';
    });
  }, [ run ]);

  const handleReset = React.useCallback(() => {
    return run('Session reset', async() => {
      const result = await devnetApi.post<{ deletedRows: { blocks: number; transactions: number } }>(
        '/anvil/reset',
        { chainId: numberOr(chainId, DEFAULT_CHAIN_ID) },
      );
      return `Cleared ${ result.deletedRows.blocks } blocks and ${ result.deletedRows.transactions } transactions`;
    });
  }, [ run, chainId ]);

  // An externally started node's settings are observed, not chosen here.
  const isReadout = status.running && status.configSource === 'node';

  let blockTimeHelper = '0 mines on demand';
  if (isReadout) {
    blockTimeHelper = blockTime ? '' : 'This node has no fixed interval — it mines on demand';
  }

  const syncStatus = status.explorer?.sync?.status;
  const syncMessage = status.explorer?.sync?.message;
  // While a sync is in flight it is already fixing the mismatch — saying so twice
  // (and telling the user to run commands) is just noise.
  const needsExplorerSync = Boolean(
    status.running &&
    status.explorer &&
    syncStatus !== 'syncing' &&
    (!status.explorer.indexed || (status.chainId !== null && status.chainId !== status.explorer.chainId)),
  );

  return (
    <>
      <PageTitle title="DevNet control" secondRow={ <DevNetStatusBar status={ status as NodeStatus } isLoading={ isLoading }/> }/>

      <Flex flexDir="column" gap={ 5 }>
        { status.lastError && (
          <Alert status="error">{ status.lastError }</Alert>
        ) }

        { syncStatus === 'syncing' && (
          <Alert status="info">
            <Box>
              <Box fontWeight="500">Rebuilding the explorer index…</Box>
              <Box fontSize="sm" mt={ 1 }>
                { syncMessage } The explorer will be unreachable for a minute or two
                while its containers restart with an empty database.
              </Box>
            </Box>
          </Alert>
        ) }

        { syncStatus === 'error' && (
          <Alert status="error">{ syncMessage }</Alert>
        ) }

        { syncStatus === 'unavailable' && (
          <Alert status="warning">{ syncMessage }</Alert>
        ) }

        { needsExplorerSync && (
          <Alert status="warning">
            <Flex flexDir="column" gap={ 2 } w="100%">
              <Box fontWeight="500">The explorer is indexing a different chain.</Box>
              <Box fontSize="sm">
                This node is chain { status.chainId } on port { status.port }, while the explorer was
                started for chain { status.explorer?.chainId } on port { status.explorer?.rpcPort }, so its
                blocks and transactions will not show up. It follows automatically within about ten
                seconds — or do it now, which wipes the old chain&apos;s index and reindexes from block 0.
              </Box>
              <Button size="sm" alignSelf="flex-start" onClick={ handleSyncExplorer } loading={ isBusy }>
                Sync explorer to this node
              </Button>
            </Flex>
          </Alert>
        ) }

        <DevNetSection
          title="Node"
          description={ isReadout ?
            'These values are read from the Anvil instance running right now — stop it to edit them.' :
            'Start, stop and reset the local Anvil instance this explorer indexes.' }
          action={ (
            <Flex gap={ 2 }>
              <Button size="sm" onClick={ handleStart } loading={ isBusy } disabled={ status.running }>Start</Button>
              <Button size="sm" variant="outline" onClick={ handleStop } loading={ isBusy } disabled={ !status.running }>Stop</Button>
              <Button size="sm" variant="outline" colorPalette="red" onClick={ handleReset } loading={ isBusy }>Reset</Button>
            </Flex>
          ) }
        >
          <Grid templateColumns={{ base: '1fr', lg: 'repeat(3, 1fr)' }} gap={ 4 }>
            <DevNetField label="Chain ID" value={ chainId } onChange={ setChainId } isDisabled={ status.running }/>
            <DevNetField label="Port" value={ port } onChange={ setPort } isDisabled={ status.running }/>
            <DevNetField
              label="Block time (s)"
              value={ blockTime }
              onChange={ setBlockTime }
              placeholder={ isReadout ? 'on demand' : undefined }
              helperText={ blockTimeHelper }
              isDisabled={ status.running }
            />
            <DevNetField label="Accounts" value={ accounts } onChange={ setAccounts } isDisabled={ status.running }/>
            <DevNetField
              label="Balance per account (ETH)"
              value={ balance }
              onChange={ setBalance }
              helperText={ isReadout ? 'Current balance of the first account, rounded' : undefined }
              isDisabled={ status.running }
            />
            <DevNetField
              label="Fork block (optional)"
              value={ forkBlock }
              onChange={ setForkBlock }
              placeholder={ isReadout ? '—' : 'latest' }
              isDisabled={ status.running }
            />
            <Box gridColumn={{ lg: 'span 3' }}>
              <DevNetField
                label="Fork URL (optional)"
                value={ forkUrl }
                onChange={ setForkUrl }
                placeholder={ isReadout ? 'not forked' : 'https://eth.llamarpc.com' }
                helperText={ isReadout ?
                  'Empty means this node runs a clean local chain rather than a fork.' :
                  'Leave empty for a clean local chain. The block is pinned automatically so restarts are reproducible.' }
                isMono
                isDisabled={ status.running }
              />
            </Box>
          </Grid>
        </DevNetSection>

        <DevNetSection
          title="Anvil processes"
          description="Stop a node that is holding a port — even one started outside this app."
        >
          <DevNetProcessList onChange={ refetch }/>
        </DevNetSection>

        <DevNetSection title="Node logs" description={ logs.logPath ?? 'Live output from the managed Anvil process' }>
          <Code
            display="block"
            whiteSpace="pre-wrap"
            fontSize="xs"
            p={ 3 }
            maxH="320px"
            overflowY="auto"
            w="100%"
            borderRadius="md"
          >
            { logs.logs.length > 0 ? logs.logs.slice(-80).join('\n') : 'No output yet — start the node to see logs.' }
          </Code>
        </DevNetSection>
      </Flex>
    </>
  );
};

export default DevNetControl;
