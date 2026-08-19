// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid, Code } from '@chakra-ui/react';
import React from 'react';

import type { NodeStatus, SimulationResult } from 'src/features/devnet/api/types';

import PageTitle from 'src/shell/page/title/PageTitle';

import { devnetApi, DevNetApiError } from 'src/features/devnet/api/client';
import { useNodeStatus } from 'src/features/devnet/api/useDevnet';
import DevNetField from 'src/features/devnet/components/DevNetField';
import DevNetSection from 'src/features/devnet/components/DevNetSection';
import DevNetStatusBar from 'src/features/devnet/components/DevNetStatusBar';

import { Alert } from 'src/toolkit/chakra/alert';
import { Button } from 'src/toolkit/chakra/button';
import { Tag } from 'src/toolkit/chakra/tag';

/** ETH string -> wei hex, without the precision loss of float maths. */
function toWeiHex(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return '0x0';
  }
  const [ whole, fraction = '' ] = trimmed.split('.');
  const padded = (fraction + '0'.repeat(18)).slice(0, 18);
  const wad = BigInt(10) ** BigInt(18);
  return `0x${ (BigInt(whole) * wad + BigInt(padded || '0')).toString(16) }`;
}

const DevNetSimulate = () => {
  const { data: status, isLoading } = useNodeStatus();

  const [ to, setTo ] = React.useState('');
  const [ from, setFrom ] = React.useState('');
  const [ data, setData ] = React.useState('');
  const [ value, setValue ] = React.useState('0');
  const [ isBusy, setIsBusy ] = React.useState(false);
  const [ result, setResult ] = React.useState<SimulationResult | null>(null);

  const simulate = React.useCallback(async() => {
    setIsBusy(true);
    setResult(null);
    try {
      const response = await devnetApi.post<SimulationResult>('/simulate', {
        to: to.trim(),
        from: from.trim() || undefined,
        data: data.trim() || '0x',
        value: toWeiHex(value),
      });
      setResult(response);
    } catch (error) {
      setResult({
        success: false,
        error: error instanceof DevNetApiError ? error.message : String(error),
        gasEstimate: null,
        gasUsed: null,
        returnData: null,
        sstores: [],
        events: [],
      });
    } finally {
      setIsBusy(false);
    }
  }, [ to, from, data, value ]);

  return (
    <>
      <PageTitle title="Call simulator" secondRow={ <DevNetStatusBar status={ status as NodeStatus } isLoading={ isLoading }/> }/>

      <Flex flexDir="column" gap={ 5 }>
        <DevNetSection
          title="Simulate a call"
          description="Runs inside an EVM snapshot that is always reverted — chain state is never modified."
        >
          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={ 4 }>
            <DevNetField label="To (contract)" value={ to } onChange={ setTo } placeholder="0x…" isMono/>
            <DevNetField label="From (optional)" value={ from } onChange={ setFrom } placeholder="0x…" isMono/>
          </Grid>
          <Box mt={ 4 }>
            <DevNetField label="Calldata" value={ data } onChange={ setData } placeholder="0x70a08231…" isMono/>
          </Box>
          <Box mt={ 4 } maxW="240px">
            <DevNetField label="Value (ETH)" value={ value } onChange={ setValue }/>
          </Box>
          <Button size="md" mt={ 4 } onClick={ simulate } loading={ isBusy } disabled={ !to.trim() }>Simulate</Button>
        </DevNetSection>

        { result && (
          <DevNetSection
            title="Result"
            action={ <Tag colorPalette={ result.success ? 'green' : 'red' }>{ result.success ? 'Would succeed' : 'Would revert' }</Tag> }
          >
            <Flex flexDir="column" gap={ 3 }>
              { result.error && <Alert status="error">{ result.error }</Alert> }

              <Flex gap={ 4 } flexWrap="wrap">
                <Box>
                  <Box fontSize="sm" color="text.secondary">Gas estimate</Box>
                  <Box fontFamily="mono">{ result.gasEstimate ? Number(result.gasEstimate).toLocaleString() : '—' }</Box>
                </Box>
                <Box>
                  <Box fontSize="sm" color="text.secondary">Gas used</Box>
                  <Box fontFamily="mono">{ result.gasUsed ? Number(BigInt(result.gasUsed)).toLocaleString() : '—' }</Box>
                </Box>
              </Flex>

              { result.returnData && result.returnData !== '0x' && (
                <Box>
                  <Box fontSize="sm" color="text.secondary" mb={ 1 }>Return data</Box>
                  <Code display="block" p={ 2 } fontSize="xs" wordBreak="break-all">{ result.returnData }</Code>
                </Box>
              ) }

              { result.sstores.length > 0 && (
                <Box>
                  <Box fontSize="sm" color="text.secondary" mb={ 1 }>Storage writes ({ result.sstores.length })</Box>
                  { result.sstores.map((entry, index) => (
                    <Code key={ index } display="block" p={ 2 } fontSize="xs" wordBreak="break-all" mb={ 1 }>
                      slot { entry.slot } = { entry.value }
                    </Code>
                  )) }
                </Box>
              ) }

              { result.events.length > 0 && (
                <Box>
                  <Box fontSize="sm" color="text.secondary" mb={ 1 }>Events ({ result.events.length })</Box>
                  { result.events.map((event, index) => (
                    <Code key={ index } display="block" p={ 2 } fontSize="xs" wordBreak="break-all" mb={ 1 }>
                      { event.eventName ?
                        `${ event.contractName ? `${ event.contractName }.` : '' }${ event.eventName } ${ event.args ? JSON.stringify(event.args) : '' }` :
                        (event.topics?.[0] ?? 'unknown event') }
                    </Code>
                  )) }
                </Box>
              ) }
            </Flex>
          </DevNetSection>
        ) }
      </Flex>
    </>
  );
};

export default DevNetSimulate;
