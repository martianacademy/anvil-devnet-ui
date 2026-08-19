// SPDX-License-Identifier: LicenseRef-Blockscout

import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import React from 'react';

import PageNextJs from 'src/server/PageNextJs';

const DevNetDebugger = dynamic(() => import('src/features/devnet/pages/DevNetDebugger'), { ssr: false });

const Page: NextPage = () => {
  return (
    <PageNextJs pathname="/devnet/debugger">
      <DevNetDebugger/>
    </PageNextJs>
  );
};

export default Page;

export { base as getServerSideProps } from 'src/server/getServerSideProps/main';
