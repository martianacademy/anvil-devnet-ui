// SPDX-License-Identifier: LicenseRef-Blockscout

import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import React from 'react';

import PageNextJs from 'src/server/PageNextJs';

const DevNetEvm = dynamic(() => import('src/features/devnet/pages/DevNetEvm'), { ssr: false });

const Page: NextPage = () => {
  return (
    <PageNextJs pathname="/devnet/evm">
      <DevNetEvm/>
    </PageNextJs>
  );
};

export default Page;

export { base as getServerSideProps } from 'src/server/getServerSideProps/main';
