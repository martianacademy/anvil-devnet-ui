// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex, Grid } from '@chakra-ui/react';
import React from 'react';

import type { Project } from 'src/features/devnet/api/types';

import PageTitle from 'src/shell/page/title/PageTitle';

import { devnetApi, DevNetApiError } from 'src/features/devnet/api/client';
import { usePolledResource } from 'src/features/devnet/api/useDevnet';
import DevNetField from 'src/features/devnet/components/DevNetField';
import DevNetSection from 'src/features/devnet/components/DevNetSection';

import { Button } from 'src/toolkit/chakra/button';
import { Tag } from 'src/toolkit/chakra/tag';
import { toaster } from 'src/toolkit/chakra/toaster';

const PROJECTS_POLL_MS = 5000;

const DevNetProjects = () => {
  const { data, refetch } = usePolledResource<{ projects: Array<Project> }>(
    () => devnetApi.get<{ projects: Array<Project> }>('/projects'),
    PROJECTS_POLL_MS,
    { projects: [] },
  );

  const [ isBusy, setIsBusy ] = React.useState(false);
  const [ name, setName ] = React.useState('');
  const [ chainId, setChainId ] = React.useState('31337');
  const [ port, setPort ] = React.useState('');
  const [ forkUrl, setForkUrl ] = React.useState('');

  const run = React.useCallback(async(label: string, action: () => Promise<string | void>) => {
    setIsBusy(true);
    try {
      const detail = await action();
      toaster.create({ title: detail || label, type: 'success' });
      refetch();
    } catch (error) {
      toaster.create({
        title: `${ label } failed`,
        description: error instanceof DevNetApiError ? error.message : String(error),
        type: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  }, [ refetch ]);

  const handleStart = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const id = event.currentTarget.dataset.id as string;
    const projectName = event.currentTarget.dataset.name;
    return run('Project started', async() => {
      const result = await devnetApi.post<{ port: number }>(`/projects/${ id }/start`);
      return `${ projectName } listening on port ${ result.port }`;
    });
  }, [ run ]);

  const handleStop = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const id = event.currentTarget.dataset.id as string;
    return run('Project stopped', async() => {
      await devnetApi.post(`/projects/${ id }/stop`);
    });
  }, [ run ]);

  const handleDelete = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const id = event.currentTarget.dataset.id as string;
    return run('Project deleted', async() => {
      await devnetApi['delete'](`/projects/${ id }`);
    });
  }, [ run ]);

  const create = React.useCallback(() => {
    return run('Project created', async() => {
      const payload = {
        name: name.trim(),
        chainId: Number(chainId),
        ...(port.trim() ? { port: Number(port) } : {}),
        ...(forkUrl.trim() ? { forkUrl: forkUrl.trim() } : {}),
      };
      const result = await devnetApi.post<{ project: Project }>('/projects', payload);
      setName('');
      setPort('');
      setForkUrl('');
      return `Created "${ result.project.name }" on port ${ result.project.port }`;
    });
  }, [ run, name, chainId, port, forkUrl ]);

  return (
    <>
      <PageTitle title="DevNet projects"/>

      <Flex flexDir="column" gap={ 5 }>
        <DevNetSection
          title="New project"
          description="Each project is an isolated devnet: its own port, chain id, fork settings and indexed history."
        >
          <Grid templateColumns={{ base: '1fr', lg: 'repeat(4, 1fr)' }} gap={ 4 }>
            <DevNetField label="Name" value={ name } onChange={ setName } placeholder="bsc-fork"/>
            <DevNetField label="Chain ID" value={ chainId } onChange={ setChainId }/>
            <DevNetField label="Port" value={ port } onChange={ setPort } placeholder="auto"/>
            <DevNetField label="Fork URL (optional)" value={ forkUrl } onChange={ setForkUrl } placeholder="https://…" isMono/>
          </Grid>
          <Button size="md" mt={ 4 } onClick={ create } loading={ isBusy } disabled={ !name.trim() }>Create project</Button>
        </DevNetSection>

        <DevNetSection title="Projects" action={ <Tag variant="subtle">{ data.projects.length }</Tag> }>
          <Flex flexDir="column" gap={ 3 }>
            { data.projects.map((project) => (
              <Flex
                key={ project.id }
                alignItems="center"
                gap={ 3 }
                flexWrap="wrap"
                borderWidth="1px"
                borderColor="border.divider"
                borderRadius="md"
                p={ 3 }
              >
                <Tag colorPalette={ project.isRunning ? 'green' : 'gray' }>{ project.isRunning ? 'running' : project.status }</Tag>
                <Box fontWeight="500" minW="120px">{ project.name }</Box>
                <Box fontSize="sm" color="text.secondary" fontFamily="mono">
                  chain { project.chain_id } · { project.rpcUrl }{ project.fork_url ? ' · fork' : '' }
                </Box>
                <Flex gap={ 2 } ml="auto">
                  { project.isRunning ? (
                    <Button size="xs" variant="outline" loading={ isBusy } data-id={ project.id } onClick={ handleStop }>
                      Stop
                    </Button>
                  ) : (
                    <Button size="xs" loading={ isBusy } data-id={ project.id } data-name={ project.name } onClick={ handleStart }>
                      Start
                    </Button>
                  ) }
                  <Button
                    size="xs"
                    variant="outline"
                    colorPalette="red"
                    loading={ isBusy }
                    data-id={ project.id }
                    onClick={ handleDelete }
                  >
                    Delete
                  </Button>
                </Flex>
              </Flex>
            )) }
            { data.projects.length === 0 && <Box color="text.secondary" fontSize="sm">No projects yet.</Box> }
          </Flex>
        </DevNetSection>
      </Flex>
    </>
  );
};

export default DevNetProjects;
