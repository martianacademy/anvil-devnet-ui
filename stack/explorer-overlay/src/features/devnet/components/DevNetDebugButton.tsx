// SPDX-License-Identifier: LicenseRef-Blockscout

import React from 'react';

import { route } from 'src/shared/router/routes';

import { Link } from 'src/toolkit/chakra/link';

interface Props {
  hash: string;
}

/**
 * Jump from a Blockscout transaction to the DevNet opcode debugger.
 * Blockscout's Anvil preset runs without the internal-transaction fetcher, so the
 * call tree and step-through come from debug_traceTransaction via the control API.
 */
const DevNetDebugButton = ({ hash }: Props) => {
  if (!hash) {
    return null;
  }

  return (
    <Link
      href={ route({ pathname: '/devnet/debugger', query: { hash } }) }
      fontSize="sm"
      fontWeight="500"
      borderWidth="1px"
      borderColor="border.divider"
      borderRadius="base"
      px={ 2 }
      py="2px"
      noIcon
    >
      Debug in DevNet
    </Link>
  );
};

export default DevNetDebugButton;
