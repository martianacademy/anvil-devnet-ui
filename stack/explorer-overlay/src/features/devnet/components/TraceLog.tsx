// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex } from '@chakra-ui/react';
import React from 'react';

import type { TraceEntry, TraceFilters } from 'src/features/devnet/api/traceEntries';
import { filterEntries } from 'src/features/devnet/api/traceEntries';
import TraceLogRow from 'src/features/devnet/components/TraceLogRow';

import SpriteIcon from 'src/sprite/SpriteIcon';

import { Button } from 'src/toolkit/chakra/button';
import { Checkbox } from 'src/toolkit/chakra/checkbox';
import { Input } from 'src/toolkit/chakra/input';
import { InputGroup } from 'src/toolkit/chakra/input-group';
import { Tag } from 'src/toolkit/chakra/tag';

const MAX_RENDERED_ROWS = 3000;

interface Props {
  entries: Array<TraceEntry>;
  summary?: React.ReactNode;
}

/**
 * Execution trace: every call, storage access and event in order, indented by call
 * depth. Rows expand to show the values the compact line has to truncate.
 */
const TraceLog = ({ entries, summary }: Props) => {
  const [ filters, setFilters ] = React.useState<TraceFilters>({
    showGas: true,
    showFullTrace: false,
    showStorage: true,
    showEvents: true,
    search: '',
  });
  const [ expanded, setExpanded ] = React.useState<Set<number>>(new Set());

  const handleSearch = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setFilters((current) => ({ ...current, search: event.target.value }));
  }, []);

  const toggle = React.useCallback((key: 'showGas' | 'showFullTrace' | 'showStorage' | 'showEvents') => {
    setFilters((current) => ({ ...current, [key]: !current[key] }));
  }, []);

  const toggleGas = React.useCallback(() => toggle('showGas'), [ toggle ]);
  const toggleFullTrace = React.useCallback(() => toggle('showFullTrace'), [ toggle ]);
  const toggleStorage = React.useCallback(() => toggle('showStorage'), [ toggle ]);
  const toggleEvents = React.useCallback(() => toggle('showEvents'), [ toggle ]);

  const visible = React.useMemo(() => filterEntries(entries, filters), [ entries, filters ]);
  const rendered = visible.slice(0, MAX_RENDERED_ROWS);

  const handleToggleRow = React.useCallback((idx: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }, []);

  const handleExpandAll = React.useCallback(() => {
    setExpanded(new Set(rendered.map((entry) => entry.idx)));
  }, [ rendered ]);

  const handleCollapseAll = React.useCallback(() => setExpanded(new Set()), []);

  const counts = React.useMemo(() => ({
    calls: entries.filter((entry) => [ 'CALL', 'DELEGATECALL', 'STATICCALL', 'CREATE' ].includes(entry.kind)).length,
    reads: entries.filter((entry) => entry.kind === 'SLOAD').length,
    writes: entries.filter((entry) => entry.kind === 'SSTORE').length,
    logs: entries.filter((entry) => entry.kind === 'LOG').length,
  }), [ entries ]);

  return (
    <Box borderWidth="1px" borderColor="border.divider" borderRadius="md" overflow="hidden">
      <Flex
        alignItems="center"
        gap={ 3 }
        px={ 3 }
        py={ 2 }
        flexWrap="wrap"
        borderBottomWidth="1px"
        borderColor="border.divider"
      >
        <Box minW="240px" flex="1">
          <InputGroup startElement={ <SpriteIcon name="search" boxSize={ 5 } color="icon.secondary"/> }>
            <Input size="sm" placeholder="Filter by opcode, address or slot" value={ filters.search } onChange={ handleSearch }/>
          </InputGroup>
        </Box>

        <Flex gap={ 4 } flexWrap="wrap" alignItems="center">
          <Checkbox size="sm" checked={ filters.showGas } onCheckedChange={ toggleGas }>Gas</Checkbox>
          <Checkbox size="sm" checked={ filters.showFullTrace } onCheckedChange={ toggleFullTrace }>Full trace</Checkbox>
          <Checkbox size="sm" checked={ filters.showStorage } onCheckedChange={ toggleStorage }>Storage</Checkbox>
          <Checkbox size="sm" checked={ filters.showEvents } onCheckedChange={ toggleEvents }>Events</Checkbox>
        </Flex>

        <Flex gap={ 2 }>
          <Button size="xs" variant="outline" onClick={ handleExpandAll }>Expand all</Button>
          <Button size="xs" variant="outline" onClick={ handleCollapseAll }>Collapse</Button>
        </Flex>
      </Flex>

      <Flex
        gap={ 2 }
        px={ 3 }
        py={ 2 }
        flexWrap="wrap"
        alignItems="center"
        borderBottomWidth="1px"
        borderColor="border.divider"
        bgColor="bg.subtle"
      >
        { summary }
        <Tag variant="subtle">{ counts.calls } calls</Tag>
        <Tag variant="subtle">{ counts.reads } reads</Tag>
        <Tag variant="subtle">{ counts.writes } writes</Tag>
        <Tag variant="subtle">{ counts.logs } events</Tag>
        <Box color="text.secondary" fontSize="sm" ml="auto">
          { visible.length.toLocaleString() } of { entries.length.toLocaleString() } rows
        </Box>
      </Flex>

      <Box maxH="720px" overflowY="auto">
        { rendered.length === 0 ? (
          <Box p={ 8 } textAlign="center" color="text.secondary" fontSize="sm">
            Nothing matches these filters — turn on “Full trace” to see every opcode.
          </Box>
        ) : (
          rendered.map((entry) => (
            <TraceLogRow
              key={ entry.idx }
              entry={ entry }
              filters={ filters }
              isExpanded={ expanded.has(entry.idx) }
              onToggle={ handleToggleRow }
            />
          ))
        ) }
      </Box>

      { visible.length > rendered.length && (
        <Box px={ 3 } py={ 2 } fontSize="xs" color="text.secondary" borderTopWidth="1px" borderColor="border.divider">
          Showing the first { MAX_RENDERED_ROWS.toLocaleString() } rows — narrow the filters to see the rest.
        </Box>
      ) }
    </Box>
  );
};

export default TraceLog;
