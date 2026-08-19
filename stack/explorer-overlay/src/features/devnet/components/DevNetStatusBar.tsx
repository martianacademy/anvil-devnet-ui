// SPDX-License-Identifier: LicenseRef-Blockscout

import { Flex, Box } from '@chakra-ui/react';
import React from 'react';

import type { NodeStatus } from 'src/features/devnet/api/types';

import { Skeleton } from 'src/toolkit/chakra/skeleton';
import { Tag } from 'src/toolkit/chakra/tag';

interface Props {
  status: NodeStatus;
  isLoading?: boolean;
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) {
    return '—';
  }
  if (seconds < 60) {
    return `${ seconds }s`;
  }
  if (seconds < 3600) {
    return `${ Math.floor(seconds / 60) }m ${ seconds % 60 }s`;
  }
  return `${ Math.floor(seconds / 3600) }h ${ Math.floor((seconds % 3600) / 60) }m`;
}

/** One-line summary of the node the control plane is talking to. */
const DevNetStatusBar = ({ status, isLoading }: Props) => {
  // "managed" means this app spawned the process; an external node is one someone
  // started in a terminal, which we can observe but not stop.
  let runLabel = 'Stopped';
  if (status.running) {
    runLabel = status.managed ? 'Running (managed)' : 'Running (external)';
  }

  const items: Array<{ label: string; value: string }> = [
    { label: 'Chain', value: status.chainId ? String(status.chainId) : '—' },
    { label: 'Port', value: String(status.port) },
    { label: 'Block', value: status.blockNumber.toLocaleString() },
    { label: 'Uptime', value: status.managed ? formatUptime(status.uptime) : '—' },
    { label: 'RPC', value: status.rpcUrl || '—' },
  ];

  return (
    <Skeleton loading={ isLoading }>
      <Flex alignItems="center" gap={ 2 } flexWrap="wrap">
        <Tag colorPalette={ status.running ? 'green' : 'gray' }>{ runLabel }</Tag>
        { items.map((item) => (
          <Tag key={ item.label } variant="subtle">
            <Box as="span" color="text.secondary" mr={ 1 }>{ item.label }</Box>
            { item.value }
          </Tag>
        )) }
        { status.projectId && (
          <Tag colorPalette="blue">Project { status.projectId }</Tag>
        ) }
      </Flex>
    </Skeleton>
  );
};

export default DevNetStatusBar;
