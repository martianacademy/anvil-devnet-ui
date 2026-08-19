// SPDX-License-Identifier: LicenseRef-Blockscout

import { Flex } from '@chakra-ui/react';
import React from 'react';

import { profileGas } from 'src/features/devnet/api/traceAnalysis';
import { useTxTrace } from 'src/features/devnet/api/useTxTrace';
import DevNetTraceError from 'src/features/devnet/components/DevNetTraceError';
import TxGasProfiler from 'src/features/devnet/components/TxGasProfiler';

import { Alert } from 'src/toolkit/chakra/alert';
import { Skeleton } from 'src/toolkit/chakra/skeleton';

interface Props {
  hash: string;
  to?: string | null;
}

const TxGasProfilerTab = ({ hash, to }: Props) => {
  const { data, isPending, error } = useTxTrace(hash, to);

  const profile = React.useMemo(() => {
    if (!data) {
      return null;
    }
    return profileGas({
      steps: data.steps,
      contexts: data.contexts,
      input: data.tx?.input,
      gasUsed: data.tx?.gasUsed ? Number(BigInt(data.tx.gasUsed)) : null,
      isCreate: !data.tx?.to,
    });
  }, [ data ]);

  if (isPending) {
    return (
      <Flex flexDir="column" gap={ 3 }>
        { Array.from({ length: 6 }).map((_, index) => <Skeleton key={ index } h="40px" loading/>) }
      </Flex>
    );
  }

  if (error || !data) {
    return <DevNetTraceError error={ error }/>;
  }

  if (data.steps.length === 0 || !profile) {
    return (
      <Alert status="warning">
        Gas profiling needs an opcode trace — start Anvil with step tracing (the DevNet control page does this by default).
      </Alert>
    );
  }

  return <TxGasProfiler profile={ profile }/>;
};

export default TxGasProfilerTab;
