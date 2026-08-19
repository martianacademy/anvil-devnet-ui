// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex } from '@chakra-ui/react';
import React from 'react';

import { analyzeRevert, inspectCalldata } from 'src/features/devnet/api/traceAnalysis';
import { useTxTrace } from 'src/features/devnet/api/useTxTrace';
import DevNetTraceError from 'src/features/devnet/components/DevNetTraceError';
import TraceLog from 'src/features/devnet/components/TraceLog';
import TxCalldataPanel from 'src/features/devnet/components/TxCalldataPanel';
import TxRevertBanner from 'src/features/devnet/components/TxRevertBanner';

import { route } from 'src/shared/router/routes';

import { Alert } from 'src/toolkit/chakra/alert';
import { Link } from 'src/toolkit/chakra/link';
import { Skeleton } from 'src/toolkit/chakra/skeleton';
import { Tag } from 'src/toolkit/chakra/tag';

interface Props {
  hash: string;
  to?: string | null;
}

/**
 * Execution trace of a devnet transaction, straight from debug_traceTransaction.
 * Blockscout's Anvil preset runs without the internal-transaction fetcher, so the
 * indexer has no call data of its own.
 */
const TxEvmTrace = ({ hash, to }: Props) => {
  const { data, isPending, error } = useTxTrace(hash, to);

  const revert = React.useMemo(() => {
    if (!data) {
      return null;
    }
    return analyzeRevert(data.steps, data.tx?.status === 'failed', data.abis, data.contexts);
  }, [ data ]);

  const calldata = React.useMemo(() => inspectCalldata(data?.tx?.input), [ data ]);

  if (isPending) {
    return (
      <Flex flexDir="column" gap={ 2 }>
        { Array.from({ length: 8 }).map((_, index) => <Skeleton key={ index } h="28px" loading/>) }
      </Flex>
    );
  }

  if (error || !data) {
    return <DevNetTraceError error={ error }/>;
  }

  if (data.entries.length === 0) {
    return <Alert status="warning">{ data.traceError ?? 'No trace available for this transaction.' }</Alert>;
  }

  const decodedParams = data.tx?.decoded_params ?
    Object.entries(data.tx.decoded_params).map(([ label, value ]) => ({ label, value: String(value) })) :
    undefined;

  return (
    <Flex flexDir="column" gap={ 4 }>
      { revert && <TxRevertBanner revert={ revert } hash={ hash }/> }
      { data.traceError && <Alert status="warning">{ data.traceError }</Alert> }

      <TxCalldataPanel
        view={ calldata }
        raw={ data.tx?.input }
        functionName={ data.tx?.decoded_function ?? undefined }
        params={ decodedParams }
      />

      <TraceLog
        entries={ data.entries }
        summary={ (
          <>
            <Tag colorPalette={ data.source === 'opcodes' ? 'green' : 'orange' }>
              { data.source === 'opcodes' ? 'opcode trace' : 'call trace only' }
            </Tag>
            <Link href={ route({ pathname: '/devnet/debugger', query: { hash } }) } fontSize="sm" noIcon>
              Step through it →
            </Link>
            <Box color="border.divider">|</Box>
          </>
        ) }
      />
    </Flex>
  );
};

export default TxEvmTrace;
