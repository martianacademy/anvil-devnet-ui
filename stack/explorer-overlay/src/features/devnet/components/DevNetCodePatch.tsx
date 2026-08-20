// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid, HStack } from '@chakra-ui/react';
import React from 'react';

import { devnetApi, DevNetApiError } from 'src/features/devnet/api/client';
import DevNetField from 'src/features/devnet/components/DevNetField';
import DevNetSection from 'src/features/devnet/components/DevNetSection';

import { Alert } from 'src/toolkit/chakra/alert';
import { Button } from 'src/toolkit/chakra/button';
import { Field } from 'src/toolkit/chakra/field';
import { Radio, RadioGroup } from 'src/toolkit/chakra/radio';
import { Textarea } from 'src/toolkit/chakra/textarea';
import { toaster } from 'src/toolkit/chakra/toaster';

const MODES = [
  { value: 'erc20', label: 'ERC-20 token' },
  { value: 'creation', label: 'Creation bytecode' },
  { value: 'runtime', label: 'Runtime bytecode' },
] as const;

type Mode = typeof MODES[number]['value'];

const MODE_HINTS: Record<Mode, string> = {
  erc20: 'Installs a working ERC-20 — transfer, approve, transferFrom and events — with the metadata below.',
  creation: 'Constructor bytecode as your compiler emits it. It runs in a simulation, so the storage it writes lands too.',
  runtime: 'Deployed bytecode, written verbatim. No constructor runs, so every storage slot starts empty.',
};

const DEFAULT_SUPPLY = '1000000';
const ANVIL_FIRST_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

interface CodeInfo {
  address: string;
  hasCode: boolean;
  codeSize: number;
  token: { name: string | null; symbol: string | null; decimals: number | null } | null;
}

interface InstallResult {
  codeSize: number;
  slotsWritten: number;
}

interface Props {
  isDisabled?: boolean;
}

/** Turn any address into a contract — a mainnet token address on the local chain, typically. */
const DevNetCodePatch = ({ isDisabled }: Props) => {
  const [ isBusy, setIsBusy ] = React.useState(false);
  const [ address, setAddress ] = React.useState('');
  const [ mode, setMode ] = React.useState<Mode>('erc20');
  const [ existing, setExisting ] = React.useState<CodeInfo | null>(null);

  const [ name, setName ] = React.useState('');
  const [ symbol, setSymbol ] = React.useState('');
  const [ decimals, setDecimals ] = React.useState('18');
  const [ supply, setSupply ] = React.useState(DEFAULT_SUPPLY);
  const [ holder, setHolder ] = React.useState('');

  const [ bytecode, setBytecode ] = React.useState('');
  const [ constructorArgs, setConstructorArgs ] = React.useState('');

  const inspect = React.useCallback(async(target: string) => {
    if (!target.trim()) {
      setExisting(null);
      return;
    }
    try {
      setExisting(await devnetApi.get<CodeInfo>(`/patches/code?address=${ encodeURIComponent(target.trim()) }`));
    } catch {
      setExisting(null);
    }
  }, []);

  const handleAddressBlur = React.useCallback(() => {
    inspect(address);
  }, [ inspect, address ]);

  const handleModeChange = React.useCallback((details: { value: string | null }) => {
    if (details.value) {
      setMode(details.value as Mode);
    }
  }, []);

  const handleBytecodeChange = React.useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBytecode(event.target.value);
  }, []);

  const handleInstall = React.useCallback(async() => {
    setIsBusy(true);
    try {
      const payload = mode === 'erc20' ?
        {
          address: address.trim(),
          mode,
          name: name.trim(),
          symbol: symbol.trim(),
          decimals: Number(decimals),
          totalSupply: supply.trim(),
          holder: holder.trim() || undefined,
        } :
        {
          address: address.trim(),
          mode,
          bytecode: bytecode.trim(),
          constructorArgs: constructorArgs.trim() || undefined,
        };

      const result = await devnetApi.post<InstallResult>('/patches/code', payload);
      toaster.create({
        title: 'Code installed',
        description: `${ result.codeSize } bytes at ${ address.trim() }, ${ result.slotsWritten } storage slots written`,
        type: 'success',
      });
      await inspect(address);
    } catch (error) {
      toaster.create({
        title: 'Install failed',
        description: error instanceof DevNetApiError ? error.message : String(error),
        type: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  }, [ mode, address, name, symbol, decimals, supply, holder, bytecode, constructorArgs, inspect ]);

  const canInstall = Boolean(address.trim()) && (
    mode === 'erc20' ? Boolean(name.trim() && symbol.trim()) : Boolean(bytecode.trim())
  );

  return (
    <DevNetSection
      title="Install contract code"
      description="Give any address contract code — a mainnet token address, a proxy, an address your tests already hardcode."
    >
      <Grid templateColumns={{ base: '1fr', lg: '2fr 1fr' }} gap={ 4 }>
        <DevNetField
          label="Address"
          value={ address }
          onChange={ setAddress }
          onBlur={ handleAddressBlur }
          placeholder="0x55d398326f99059fF775485246999027B3197955"
          helperText="The address that will hold the code — it does not need to exist yet."
          isMono
        />
      </Grid>

      { existing?.hasCode && (
        <Alert status="warning" mt={ 3 }>
          This address already has { existing.codeSize } bytes of code
          { existing.token?.symbol ? ` (${ existing.token.name ?? 'token' }, ${ existing.token.symbol })` : '' }.
          Installing replaces the code; storage the old contract wrote stays behind unless the new one overwrites it.
        </Alert>
      ) }

      <Box mt={ 4 }>
        <RadioGroup value={ mode } onValueChange={ handleModeChange }>
          <HStack gap={ 6 } flexWrap="wrap">
            { MODES.map((item) => (
              <Radio key={ item.value } value={ item.value }>{ item.label }</Radio>
            )) }
          </HStack>
        </RadioGroup>
        <Box fontSize="sm" color="text.secondary" mt={ 2 }>{ MODE_HINTS[mode] }</Box>
      </Box>

      { mode === 'erc20' ? (
        <Grid templateColumns={{ base: '1fr', lg: 'repeat(2, 1fr)' }} gap={ 4 } mt={ 4 }>
          <DevNetField label="Name" value={ name } onChange={ setName } placeholder="Tether USD"/>
          <DevNetField label="Symbol" value={ symbol } onChange={ setSymbol } placeholder="USDT"/>
          <DevNetField label="Decimals" value={ decimals } onChange={ setDecimals }/>
          <DevNetField label="Total supply" value={ supply } onChange={ setSupply } helperText="In whole tokens, not base units"/>
          <Box gridColumn={{ lg: 'span 2' }}>
            <DevNetField
              label="Mint the supply to"
              value={ holder }
              onChange={ setHolder }
              placeholder={ ANVIL_FIRST_ACCOUNT }
              helperText="Leave empty to create the supply with no holder."
              isMono
            />
          </Box>
        </Grid>
      ) : (
        <Flex flexDir="column" gap={ 4 } mt={ 4 }>
          <Field label={ mode === 'creation' ? 'Creation bytecode' : 'Runtime bytecode' } size="md">
            <Textarea
              value={ bytecode }
              onChange={ handleBytecodeChange }
              placeholder="0x60806040…"
              fontFamily="mono"
              fontSize="xs"
              rows={ 6 }
            />
          </Field>
          { mode === 'creation' && (
            <DevNetField
              label="Constructor arguments (optional)"
              value={ constructorArgs }
              onChange={ setConstructorArgs }
              placeholder="0x…"
              helperText="ABI-encoded, appended to the bytecode. Skip this if they are already baked in."
              isMono
            />
          ) }
        </Flex>
      ) }

      <Button size="md" mt={ 4 } onClick={ handleInstall } loading={ isBusy } disabled={ isDisabled || !canInstall }>
        Install code
      </Button>
    </DevNetSection>
  );
};

export default DevNetCodePatch;
