// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid } from '@chakra-ui/react';
import React from 'react';

import AddressEntity from 'src/slices/address/components/entity/AddressEntity';

import type { GasProfile } from 'src/features/devnet/api/traceAnalysis';

import {
  TableBody,
  TableCell,
  TableColumnHeader,
  TableHeader,
  TableRoot,
  TableRow,
} from 'src/toolkit/chakra/table';

interface Props {
  profile: GasProfile;
}

const BAR_COLORS: Record<string, string> = {
  'storage-write': 'red.500',
  'storage-read': 'yellow.500',
  call: 'blue.500',
  log: 'purple.500',
  memory: 'teal.500',
  compute: 'green.500',
  other: 'gray.500',
};

/** Where the gas went: fixed costs, then execution broken down by what it was spent on. */
const TxGasProfiler = ({ profile }: Props) => {
  const stats = [
    { label: 'Gas used', value: profile.gasUsed?.toLocaleString() ?? '—', hint: 'from the receipt' },
    { label: 'Intrinsic', value: profile.intrinsic.toLocaleString(), hint: '21,000 + calldata' },
    {
      label: 'Calldata',
      value: profile.calldata.gas.toLocaleString(),
      hint: `${ profile.calldata.nonZeroBytes } non-zero, ${ profile.calldata.zeroBytes } zero bytes`,
    },
    { label: 'Execution', value: profile.execution.toLocaleString(), hint: 'sum of opcode costs' },
    {
      label: profile.unaccounted !== null && profile.unaccounted < 0 ? 'Refunded' : 'Unaccounted',
      value: profile.unaccounted !== null ? Math.abs(profile.unaccounted).toLocaleString() : '—',
      hint: 'receipt − intrinsic − execution',
    },
  ];

  return (
    <Flex flexDir="column" gap={ 6 }>
      <Grid templateColumns={{ base: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' }} gap={ 3 }>
        { stats.map((stat) => (
          <Box key={ stat.label } borderWidth="1px" borderColor="border.divider" borderRadius="md" p={ 3 }>
            <Box color="text.secondary" fontSize="sm">{ stat.label }</Box>
            <Box fontSize="lg" fontWeight="500" fontFamily="mono">{ stat.value }</Box>
            <Box color="text.secondary" fontSize="xs" mt={ 1 }>{ stat.hint }</Box>
          </Box>
        )) }
      </Grid>

      <Box>
        <Box fontWeight="500" mb={ 3 }>Execution gas by category</Box>
        <Flex h="10px" borderRadius="full" overflow="hidden" mb={ 4 }>
          { profile.categories.map((category) => (
            <Box
              key={ category.key }
              w={ `${ Math.max(category.share * 100, 0.5) }%` }
              bgColor={ BAR_COLORS[category.key] ?? 'gray.500' }
            />
          )) }
        </Flex>

        <TableRoot>
          <TableHeader>
            <TableRow>
              <TableColumnHeader>Category</TableColumnHeader>
              <TableColumnHeader isNumeric>Operations</TableColumnHeader>
              <TableColumnHeader isNumeric>Gas</TableColumnHeader>
              <TableColumnHeader isNumeric>Share</TableColumnHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            { profile.categories.map((category) => (
              <TableRow key={ category.key }>
                <TableCell>
                  <Flex alignItems="center" gap={ 2 }>
                    <Box w="8px" h="8px" borderRadius="full" bgColor={ BAR_COLORS[category.key] ?? 'gray.500' }/>
                    { category.label }
                  </Flex>
                </TableCell>
                <TableCell isNumeric>{ category.count.toLocaleString() }</TableCell>
                <TableCell isNumeric fontFamily="mono">{ category.gas.toLocaleString() }</TableCell>
                <TableCell isNumeric>{ (category.share * 100).toFixed(1) }%</TableCell>
              </TableRow>
            )) }
          </TableBody>
        </TableRoot>
      </Box>

      <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={ 6 }>
        <Box>
          <Box fontWeight="500" mb={ 3 }>Most expensive opcodes</Box>
          <TableRoot>
            <TableHeader>
              <TableRow>
                <TableColumnHeader>Opcode</TableColumnHeader>
                <TableColumnHeader isNumeric>Count</TableColumnHeader>
                <TableColumnHeader isNumeric>Gas</TableColumnHeader>
                <TableColumnHeader isNumeric>Share</TableColumnHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              { profile.topOps.map((op) => (
                <TableRow key={ op.op }>
                  <TableCell fontFamily="mono">{ op.op }</TableCell>
                  <TableCell isNumeric>{ op.count.toLocaleString() }</TableCell>
                  <TableCell isNumeric fontFamily="mono">{ op.gas.toLocaleString() }</TableCell>
                  <TableCell isNumeric>{ (op.share * 100).toFixed(1) }%</TableCell>
                </TableRow>
              )) }
            </TableBody>
          </TableRoot>
        </Box>

        <Box>
          <Box fontWeight="500" mb={ 3 }>Gas per call frame</Box>
          <TableRoot>
            <TableHeader>
              <TableRow>
                <TableColumnHeader>Contract</TableColumnHeader>
                <TableColumnHeader isNumeric>Depth</TableColumnHeader>
                <TableColumnHeader isNumeric>Gas</TableColumnHeader>
                <TableColumnHeader isNumeric>Share</TableColumnHeader>
              </TableRow>
            </TableHeader>
            <TableBody>
              { profile.frames.map((frame) => (
                <TableRow key={ `${ frame.depth }:${ frame.address ?? '' }` }>
                  <TableCell>
                    { frame.address ?
                      <AddressEntity address={{ hash: frame.address }} truncation="constant" noIcon fontSize="sm"/> :
                      <Box color="text.secondary">unknown</Box> }
                  </TableCell>
                  <TableCell isNumeric>{ frame.depth }</TableCell>
                  <TableCell isNumeric fontFamily="mono">{ frame.gas.toLocaleString() }</TableCell>
                  <TableCell isNumeric>{ (frame.share * 100).toFixed(1) }%</TableCell>
                </TableRow>
              )) }
            </TableBody>
          </TableRoot>
        </Box>
      </Grid>

      <Box>
        <Box fontWeight="500" mb={ 3 }>Single costliest steps</Box>
        <TableRoot>
          <TableHeader>
            <TableRow>
              <TableColumnHeader>Step</TableColumnHeader>
              <TableColumnHeader>Opcode</TableColumnHeader>
              <TableColumnHeader>Contract</TableColumnHeader>
              <TableColumnHeader isNumeric>pc</TableColumnHeader>
              <TableColumnHeader isNumeric>Gas</TableColumnHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            { profile.topSteps.map((step) => (
              <TableRow key={ step.index }>
                <TableCell fontFamily="mono">#{ (step.index + 1).toLocaleString() }</TableCell>
                <TableCell fontFamily="mono">{ step.op }</TableCell>
                <TableCell>
                  { step.address ?
                    <AddressEntity address={{ hash: step.address }} truncation="constant" noIcon fontSize="sm"/> :
                    <Box color="text.secondary">—</Box> }
                </TableCell>
                <TableCell isNumeric fontFamily="mono">{ step.pc }</TableCell>
                <TableCell isNumeric fontFamily="mono">{ step.gas.toLocaleString() }</TableCell>
              </TableRow>
            )) }
          </TableBody>
        </TableRoot>
      </Box>

      <Box color="text.secondary" fontSize="sm">
        A call opcode&apos;s cost includes the gas it forwards, so only the call overhead is charged to the
        caller — the callee&apos;s opcodes are counted in its own frame. Refunds (clearing storage) land in
        the last stat above.
      </Box>
    </Flex>
  );
};

export default TxGasProfiler;
