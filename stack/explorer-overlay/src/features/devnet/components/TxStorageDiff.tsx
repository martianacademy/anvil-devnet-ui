// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex } from '@chakra-ui/react';
import React from 'react';

import AddressEntity from 'src/slices/address/components/entity/AddressEntity';

import type { StorageDiffRow } from 'src/features/devnet/api/traceAnalysis';

import CopyToClipboard from 'src/shared/texts/CopyToClipboard';

import { Badge } from 'src/toolkit/chakra/badge';

interface Props {
  rows: Array<StorageDiffRow>;
}

function toDecimal(value: string): string | null {
  try {
    const parsed = BigInt(value);
    return parsed === BigInt(0) ? null : parsed.toLocaleString('en-US');
  } catch {
    return null;
  }
}

const ValueCell = ({ label, value, tone }: { label: string; value: string; tone?: string }) => {
  const decimal = toDecimal(value);
  return (
    <Box minW={ 0 }>
      <Box color="text.secondary" fontSize="xs" mb="2px">{ label }</Box>
      <Flex alignItems="center" gap={ 1 } minW={ 0 }>
        <Box fontFamily="mono" fontSize="xs" wordBreak="break-all" color={ tone }>{ value }</Box>
        <CopyToClipboard text={ value } boxSize={ 4 }/>
      </Flex>
      { decimal && <Box color="text.secondary" fontSize="xs" mt="2px">{ decimal }</Box> }
    </Box>
  );
};

/**
 * Net storage changes: one row per slot with the value it started and ended on,
 * not the chronological SSTORE list. Slots are named when they match the
 * `keccak(key ++ slot)` layout Solidity uses for mappings.
 */
const TxStorageDiff = ({ rows }: Props) => {
  if (rows.length === 0) {
    return (
      <Box borderWidth="1px" borderColor="border.divider" borderRadius="md" p={ 8 } textAlign="center" color="text.secondary">
        This transaction changed no storage.
      </Box>
    );
  }

  const byContract = new Map<string, Array<StorageDiffRow>>();
  for (const row of rows) {
    const key = row.address ?? 'unknown';
    byContract.set(key, [ ...(byContract.get(key) ?? []), row ]);
  }

  return (
    <Flex flexDir="column" gap={ 4 }>
      { [ ...byContract.entries() ].map(([ address, contractRows ]) => (
        <Box key={ address } borderWidth="1px" borderColor="border.divider" borderRadius="md" overflow="hidden">
          <Flex
            alignItems="center"
            gap={ 2 }
            px={ 3 }
            py={ 2 }
            bgColor="bg.subtle"
            borderBottomWidth="1px"
            borderColor="border.divider"
            flexWrap="wrap"
          >
            { address === 'unknown' ?
              <Box color="text.secondary">Unknown contract</Box> :
              <AddressEntity address={{ hash: address }} truncation="constant"/> }
            <Badge colorPalette="gray">{ contractRows.length } slot{ contractRows.length === 1 ? '' : 's' }</Badge>
          </Flex>

          { contractRows.map((row) => (
            <Box
              key={ row.slot }
              px={ 3 }
              py={ 3 }
              borderBottomWidth="1px"
              borderColor="border.divider"
              _last={{ borderBottomWidth: 0 }}
            >
              <Flex alignItems="center" gap={ 2 } mb={ 2 } flexWrap="wrap">
                <Box color="text.secondary" fontSize="sm">slot</Box>
                <Box fontFamily="mono" fontSize="xs" wordBreak="break-all">{ row.slot }</Box>
                <CopyToClipboard text={ row.slot } boxSize={ 4 }/>
                { row.label && <Badge colorPalette="blue">{ row.label }</Badge> }
                { row.writes > 1 && <Badge colorPalette="orange">{ row.writes } writes</Badge> }
              </Flex>

              <Flex gap={ 6 } flexWrap="wrap">
                <ValueCell label="Before" value={ row.before }/>
                <ValueCell label="After" value={ row.after } tone="text.error"/>
              </Flex>
            </Box>
          )) }
        </Box>
      )) }
    </Flex>
  );
};

export default TxStorageDiff;
