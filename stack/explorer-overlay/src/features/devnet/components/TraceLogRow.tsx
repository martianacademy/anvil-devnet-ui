// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid } from '@chakra-ui/react';
import React from 'react';

import AddressEntity from 'src/slices/address/components/entity/AddressEntity';

import type { TraceEntry, TraceFilters } from 'src/features/devnet/api/traceEntries';
import { shortHex } from 'src/features/devnet/api/traceEntries';

import CopyToClipboard from 'src/shared/texts/CopyToClipboard';
import SpriteIcon from 'src/sprite/SpriteIcon';

import type { BadgeProps } from 'src/toolkit/chakra/badge';
import { Badge } from 'src/toolkit/chakra/badge';

// Taken from the Badge itself rather than widened to string: the theme owns the
// palette names, so a rename upstream should break here, not render a blank badge.
type BadgePalette = NonNullable<BadgeProps['colorPalette']>;

const KIND_PALETTE: Record<string, BadgePalette> = {
  CALL: 'blue',
  DELEGATECALL: 'purple',
  STATICCALL: 'teal',
  CREATE: 'orange',
  SLOAD: 'yellow',
  SSTORE: 'red',
  LOG: 'purple',
  JUMP: 'gray',
  RETURN: 'green',
  REVERT: 'red',
  OTHER: 'gray',
};

const KIND_LABELS: Record<string, string> = {
  DELEGATECALL: 'DELEGATE',
  STATICCALL: 'STATIC',
};

const INDENT_PX = 16;

interface Props {
  entry: TraceEntry;
  filters: TraceFilters;
  isExpanded: boolean;
  onToggle: (idx: number) => void;
}

/** One line of the trace log — click it to see the untruncated values. */
const TraceLogRow = ({ entry, filters, isExpanded, onToggle }: Props) => {
  const handleClick = React.useCallback(() => onToggle(entry.idx), [ onToggle, entry.idx ]);

  const details = buildDetails(entry);
  const canExpand = details.length > 0;

  return (
    <Box borderBottomWidth="1px" borderColor="border.divider" _last={{ borderBottomWidth: 0 }}>
      <Flex
        alignItems="center"
        gap={ 3 }
        px={ 3 }
        py="5px"
        fontSize="sm"
        cursor={ canExpand ? 'pointer' : 'default' }
        _hover={{ bgColor: 'hover.bg' }}
        onClick={ canExpand ? handleClick : undefined }
      >
        <Badge colorPalette={ KIND_PALETTE[entry.kind] ?? 'gray' } minW="76px" justifyContent="center" flexShrink={ 0 }>
          { KIND_LABELS[entry.kind] ?? entry.kind }
        </Badge>

        { filters.showGas && (
          <Box flexShrink={ 0 } w="64px" textAlign="right" color="text.secondary" fontFamily="mono" fontSize="xs">
            { entry.gasCost > 0 ? entry.gasCost.toLocaleString() : '—' }
          </Box>
        ) }

        <Flex flex="1" minW={ 0 } alignItems="center" gap={ 1 } pl={ `${ (entry.depth - 1) * INDENT_PX }px` } overflow="hidden">
          <TraceLogContent entry={ entry }/>
        </Flex>

        { canExpand && (
          <SpriteIcon
            name="arrows/east-mini"
            boxSize={ 5 }
            color="icon.secondary"
            flexShrink={ 0 }
            transform={ isExpanded ? 'rotate(270deg)' : 'rotate(90deg)' }
            transitionDuration="faster"
          />
        ) }
      </Flex>

      { isExpanded && (
        <Grid
          templateColumns={{ base: '1fr', lg: '150px 1fr' }}
          gap={ 2 }
          px={ 3 }
          py={ 3 }
          bgColor="bg.subtle"
          borderTopWidth="1px"
          borderColor="border.divider"
          fontSize="sm"
        >
          { details.map((detail) => (
            <React.Fragment key={ detail.label }>
              <Box color="text.secondary">{ detail.label }</Box>
              <Flex alignItems="flex-start" gap={ 1 } minW={ 0 }>
                <Box fontFamily="mono" fontSize="xs" wordBreak="break-all">{ detail.value }</Box>
                { detail.copy !== false && <CopyToClipboard text={ detail.value } boxSize={ 4 }/> }
              </Flex>
            </React.Fragment>
          )) }
        </Grid>
      ) }
    </Box>
  );
};

interface Detail {
  label: string;
  value: string;
  copy?: boolean;
}

/** Everything the compact row had to truncate, in full. */
function buildDetails(entry: TraceEntry): Array<Detail> {
  const details: Array<Detail> = [];

  if (entry.context) {
    details.push({ label: 'Executing contract', value: entry.context });
  }
  if (entry.from) {
    details.push({ label: 'Caller', value: entry.from });
  }
  if (entry.to) {
    details.push({ label: 'Target', value: entry.to });
  }
  if (entry.slot) {
    details.push({ label: 'Storage slot', value: entry.slot });
  }
  if (entry.previousValue !== undefined) {
    details.push({ label: 'Value before', value: entry.previousValue });
  }
  if (entry.value !== undefined) {
    details.push({ label: entry.kind === 'SSTORE' ? 'Value after' : 'Value', value: entry.value });
    const decimal = toDecimal(entry.value);
    if (decimal) {
      details.push({ label: 'Value (decimal)', value: decimal });
    }
  }
  if (entry.callValue && entry.callValue !== '0x0') {
    details.push({ label: 'ETH value (wei)', value: toDecimal(entry.callValue) ?? entry.callValue });
  }
  if (entry.input && entry.input !== '0x') {
    details.push({ label: 'Calldata', value: entry.input });
  }
  entry.topics?.forEach((topic, index) => {
    details.push({ label: `Topic ${ index }`, value: topic });
  });
  if (entry.logData && entry.logData !== '0x') {
    details.push({ label: 'Log data', value: entry.logData });
  }
  if (entry.decodedCallParams?.length) {
    details.push({
      label: 'Decoded args',
      value: entry.decodedCallParams.map((param) => `${ param.label }: ${ param.value }`).join(', '),
    });
  }
  if (entry.decodedEventParams?.length) {
    details.push({
      label: 'Decoded args',
      value: entry.decodedEventParams.map((param) => `${ param.label } = ${ param.value }`).join(', '),
    });
  }
  if (entry.idx >= 0) {
    details.push({ label: 'Program counter', value: `pc ${ entry.pc } · step ${ entry.idx + 1 } · depth ${ entry.depth }`, copy: false });
  }
  if (entry.gas > 0) {
    details.push({ label: 'Gas remaining', value: entry.gas.toLocaleString(), copy: false });
  }

  return details;
}

function toDecimal(value: string): string | null {
  try {
    const parsed = BigInt(value);
    return parsed > BigInt(0) ? parsed.toLocaleString('en-US').replace(/,/g, ' ') : null;
  } catch {
    return null;
  }
}

/** Compact, address-aware rendering of a single operation. */
const TraceLogContent = ({ entry }: { entry: TraceEntry }) => {
  switch (entry.kind) {
    case 'CALL':
    case 'DELEGATECALL':
    case 'STATICCALL':
      return <CallContent entry={ entry }/>;
    case 'CREATE':
      return (
        <Flex alignItems="center" gap={ 1 } minW={ 0 }>
          <Box color="text.secondary">creates</Box>
          { entry.to && <AddressEntity address={{ hash: entry.to }} truncation="constant" noIcon fontSize="sm"/> }
        </Flex>
      );
    case 'SLOAD':
      return <StorageContent entry={ entry } isWrite={ false }/>;
    case 'SSTORE':
      return <StorageContent entry={ entry } isWrite/>;
    case 'LOG':
      return <LogContent entry={ entry }/>;
    case 'REVERT':
      return <Box color="text.error" fontWeight="500">execution reverted</Box>;
    case 'RETURN':
      return <Box color="green.500">{ entry.op === 'STOP' ? 'end of execution' : 'returned to caller' }</Box>;
    default:
      return (
        <Box color="text.secondary" fontFamily="mono" fontSize="xs">
          { entry.op } · pc { entry.pc }
        </Box>
      );
  }
};

const CallContent = ({ entry }: { entry: TraceEntry }) => {
  const selector = !entry.decoded && entry.input && entry.input.length >= 10 ? entry.input.slice(0, 10) : null;

  return (
    <Flex alignItems="center" gap={ 1 } minW={ 0 } overflow="hidden">
      { entry.from && (
        <>
          <AddressEntity address={{ hash: entry.from }} truncation="constant" noIcon noCopy fontSize="sm" color="text.secondary"/>
          <Box color="text.secondary" flexShrink={ 0 }>→</Box>
        </>
      ) }
      { entry.to && <AddressEntity address={{ hash: entry.to }} truncation="constant" noIcon noCopy fontSize="sm"/> }
      { entry.decoded && (
        <Flex alignItems="center" gap={ 0 } minW={ 0 } overflow="hidden" whiteSpace="nowrap">
          <Box color="text.secondary">.</Box>
          <Box color="green.500" fontWeight="500" fontFamily="mono">{ entry.decoded }</Box>
          <Box color="text.secondary" fontFamily="mono" textOverflow="ellipsis" overflow="hidden">
            ({ (entry.decodedCallParams ?? []).map((param) => `${ param.label }: ${ param.value }`).join(', ') })
          </Box>
        </Flex>
      ) }
      { selector && <Box color="purple.400" fontFamily="mono" fontSize="xs" flexShrink={ 0 }>{ selector }</Box> }
      { entry.error && <Badge colorPalette="red" flexShrink={ 0 }>reverted</Badge> }
    </Flex>
  );
};

const StorageContent = ({ entry, isWrite }: { entry: TraceEntry; isWrite: boolean }) => (
  <Flex alignItems="center" gap={ 1 } minW={ 0 } fontFamily="mono" fontSize="xs" whiteSpace="nowrap" overflow="hidden">
    { entry.context && (
      <AddressEntity address={{ hash: entry.context }} truncation="constant" noIcon noCopy fontSize="xs" color="text.secondary"/>
    ) }
    <Box color="text.secondary">slot</Box>
    <Box color="yellow.600" _dark={{ color: 'yellow.300' }}>{ shortHex(entry.slot ?? '', 14) }</Box>
    { isWrite ? (
      <>
        <Box color="text.secondary">{ shortHex(entry.previousValue ?? '0x0', 12) }</Box>
        <Box color="text.secondary">→</Box>
        <Box color="text.error" fontWeight="500">{ shortHex(entry.value ?? '', 14) }</Box>
      </>
    ) : (
      <>
        <Box color="text.secondary">=</Box>
        <Box>{ shortHex(entry.value ?? '', 14) }</Box>
      </>
    ) }
  </Flex>
);

const LogContent = ({ entry }: { entry: TraceEntry }) => (
  <Flex alignItems="center" gap={ 1 } minW={ 0 } overflow="hidden" whiteSpace="nowrap">
    { entry.context && (
      <AddressEntity address={{ hash: entry.context }} truncation="constant" noIcon noCopy fontSize="sm" color="text.secondary"/>
    ) }
    { entry.decoded ? (
      <Flex alignItems="center" minW={ 0 } overflow="hidden" fontFamily="mono">
        <Box color="purple.500" _dark={{ color: 'purple.300' }} fontWeight="500">{ entry.decoded }</Box>
        <Box color="text.secondary" textOverflow="ellipsis" overflow="hidden">
          ({ (entry.decodedEventParams ?? []).map((param) => `${ param.label } = ${ param.value }`).join(', ') })
        </Box>
      </Flex>
    ) : (
      <Box color="text.secondary" fontFamily="mono" fontSize="xs">
        { entry.op } · topic0 { shortHex(entry.topics?.[0] ?? '', 14) }
      </Box>
    ) }
  </Flex>
);

export default TraceLogRow;
