// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex } from '@chakra-ui/react';
import React from 'react';

import { devnetApi, DevNetApiError } from 'src/features/devnet/api/client';
import { usePolledResource } from 'src/features/devnet/api/useDevnet';

import { Badge } from 'src/toolkit/chakra/badge';
import { Button } from 'src/toolkit/chakra/button';
import { toaster } from 'src/toolkit/chakra/toaster';

const POLL_MS = 4000;

interface AnvilProcess {
  pid: number;
  port: number;
  managed: boolean;
  projectId: string | null;
  address: string;
}

interface Props {

  /** Called after something is stopped, so the page can refresh node status. */
  onChange?: () => void;
}

/**
 * Every anvil listening on this machine, including ones this app did not start.
 * A node left over from an earlier session is the usual reason a start fails with
 * "port already in use", and there was no way to clear it from the UI before.
 */
const DevNetProcessList = ({ onChange }: Props) => {
  const { data, refetch } = usePolledResource<{ processes: Array<AnvilProcess> }>(
    () => devnetApi.get<{ processes: Array<AnvilProcess> }>('/anvil/processes'),
    POLL_MS,
    { processes: [] },
  );

  const [ isBusy, setIsBusy ] = React.useState(false);

  const stop = React.useCallback(async(body: Record<string, unknown>, label: string) => {
    setIsBusy(true);
    try {
      const result = await devnetApi.delete<{ stopped: Array<number> }>('/anvil/processes', body);
      toaster.create({
        title: result.stopped.length > 0 ? `Stopped ${ label }` : 'Nothing to stop',
        type: result.stopped.length > 0 ? 'success' : 'info',
      });
      refetch();
      onChange?.();
    } catch (error) {
      toaster.create({
        title: 'Could not stop the node',
        description: error instanceof DevNetApiError ? error.message : String(error),
        type: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  }, [ refetch, onChange ]);

  const handleStopOne = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const pid = Number(event.currentTarget.dataset.pid);
    const port = event.currentTarget.dataset.port;
    return stop({ pid }, `the node on port ${ port }`);
  }, [ stop ]);

  const handleStopAll = React.useCallback(() => stop({ all: true }, 'every Anvil process'), [ stop ]);

  const processes = data.processes;

  return (
    <Box>
      <Flex alignItems="center" justifyContent="space-between" gap={ 3 } mb={ 3 } flexWrap="wrap">
        <Box color="text.secondary" fontSize="sm">
          { processes.length === 0 ?
            'No Anvil process is listening right now.' :
            `${ processes.length } Anvil process${ processes.length === 1 ? '' : 'es' } listening — including any this app did not start.` }
        </Box>
        { processes.length > 0 && (
          <Button size="xs" variant="outline" colorPalette="red" onClick={ handleStopAll } loading={ isBusy }>
            Stop all
          </Button>
        ) }
      </Flex>

      <Flex flexDir="column" gap={ 2 }>
        { processes.map((proc) => (
          <Flex
            key={ proc.pid }
            alignItems="center"
            gap={ 3 }
            flexWrap="wrap"
            borderWidth="1px"
            borderColor="border.divider"
            borderRadius="md"
            px={ 3 }
            py={ 2 }
          >
            <Badge colorPalette={ proc.managed ? 'green' : 'orange' }>
              { proc.managed ? 'started here' : 'external' }
            </Badge>
            <Box fontFamily="mono" fontSize="sm">port { proc.port }</Box>
            <Box fontFamily="mono" fontSize="xs" color="text.secondary">
              pid { proc.pid } · { proc.address === '*' ? 'all interfaces' : proc.address }
            </Box>
            { proc.projectId && <Badge colorPalette="blue">{ proc.projectId }</Badge> }
            { proc.address === '127.0.0.1' && (
              <Box fontSize="xs" color="text.secondary">not reachable from Docker</Box>
            ) }
            <Button
              size="xs"
              variant="outline"
              ml="auto"
              data-pid={ proc.pid }
              data-port={ proc.port }
              onClick={ handleStopOne }
              loading={ isBusy }
            >
              Stop
            </Button>
          </Flex>
        )) }
      </Flex>
    </Box>
  );
};

export default DevNetProcessList;
