// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid, Code } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import React from 'react';

import PageTitle from 'src/shell/page/title/PageTitle';

import { devnetApi, DevNetApiError } from 'src/features/devnet/api/client';
import type { CallNode, EvmStep, TraceResponse } from 'src/features/devnet/api/trace';
import { countCalls, extractStorageWrites, opcodeColor, parseStructLogs } from 'src/features/devnet/api/trace';
import DevNetCallTree from 'src/features/devnet/components/DevNetCallTree';
import DevNetField from 'src/features/devnet/components/DevNetField';
import DevNetSection from 'src/features/devnet/components/DevNetSection';

import { Alert } from 'src/toolkit/chakra/alert';
import { Button } from 'src/toolkit/chakra/button';
import { Slider } from 'src/toolkit/chakra/slider';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'src/toolkit/chakra/tabs';
import { Tag } from 'src/toolkit/chakra/tag';

interface TxDetail {
  hash: string;
  from: string;
  to: string | null;
  blockNumber: number | null;
  gas: string | null;
  gasUsed: string | null;
  value: string;
  status: string;
  decoded_function: string | null;
  contractName: string | null;
}

interface DebugState {
  tx: TxDetail | null;
  steps: Array<EvmStep>;
  callTrace: CallNode | null;
  traceError: string | null;
}

const EMPTY_STATE: DebugState = { tx: null, steps: [], callTrace: null, traceError: null };

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Opcode-level debugger for a devnet transaction: call tree, step-through with
 * stack/memory/storage, and every SSTORE the transaction performed.
 * Blockscout has no equivalent — the data comes from debug_traceTransaction via
 * the DevNet Control API.
 */
const DevNetDebugger = () => {
  const router = useRouter();
  const initialHash = typeof router.query.hash === 'string' ? router.query.hash : '';

  const [ hash, setHash ] = React.useState(initialHash);
  const [ state, setState ] = React.useState<DebugState>(EMPTY_STATE);
  const [ stepIndex, setStepIndex ] = React.useState(0);
  const [ isLoading, setIsLoading ] = React.useState(false);
  const [ error, setError ] = React.useState<string | null>(null);

  const load = React.useCallback(async(target: string) => {
    if (!HASH_RE.test(target)) {
      setError('Enter a 32-byte transaction hash (0x…).');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [ tx, trace ] = await Promise.all([
        devnetApi.get<TxDetail>(`/tx/${ target }`),
        devnetApi.get<TraceResponse>(`/tx/${ target }/trace`),
      ]);
      setState({
        tx,
        steps: parseStructLogs(trace.structLogs),
        callTrace: trace.callTrace,
        traceError: trace.traceError,
      });
      setStepIndex(0);
    } catch (err) {
      setState(EMPTY_STATE);
      setError(err instanceof DevNetApiError ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Deep link: /devnet/debugger?hash=0x… loads straight away.
  React.useEffect(() => {
    if (initialHash && HASH_RE.test(initialHash)) {
      load(initialHash);
    }
  }, [ initialHash, load ]);

  const storageWrites = React.useMemo(() => extractStorageWrites(state.steps), [ state.steps ]);
  const currentStep: EvmStep | undefined = state.steps[stepIndex];

  const jumpTo = React.useCallback((index: number) => {
    setStepIndex(Math.max(0, Math.min(state.steps.length - 1, index)));
  }, [ state.steps.length ]);

  const handleLoad = React.useCallback(() => load(hash.trim()), [ load, hash ]);
  const handlePrev = React.useCallback(() => jumpTo(stepIndex - 1), [ jumpTo, stepIndex ]);
  const handleNext = React.useCallback(() => jumpTo(stepIndex + 1), [ jumpTo, stepIndex ]);
  const handleSliderChange = React.useCallback((details: { value: Array<number> }) => {
    jumpTo(details.value[0]);
  }, [ jumpTo ]);
  const handleJumpToWrite = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    jumpTo(Number(event.currentTarget.dataset.step) || 0);
  }, [ jumpTo ]);

  return (
    <>
      <PageTitle title="Transaction debugger"/>

      <Flex flexDir="column" gap={ 5 }>
        <DevNetSection
          title="Transaction"
          description="Paste a devnet transaction hash to step through its execution."
          action={ (
            <Button size="sm" onClick={ handleLoad } loading={ isLoading } disabled={ !hash.trim() }>
              Load trace
            </Button>
          ) }
        >
          <DevNetField label="Transaction hash" value={ hash } onChange={ setHash } placeholder="0x…" isMono/>

          { error && <Alert status="error" mt={ 3 }>{ error }</Alert> }
          { state.traceError && <Alert status="warning" mt={ 3 }>{ state.traceError }</Alert> }

          { state.tx && (
            <Flex gap={ 2 } mt={ 4 } flexWrap="wrap">
              <Tag colorPalette={ state.tx.status === 'success' ? 'green' : 'red' }>{ state.tx.status }</Tag>
              { state.tx.blockNumber !== null && <Tag variant="subtle">block { state.tx.blockNumber }</Tag> }
              { state.tx.decoded_function && <Tag colorPalette="purple">{ state.tx.decoded_function }</Tag> }
              { state.tx.contractName && <Tag variant="subtle">{ state.tx.contractName }</Tag> }
              { state.tx.gasUsed && (
                <Tag variant="subtle">gas { Number(BigInt(state.tx.gasUsed)).toLocaleString() }</Tag>
              ) }
              <Tag variant="subtle">{ state.steps.length.toLocaleString() } opcodes</Tag>
              <Tag variant="subtle">{ countCalls(state.callTrace) } calls</Tag>
              <Tag variant="subtle">{ storageWrites.length } SSTOREs</Tag>
            </Flex>
          ) }
        </DevNetSection>

        { (state.callTrace || state.steps.length > 0) && (
          <DevNetSection title="Execution">
            <TabsRoot defaultValue="calls" variant="subtle">
              <TabsList>
                <TabsTrigger value="calls">Call tree</TabsTrigger>
                <TabsTrigger value="steps">Step debugger</TabsTrigger>
                <TabsTrigger value="storage">Storage writes</TabsTrigger>
              </TabsList>

              <TabsContent value="calls">
                { state.callTrace ?
                  <DevNetCallTree node={ state.callTrace }/> :
                  <Box color="text.secondary" fontSize="sm">No call trace available.</Box> }
              </TabsContent>

              <TabsContent value="steps">
                { state.steps.length === 0 ? (
                  <Box color="text.secondary" fontSize="sm">
                    No opcode trace — start Anvil with step tracing enabled, or use a local (non-fork) chain.
                  </Box>
                ) : (
                  <Flex flexDir="column" gap={ 4 }>
                    <Flex alignItems="center" gap={ 3 } flexWrap="wrap">
                      <Button size="xs" variant="outline" onClick={ handlePrev } disabled={ stepIndex === 0 }>
                        ← Prev
                      </Button>
                      <Button size="xs" variant="outline" onClick={ handleNext } disabled={ stepIndex >= state.steps.length - 1 }>
                        Next →
                      </Button>
                      <Box fontFamily="mono" fontSize="sm">
                        step { stepIndex + 1 } / { state.steps.length }
                      </Box>
                      { currentStep && (
                        <>
                          <Tag variant="subtle" fontFamily="mono" color={ opcodeColor(currentStep.op) }>
                            { currentStep.op }
                          </Tag>
                          <Box fontFamily="mono" fontSize="xs" color="text.secondary">
                            pc { currentStep.pc } · depth { currentStep.depth } · gas { currentStep.gas.toLocaleString() } (−{ currentStep.gasCost })
                          </Box>
                        </>
                      ) }
                    </Flex>

                    <Slider
                      value={ [ stepIndex ] }
                      min={ 0 }
                      max={ Math.max(0, state.steps.length - 1) }
                      onValueChange={ handleSliderChange }
                    />

                    <Grid templateColumns={{ base: '1fr', lg: 'repeat(3, 1fr)' }} gap={ 4 }>
                      <StackPanel title={ `Stack (${ currentStep?.stack.length ?? 0 })` } items={ currentStep?.stack ?? [] } reverse/>
                      <StackPanel title={ `Memory (${ currentStep?.memory.length ?? 0 } words)` } items={ currentStep?.memory ?? [] }/>
                      <StackPanel
                        title={ `Storage (${ Object.keys(currentStep?.storage ?? {}).length })` }
                        items={ Object.entries(currentStep?.storage ?? {}).map(([ slot, value ]) => `${ slot } = ${ value }`) }
                      />
                    </Grid>
                  </Flex>
                ) }
              </TabsContent>

              <TabsContent value="storage">
                { storageWrites.length === 0 ? (
                  <Box color="text.secondary" fontSize="sm">This transaction wrote no storage.</Box>
                ) : (
                  <Flex flexDir="column" gap={ 2 }>
                    { storageWrites.map((write, index) => (
                      <Box key={ index } borderWidth="1px" borderColor="border.divider" borderRadius="md" p={ 3 }>
                        <Flex gap={ 2 } alignItems="center" mb={ 2 } flexWrap="wrap">
                          <Tag variant="subtle">slot</Tag>
                          <Box fontFamily="mono" fontSize="xs" wordBreak="break-all">{ write.slot }</Box>
                          <Button size="xs" variant="plain" data-step={ write.step } onClick={ handleJumpToWrite }>
                            go to step { write.step + 1 }
                          </Button>
                        </Flex>
                        <Box fontFamily="mono" fontSize="xs" color="text.secondary" wordBreak="break-all">
                          { write.before } → <Box as="span" color="orange.400">{ write.after }</Box>
                        </Box>
                      </Box>
                    )) }
                  </Flex>
                ) }
              </TabsContent>
            </TabsRoot>
          </DevNetSection>
        ) }
      </Flex>
    </>
  );
};

function StackPanel({ title, items, reverse }: { title: string; items: Array<string>; reverse?: boolean }) {
  const rows = reverse ? [ ...items ].reverse() : items;
  return (
    <Box>
      <Box fontSize="sm" color="text.secondary" mb={ 2 }>{ title }</Box>
      <Code display="block" p={ 2 } fontSize="xs" maxH="260px" overflowY="auto" w="100%" whiteSpace="pre-wrap" wordBreak="break-all">
        { rows.length > 0 ? rows.map((row, index) => `${ String(index).padStart(2, '0') }  ${ row }`).join('\n') : '—' }
      </Code>
    </Box>
  );
}

export default DevNetDebugger;
