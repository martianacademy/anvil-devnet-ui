// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid, Code } from '@chakra-ui/react';
import React from 'react';

import type { NodeStatus } from 'src/features/devnet/api/types';

import PageTitle from 'src/shell/page/title/PageTitle';

import { devnetApi, DevNetApiError } from 'src/features/devnet/api/client';
import { useNodeStatus } from 'src/features/devnet/api/useDevnet';
import DevNetField from 'src/features/devnet/components/DevNetField';
import DevNetSection from 'src/features/devnet/components/DevNetSection';
import DevNetStatusBar from 'src/features/devnet/components/DevNetStatusBar';

import { Button } from 'src/toolkit/chakra/button';
import { toaster } from 'src/toolkit/chakra/toaster';

const DevNetPatches = () => {
  const { data: status, isLoading } = useNodeStatus();
  const [ isBusy, setIsBusy ] = React.useState(false);

  const [ nativeAddress, setNativeAddress ] = React.useState('');
  const [ nativeAmount, setNativeAmount ] = React.useState('1000');

  const [ tokenAddress, setTokenAddress ] = React.useState('');
  const [ tokenWallet, setTokenWallet ] = React.useState('');
  const [ tokenAmount, setTokenAmount ] = React.useState('1000');
  const [ tokenDecimals, setTokenDecimals ] = React.useState('18');

  const [ storageContract, setStorageContract ] = React.useState('');
  const [ storageSlot, setStorageSlot ] = React.useState('0x0');
  const [ storageValue, setStorageValue ] = React.useState('');
  const [ currentSlotValue, setCurrentSlotValue ] = React.useState('');

  const run = React.useCallback(async(label: string, action: () => Promise<string | void>) => {
    setIsBusy(true);
    try {
      const detail = await action();
      toaster.create({ title: detail || label, type: 'success' });
    } catch (error) {
      toaster.create({
        title: `${ label } failed`,
        description: error instanceof DevNetApiError ? error.message : String(error),
        type: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  }, []);

  const fundNative = React.useCallback(() => {
    return run('Funding', async() => {
      await devnetApi.post('/patches/fund', {
        type: 'native',
        address: nativeAddress.trim(),
        amount: nativeAmount.trim(),
      });
      return `Set balance of ${ nativeAddress.trim() } to ${ nativeAmount } ETH`;
    });
  }, [ run, nativeAddress, nativeAmount ]);

  const fundToken = React.useCallback(() => {
    return run('Token funding', async() => {
      await devnetApi.post('/patches/fund', {
        type: 'erc20',
        token: tokenAddress.trim(),
        address: tokenWallet.trim(),
        amount: tokenAmount.trim(),
        decimals: Number(tokenDecimals),
      });
      return `Set token balance to ${ tokenAmount }`;
    });
  }, [ run, tokenAddress, tokenWallet, tokenAmount, tokenDecimals ]);

  const readSlot = React.useCallback(async() => {
    if (!storageContract.trim() || !storageSlot.trim()) {
      return;
    }
    try {
      const result = await devnetApi.get<{ value: string }>(
        `/patches/storage?contract=${ encodeURIComponent(storageContract.trim()) }&slot=${ encodeURIComponent(storageSlot.trim()) }`,
      );
      setCurrentSlotValue(result.value);
    } catch {
      setCurrentSlotValue('');
    }
  }, [ storageContract, storageSlot ]);

  const writeSlot = React.useCallback(() => {
    return run('Storage write', async() => {
      await devnetApi.post('/patches/storage', {
        contract: storageContract.trim(),
        slot: storageSlot.trim(),
        value: storageValue.trim(),
      });
      await readSlot();
      return 'Storage slot written';
    });
  }, [ run, storageContract, storageSlot, storageValue, readSlot ]);

  return (
    <>
      <PageTitle title="State patches" secondRow={ <DevNetStatusBar status={ status as NodeStatus } isLoading={ isLoading }/> }/>

      <Flex flexDir="column" gap={ 5 }>
        <DevNetSection title="Fund native balance" description="Sets an account's ETH balance outright via anvil_setBalance.">
          <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr auto' }} gap={ 4 } alignItems="flex-end">
            <DevNetField label="Address" value={ nativeAddress } onChange={ setNativeAddress } placeholder="0x…" isMono/>
            <DevNetField label="Amount (ETH)" value={ nativeAmount } onChange={ setNativeAmount }/>
            <Button size="md" onClick={ fundNative } loading={ isBusy } disabled={ !nativeAddress.trim() }>Fund</Button>
          </Grid>
        </DevNetSection>

        <DevNetSection
          title="Fund ERC-20 balance"
          description="Writes the balances mapping directly. The slot is auto-detected; a minimal ERC-20 is injected when the address has no code."
        >
          <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={ 4 }>
            <DevNetField label="Token address" value={ tokenAddress } onChange={ setTokenAddress } placeholder="0x…" isMono/>
            <DevNetField label="Wallet address" value={ tokenWallet } onChange={ setTokenWallet } placeholder="0x…" isMono/>
            <DevNetField label="Amount" value={ tokenAmount } onChange={ setTokenAmount }/>
            <DevNetField label="Decimals" value={ tokenDecimals } onChange={ setTokenDecimals }/>
          </Grid>
          <Button size="md" mt={ 4 } onClick={ fundToken } loading={ isBusy } disabled={ !tokenAddress.trim() || !tokenWallet.trim() }>
            Fund token
          </Button>
        </DevNetSection>

        <DevNetSection title="Storage slot" description="Read or overwrite any storage slot of any contract.">
          <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={ 4 }>
            <DevNetField label="Contract" value={ storageContract } onChange={ setStorageContract } placeholder="0x…" isMono onBlur={ readSlot }/>
            <DevNetField label="Slot" value={ storageSlot } onChange={ setStorageSlot } placeholder="0x0" isMono onBlur={ readSlot }/>
          </Grid>
          { currentSlotValue && (
            <Box mt={ 3 }>
              <Box fontSize="sm" color="text.secondary" mb={ 1 }>Current value</Box>
              <Code display="block" p={ 2 } fontSize="xs" wordBreak="break-all">{ currentSlotValue }</Code>
            </Box>
          ) }
          <Box mt={ 4 }>
            <DevNetField label="New value (32-byte hex)" value={ storageValue } onChange={ setStorageValue } placeholder="0x0000…0001" isMono/>
          </Box>
          <Flex gap={ 2 } mt={ 4 }>
            <Button size="md" variant="outline" onClick={ readSlot } disabled={ !storageContract.trim() }>Read</Button>
            <Button size="md" onClick={ writeSlot } loading={ isBusy } disabled={ !storageContract.trim() || !storageValue.trim() }>Write</Button>
          </Flex>
        </DevNetSection>
      </Flex>
    </>
  );
};

export default DevNetPatches;
