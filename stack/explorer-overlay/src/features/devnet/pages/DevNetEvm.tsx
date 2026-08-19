// SPDX-License-Identifier: LicenseRef-Blockscout

import { Flex, Grid, Box } from '@chakra-ui/react';
import React from 'react';

import type { NodeStatus, Snapshot } from 'src/features/devnet/api/types';

import PageTitle from 'src/shell/page/title/PageTitle';

import { devnetApi, DevNetApiError } from 'src/features/devnet/api/client';
import { useNodeStatus, usePolledResource } from 'src/features/devnet/api/useDevnet';
import DevNetField from 'src/features/devnet/components/DevNetField';
import DevNetSection from 'src/features/devnet/components/DevNetSection';
import DevNetStatusBar from 'src/features/devnet/components/DevNetStatusBar';

import { Button } from 'src/toolkit/chakra/button';
import { Tag } from 'src/toolkit/chakra/tag';
import { toaster } from 'src/toolkit/chakra/toaster';

const SNAPSHOT_POLL_MS = 5000;

const TIME_PRESETS: Array<[number, string]> = [
  [ 60, '1 min' ],
  [ 3600, '1 hour' ],
  [ 86400, '1 day' ],
  [ 604800, '7 days' ],
  [ 2592000, '30 days' ],
];

const DevNetEvm = () => {
  const { data: status, isLoading, refetch: refetchStatus } = useNodeStatus();
  const { data: snapshots, refetch: refetchSnapshots } = usePolledResource<Array<Snapshot>>(
    () => devnetApi.get<Array<Snapshot>>('/anvil/snapshot'),
    SNAPSHOT_POLL_MS,
    [],
  );

  const [ isBusy, setIsBusy ] = React.useState(false);
  const [ blocks, setBlocks ] = React.useState('1');
  const [ customSeconds, setCustomSeconds ] = React.useState('');
  const [ intervalSeconds, setIntervalSeconds ] = React.useState('2');
  const [ impersonated, setImpersonated ] = React.useState<string | null>(null);
  const [ impersonateAddress, setImpersonateAddress ] = React.useState('');
  const [ snapshotLabel, setSnapshotLabel ] = React.useState('');

  const run = React.useCallback(async(label: string, action: () => Promise<string | void>) => {
    setIsBusy(true);
    try {
      const detail = await action();
      toaster.create({ title: detail || label, type: 'success' });
      refetchStatus();
    } catch (error) {
      toaster.create({
        title: `${ label } failed`,
        description: error instanceof DevNetApiError ? error.message : String(error),
        type: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  }, [ refetchStatus ]);

  const mine = React.useCallback((count: number) => {
    return run('Mine', async() => {
      const result = await devnetApi.post<{ blockNumber: number }>('/anvil/mine', { blocks: count });
      return `Mined ${ count } block${ count === 1 ? '' : 's' } → #${ result.blockNumber }`;
    });
  }, [ run ]);

  // Handlers read their argument from data-* attributes: the house lint rule forbids
  // inline arrow props, and this keeps one stable callback per action.
  const handleMinePreset = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    mine(Number(event.currentTarget.dataset.count) || 1);
  }, [ mine ]);

  const handleMineCustom = React.useCallback(() => {
    mine(Number(blocks) || 1);
  }, [ mine, blocks ]);

  const travel = React.useCallback((seconds: number) => {
    return run('Time travel', async() => {
      await devnetApi.post('/anvil/time', { action: 'increaseTime', value: seconds });
      return `Advanced chain time by ${ seconds }s`;
    });
  }, [ run ]);

  const handleTravelPreset = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    travel(Number(event.currentTarget.dataset.seconds) || 0);
  }, [ travel ]);

  const handleTravelCustom = React.useCallback(() => {
    travel(Number(customSeconds) || 0);
  }, [ travel, customSeconds ]);

  const setIntervalMining = React.useCallback(() => {
    return run('Interval mining', async() => {
      const value = Number(intervalSeconds);
      await devnetApi.post('/anvil/time', { action: 'setIntervalMining', value });
      return value === 0 ? 'Interval mining disabled' : `Mining every ${ value }s`;
    });
  }, [ run, intervalSeconds ]);

  const toggleAutomine = React.useCallback((enabled: boolean) => {
    return run('Automine', async() => {
      await devnetApi.post('/anvil/time', { action: 'setAutomine', value: enabled });
      return `Automine ${ enabled ? 'enabled' : 'paused' }`;
    });
  }, [ run ]);

  const handlePauseAutomine = React.useCallback(() => toggleAutomine(false), [ toggleAutomine ]);
  const handleEnableAutomine = React.useCallback(() => toggleAutomine(true), [ toggleAutomine ]);

  const impersonate = React.useCallback(() => {
    return run('Impersonation', async() => {
      const address = impersonateAddress.trim();
      await devnetApi.post('/anvil/impersonate', { action: 'start', address });
      setImpersonated(address);
      return `Impersonating ${ address }`;
    });
  }, [ run, impersonateAddress ]);

  const stopImpersonation = React.useCallback(() => {
    return run('Impersonation', async() => {
      if (!impersonated) {
        return;
      }
      await devnetApi.post('/anvil/impersonate', { action: 'stop', address: impersonated });
      setImpersonated(null);
      return 'Stopped impersonation';
    });
  }, [ run, impersonated ]);

  const takeSnapshot = React.useCallback(() => {
    return run('Snapshot', async() => {
      const snapshot = await devnetApi.post<{ id: string; blockNumber: number }>(
        '/anvil/snapshot',
        { label: snapshotLabel.trim() || undefined },
      );
      setSnapshotLabel('');
      refetchSnapshots();
      return `Snapshot ${ snapshot.id } taken at block #${ snapshot.blockNumber }`;
    });
  }, [ run, snapshotLabel, refetchSnapshots ]);

  const revert = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const id = event.currentTarget.dataset.id;
    const label = event.currentTarget.dataset.label ?? id;
    return run('Revert', async() => {
      const result = await devnetApi.post<{ success: boolean; error?: string }>('/anvil/revert', { id });
      refetchSnapshots();
      return result.success ? `Reverted to "${ label }"` : (result.error ?? 'Snapshot no longer exists');
    });
  }, [ run, refetchSnapshots ]);

  return (
    <>
      <PageTitle title="EVM control" secondRow={ <DevNetStatusBar status={ status as NodeStatus } isLoading={ isLoading }/> }/>

      <Flex flexDir="column" gap={ 5 }>
        <DevNetSection title="Mining" description="Mine on demand, or change how often blocks are produced.">
          <Flex gap={ 3 } flexWrap="wrap" alignItems="flex-end">
            <Button size="sm" variant="outline" onClick={ handlePauseAutomine } loading={ isBusy }>Pause automine</Button>
            <Button size="sm" variant="outline" onClick={ handleEnableAutomine } loading={ isBusy }>Enable automine</Button>
            { [ 1, 5, 10 ].map((count) => (
              <Button key={ count } size="sm" variant="outline" data-count={ count } onClick={ handleMinePreset } loading={ isBusy }>
                Mine { count }
              </Button>
            )) }
            <Box w="120px"><DevNetField label="Blocks" value={ blocks } onChange={ setBlocks }/></Box>
            <Button size="sm" onClick={ handleMineCustom } loading={ isBusy }>Mine N</Button>
            <Box w="160px">
              <DevNetField label="Interval (s)" value={ intervalSeconds } onChange={ setIntervalSeconds } helperText="0 disables"/>
            </Box>
            <Button size="sm" variant="outline" onClick={ setIntervalMining } loading={ isBusy }>Apply interval</Button>
          </Flex>
        </DevNetSection>

        <DevNetSection title="Time travel" description="Move the chain clock forward to test time-locked logic.">
          <Flex gap={ 3 } flexWrap="wrap" alignItems="flex-end">
            { TIME_PRESETS.map(([ seconds, label ]) => (
              <Button key={ label } size="sm" variant="outline" data-seconds={ seconds } onClick={ handleTravelPreset } loading={ isBusy }>
                +{ label }
              </Button>
            )) }
            <Box w="180px"><DevNetField label="Custom (seconds)" value={ customSeconds } onChange={ setCustomSeconds }/></Box>
            <Button size="sm" onClick={ handleTravelCustom } loading={ isBusy } disabled={ !customSeconds.trim() }>
              Advance
            </Button>
          </Flex>
        </DevNetSection>

        <DevNetSection title="Impersonation" description="Send transactions as any address — no private key needed.">
          { impersonated ? (
            <Flex gap={ 3 } alignItems="center" flexWrap="wrap">
              <Tag colorPalette="orange">Active: { impersonated }</Tag>
              <Button size="sm" variant="outline" colorPalette="red" onClick={ stopImpersonation } loading={ isBusy }>Stop</Button>
            </Flex>
          ) : (
            <Flex gap={ 3 } alignItems="flex-end" flexWrap="wrap">
              <Box flex="1" minW="320px">
                <DevNetField label="Address" value={ impersonateAddress } onChange={ setImpersonateAddress } placeholder="0x…" isMono/>
              </Box>
              <Button size="sm" onClick={ impersonate } loading={ isBusy } disabled={ !impersonateAddress.trim() }>Start</Button>
            </Flex>
          ) }
        </DevNetSection>

        <DevNetSection
          title="Snapshots"
          description="Reverting consumes the snapshot and every snapshot taken after it."
          action={ <Tag variant="subtle">{ snapshots.length }</Tag> }
        >
          <Flex gap={ 3 } alignItems="flex-end" flexWrap="wrap" mb={ snapshots.length ? 4 : 0 }>
            <Box flex="1" minW="280px">
              <DevNetField label="Label" value={ snapshotLabel } onChange={ setSnapshotLabel } placeholder="before-deploy"/>
            </Box>
            <Button size="sm" onClick={ takeSnapshot } loading={ isBusy }>Take snapshot</Button>
          </Flex>

          <Grid gap={ 2 }>
            { snapshots.map((snapshot) => (
              <Flex
                key={ snapshot.id }
                alignItems="center"
                gap={ 3 }
                py={ 2 }
                borderBottomWidth="1px"
                borderColor="border.divider"
                flexWrap="wrap"
              >
                <Tag variant="subtle" fontFamily="mono">{ snapshot.id }</Tag>
                <Box flex="1" minW="120px">{ snapshot.label }</Box>
                <Box color="text.secondary" fontSize="sm" fontFamily="mono">block #{ snapshot.block_number }</Box>
                <Button
                  size="xs"
                  variant="outline"
                  data-id={ snapshot.id }
                  data-label={ snapshot.label }
                  onClick={ revert }
                  loading={ isBusy }
                >
                  Revert
                </Button>
              </Flex>
            )) }
            { snapshots.length === 0 && <Box color="text.secondary" fontSize="sm">No snapshots yet.</Box> }
          </Grid>
        </DevNetSection>
      </Flex>
    </>
  );
};

export default DevNetEvm;
