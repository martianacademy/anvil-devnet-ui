// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex } from '@chakra-ui/react';
import React from 'react';

import type { CallNode } from 'src/features/devnet/api/trace';

import { Tag } from 'src/toolkit/chakra/tag';

const TYPE_COLORS: Record<string, string> = {
  CALL: 'blue',
  DELEGATECALL: 'purple',
  STATICCALL: 'teal',
  CREATE: 'orange',
  CREATE2: 'orange',
};

function formatValue(value?: string): string | null {
  if (!value || value === '0x0' || value === '0x') {
    return null;
  }
  try {
    const wei = BigInt(value);
    if (wei === BigInt(0)) {
      return null;
    }
    const wad = BigInt(10) ** BigInt(18);
    const whole = wei / wad;
    const fraction = (wei % wad).toString().padStart(18, '0').replace(/0+$/, '').slice(0, 6);
    return `${ whole }${ fraction ? `.${ fraction }` : '' } ETH`;
  } catch {
    return value;
  }
}

interface Props {
  node: CallNode;
  depth?: number;
}

/** Nested CALL / DELEGATECALL / STATICCALL tree from the callTracer output. */
const DevNetCallTree = ({ node, depth = 0 }: Props) => {
  const callPalette = node.error ? 'red' : (TYPE_COLORS[node.type] ?? 'gray');
  const value = formatValue(node.value);
  const selector = node.input && node.input.length >= 10 ? node.input.slice(0, 10) : null;

  return (
    <Box pl={ depth === 0 ? 0 : 4 } borderLeftWidth={ depth === 0 ? 0 : '1px' } borderColor="border.divider">
      <Flex alignItems="center" gap={ 2 } py={ 1 } flexWrap="wrap" fontSize="sm">
        <Tag colorPalette={ callPalette }>{ node.type }</Tag>
        <Box fontFamily="mono" color="text.secondary" whiteSpace="nowrap">
          { node.from?.slice(0, 10) }… →{ ' ' }
          <Box as="span" color="text.primary">{ node.to ? `${ node.to.slice(0, 10) }…` : 'contract creation' }</Box>
        </Box>
        { selector && <Box fontFamily="mono" color="purple.400">{ selector }</Box> }
        { value && <Tag variant="subtle">{ value }</Tag> }
        { node.gasUsed && (
          <Box color="text.secondary" fontFamily="mono" fontSize="xs">
            gas { Number(BigInt(node.gasUsed)).toLocaleString() }
          </Box>
        ) }
        { node.error && <Tag colorPalette="red">{ node.error }</Tag> }
      </Flex>
      { (node.calls ?? []).map((child, index) => (
        <DevNetCallTree key={ index } node={ child } depth={ depth + 1 }/>
      )) }
    </Box>
  );
};

export default DevNetCallTree;
