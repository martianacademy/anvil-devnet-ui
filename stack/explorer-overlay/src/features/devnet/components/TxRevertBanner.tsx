// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex } from '@chakra-ui/react';
import React from 'react';

import AddressEntity from 'src/slices/address/components/entity/AddressEntity';

import type { RevertInfo } from 'src/features/devnet/api/traceAnalysis';

import { route } from 'src/shared/router/routes';
import CopyToClipboard from 'src/shared/texts/CopyToClipboard';

import { Alert } from 'src/toolkit/chakra/alert';
import { Badge } from 'src/toolkit/chakra/badge';
import { Link } from 'src/toolkit/chakra/link';

const KIND_LABELS: Record<RevertInfo['kind'], string> = {
  'error-string': 'require / revert',
  panic: 'Solidity panic',
  'custom-error': 'custom error',
  raw: 'revert',
  'invalid-opcode': 'invalid opcode',
  'out-of-gas': 'out of gas',
  unknown: 'failed',
};

interface Props {
  revert: RevertInfo;
  hash: string;
}

/** Why the transaction failed, and exactly where. */
const TxRevertBanner = ({ revert, hash }: Props) => {
  return (
    <Alert status="error" alignItems="flex-start">
      <Flex flexDir="column" gap={ 2 } w="100%">
        <Flex alignItems="center" gap={ 2 } flexWrap="wrap">
          <Badge colorPalette="red">{ KIND_LABELS[revert.kind] }</Badge>
          <Box fontWeight="500">{ revert.message }</Box>
        </Flex>

        { revert.detail && <Box fontSize="sm" color="text.secondary">{ revert.detail }</Box> }

        <Flex alignItems="center" gap={ 4 } flexWrap="wrap" fontSize="sm">
          { revert.address && (
            <Flex alignItems="center" gap={ 1 }>
              <Box color="text.secondary">reverted in</Box>
              <AddressEntity address={{ hash: revert.address }} truncation="constant" noIcon fontSize="sm"/>
            </Flex>
          ) }
          { revert.pc !== undefined && (
            <Box color="text.secondary" fontFamily="mono">pc { revert.pc } · depth { revert.depth }</Box>
          ) }
          { revert.stepIndex !== undefined && (
            <Link href={ route({ pathname: '/devnet/debugger', query: { hash } }) } noIcon>
              Open step { revert.stepIndex + 1 } in the debugger →
            </Link>
          ) }
        </Flex>

        { revert.rawData && revert.rawData !== '0x' && (
          <Flex alignItems="center" gap={ 1 } minW={ 0 }>
            <Box color="text.secondary" fontSize="sm">raw:</Box>
            <Box fontFamily="mono" fontSize="xs" wordBreak="break-all">{ revert.rawData }</Box>
            <CopyToClipboard text={ revert.rawData } boxSize={ 4 }/>
          </Flex>
        ) }
      </Flex>
    </Alert>
  );
};

export default TxRevertBanner;
