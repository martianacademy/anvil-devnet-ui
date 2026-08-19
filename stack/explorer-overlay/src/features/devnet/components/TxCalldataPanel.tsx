// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid } from '@chakra-ui/react';
import React from 'react';

import type { CalldataView } from 'src/features/devnet/api/traceAnalysis';
import type { DecodedParam } from 'src/features/devnet/api/traceEntries';

import CopyToClipboard from 'src/shared/texts/CopyToClipboard';

import { Badge } from 'src/toolkit/chakra/badge';
import { Button } from 'src/toolkit/chakra/button';

interface Props {
  view: CalldataView;
  functionName?: string;
  params?: Array<DecodedParam>;
  raw?: string | null;
}

/**
 * Calldata, decoded when an ABI is available and word-by-word when it is not —
 * the 32-byte view is what you fall back to on an unverified contract.
 */
const TxCalldataPanel = ({ view, functionName, params, raw }: Props) => {
  const [ showWords, setShowWords ] = React.useState(false);
  const handleToggle = React.useCallback(() => setShowWords((value) => !value), []);

  if (!raw || raw === '0x') {
    return null;
  }

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
        bgColor="bg.subtle"
      >
        <Box fontWeight="500">Calldata</Box>
        { view.selector && <Badge colorPalette="purple" fontFamily="mono">{ view.selector }</Badge> }
        { functionName && <Badge colorPalette="green" fontFamily="mono">{ functionName }</Badge> }
        <Box color="text.secondary" fontSize="sm">{ view.byteLength } bytes · { view.words.length } words</Box>
        <Flex ml="auto" gap={ 2 } alignItems="center">
          <CopyToClipboard text={ raw } boxSize={ 5 }/>
          <Button size="xs" variant="outline" onClick={ handleToggle }>
            { showWords ? 'Hide words' : 'Show 32-byte words' }
          </Button>
        </Flex>
      </Flex>

      { params && params.length > 0 && (
        <Grid templateColumns={{ base: '1fr', md: '200px 1fr' }} gap={ 2 } px={ 3 } py={ 3 }>
          { params.map((param, index) => (
            <React.Fragment key={ param.label + index }>
              <Box color="text.secondary" fontFamily="mono" fontSize="sm">{ param.label }</Box>
              <Box fontFamily="mono" fontSize="sm" wordBreak="break-all">{ param.value }</Box>
            </React.Fragment>
          )) }
        </Grid>
      ) }

      { showWords && (
        <Box borderTopWidth="1px" borderColor="border.divider">
          { view.words.map((word) => (
            <Flex
              key={ word.offset }
              gap={ 3 }
              px={ 3 }
              py="6px"
              borderBottomWidth="1px"
              borderColor="border.divider"
              _last={{ borderBottomWidth: 0 }}
              fontFamily="mono"
              fontSize="xs"
              alignItems="center"
              flexWrap="wrap"
            >
              <Box color="text.secondary" w="52px" flexShrink={ 0 }>+{ word.offset }</Box>
              <Box wordBreak="break-all" flex="1" minW="280px">{ word.hex }</Box>
              <Box color="text.secondary" minW="220px">{ word.guess }</Box>
            </Flex>
          )) }
        </Box>
      ) }
    </Box>
  );
};

export default TxCalldataPanel;
