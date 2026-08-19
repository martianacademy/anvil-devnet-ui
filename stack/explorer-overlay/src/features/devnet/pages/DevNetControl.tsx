// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid, Code } from '@chakra-ui/react';
import React from 'react';

import type { NodeStatus } from 'src/features/devnet/api/types';

import PageTitle from 'src/shell/page/title/PageTitle';

import { devnetApi, DevNetApiError } from 'src/features/devnet/api/client';
import { useNodeStatus, usePolledResource } from 'src/features/devnet/api/useDevnet';
import DevNetField from 'src/features/devnet/components/DevNetField';
import DevNetSection from 'src/features/devnet/components/DevNetSection';
import DevNetStatusBar from 'src/features/devnet/components/DevNetStatusBar';

import { Alert } from 'src/toolkit/chakra/alert';
import { Button } from 'src/toolkit/chakra/button';
import { toaster } from 'src/toolkit/chakra/toaster';

const LOGS_POLL_MS = 4000;

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
  const [ chainId, setChainId ] = React.useState('31337');
  const [ port, setPort ] = React.useState('8546');
  const [ blockTime, setBlockTime ] = React.useState('2');
  const [ accounts, setAccounts ] = React.useState('10');
  const [ balance, setBalance ] = React.useState('10000');
  const [ forkUrl, setForkUrl ] = React.useState('');
  const [ forkBlock, setForkBlock ] = React.useState('');

  // Reflect the running node's config in the form so a restart keeps its settings.
  React.useEffect(() => {
    const config = status.config as Partial<Record<string, number | string>> | null;
    if (!config || !status.running) {
      return;
    }
    setChainId(String(config.chainId ?? status.chainId ?? 31337));
    setPort(String(config.port ?? status.port));
    setBlockTime(String(config.blockTime ?? 2));
    setAccounts(String(config.accounts ?? 10));
    setBalance(String(config.balance ?? 10000));
    if (config.forkUrl) {
      setForkUrl(String(config.forkUrl));
    }
    if (config.forkBlockNumber) {
      setForkBlock(String(config.forkBlockNumber));
    }
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
        chainId: Number(chainId),
        port: Number(port),
        blockTime: Number(blockTime),
        accounts: Number(accounts),
        balance: Number(balance),
        baseFee: 0,
        ...(forkUrl.trim() ? { forkUrl: forkUrl.trim() } : {}),
        ...(forkUrl.trim() && forkBlock.trim() ? { forkBlockNumber: Number(forkBlock) } : {}),
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

  const handleReset = React.useCallback(() => {
    return run('Session reset', async() => {
      const result = await devnetApi.post<{ deletedRows: { blocks: number; transactions: number } }>(
        '/anvil/reset',
        { chainId: Number(chainId) },
      );
      return `Cleared ${ result.deletedRows.blocks } blocks and ${ result.deletedRows.transactions } transactions`;
    });
  }, [ run, chainId ]);

  return (
    <>
      <PageTitle title="DevNet control" secondRow={ <DevNetStatusBar status={ status as NodeStatus } isLoading={ isLoading }/> }/>

      <Flex flexDir="column" gap={ 5 }>
        { status.lastError && (
          <Alert status="error">{ status.lastError }</Alert>
        ) }

        <DevNetSection
          title="Node"
          description="Start, stop and reset the local Anvil instance this explorer indexes."
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
            <DevNetField label="Block time (s)" value={ blockTime } onChange={ setBlockTime } helperText="0 mines on demand" isDisabled={ status.running }/>
            <DevNetField label="Accounts" value={ accounts } onChange={ setAccounts } isDisabled={ status.running }/>
            <DevNetField label="Balance per account (ETH)" value={ balance } onChange={ setBalance } isDisabled={ status.running }/>
            <DevNetField label="Fork block (optional)" value={ forkBlock } onChange={ setForkBlock } placeholder="latest" isDisabled={ status.running }/>
            <Box gridColumn={{ lg: 'span 3' }}>
              <DevNetField
                label="Fork URL (optional)"
                value={ forkUrl }
                onChange={ setForkUrl }
                placeholder="https://eth.llamarpc.com"
                helperText="Leave empty for a clean local chain. The block is pinned automatically so restarts are reproducible."
                isMono
                isDisabled={ status.running }
              />
            </Box>
          </Grid>
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
