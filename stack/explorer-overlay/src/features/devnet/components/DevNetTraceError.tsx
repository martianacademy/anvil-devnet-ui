// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box } from '@chakra-ui/react';
import React from 'react';

import { Alert } from 'src/toolkit/chakra/alert';

/** Shared failure state for the devnet tabs — the control API is a separate service. */
const DevNetTraceError = ({ error }: { error: unknown }) => (
  <Alert status="error" alignItems="flex-start">
    <Box>
      <Box>{ error instanceof Error ? error.message : 'Could not load the trace.' }</Box>
      <Box mt={ 1 } fontSize="sm" color="text.secondary">
        This view is served by the DevNet Control API — start the stack with <code>devnet.sh up</code>.
      </Box>
    </Box>
  </Alert>
);

export default DevNetTraceError;
