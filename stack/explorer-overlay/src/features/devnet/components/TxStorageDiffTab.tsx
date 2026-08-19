// SPDX-License-Identifier: LicenseRef-Blockscout

import { Flex } from '@chakra-ui/react';
import React from 'react';

import { labelStorageSlots, netStorageDiff } from 'src/features/devnet/api/traceAnalysis';
import { collectAddresses } from 'src/features/devnet/api/traceEntries';
import { useTxTrace } from 'src/features/devnet/api/useTxTrace';
import DevNetTraceError from 'src/features/devnet/components/DevNetTraceError';
import TxStorageDiff from 'src/features/devnet/components/TxStorageDiff';

import { Skeleton } from 'src/toolkit/chakra/skeleton';

interface Props {
  hash: string;
  to?: string | null;
}

const TxStorageDiffTab = ({ hash, to }: Props) => {
  const { data, isPending, error } = useTxTrace(hash, to);

  const rows = React.useMemo(() => {
    if (!data) {
      return [];
    }
    // Every address the transaction touched is a candidate mapping key, which is
    // what turns an opaque storage hash into "mapping @ slot 0 [0x…]".
    const candidates = new Set(collectAddresses(data.entries, data.tx?.to ?? undefined));
    if (data.tx?.from) {
      candidates.add(data.tx.from.toLowerCase());
    }
    for (const entry of data.entries) {
      for (const param of [ ...(entry.decodedCallParams ?? []), ...(entry.decodedEventParams ?? []) ]) {
        const match = /0x[0-9a-f]{40}/i.exec(param.value);
        if (match) {
          candidates.add(match[0].toLowerCase());
        }
      }
      for (const topic of entry.topics ?? []) {
        const padded = topic.replace(/^0x/, '').padStart(64, '0');
        if (padded.startsWith('0'.repeat(24)) && padded.slice(24) !== '0'.repeat(40)) {
          candidates.add(`0x${ padded.slice(24) }`);
        }
      }
    }
    return labelStorageSlots(netStorageDiff(data.entries), [ ...candidates ]);
  }, [ data ]);

  if (isPending) {
    return (
      <Flex flexDir="column" gap={ 3 }>
        { Array.from({ length: 4 }).map((_, index) => <Skeleton key={ index } h="60px" loading/>) }
      </Flex>
    );
  }

  if (error || !data) {
    return <DevNetTraceError error={ error }/>;
  }

  return <TxStorageDiff rows={ rows }/>;
};

export default TxStorageDiffTab;
