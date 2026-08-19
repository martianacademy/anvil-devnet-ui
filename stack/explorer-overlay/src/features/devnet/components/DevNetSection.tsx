// SPDX-License-Identifier: LicenseRef-Blockscout

import { Box, Flex } from '@chakra-ui/react';
import React from 'react';

import { Heading } from 'src/toolkit/chakra/heading';

interface Props {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

/** Bordered panel used by every DevNet control page. */
const DevNetSection = ({ title, description, action, children }: Props) => {
  return (
    <Box borderWidth="1px" borderColor="border.divider" borderRadius="lg" overflow="hidden" w="100%">
      <Flex
        alignItems="center"
        justifyContent="space-between"
        gap={ 3 }
        px={ 5 }
        py={ 3 }
        borderBottomWidth="1px"
        borderColor="border.divider"
        bgColor="bg.subtle"
        flexWrap="wrap"
      >
        <Box>
          <Heading level="3">{ title }</Heading>
          { description && <Box fontSize="sm" color="text.secondary" mt={ 1 }>{ description }</Box> }
        </Box>
        { action }
      </Flex>
      <Box p={ 5 }>{ children }</Box>
    </Box>
  );
};

export default DevNetSection;
