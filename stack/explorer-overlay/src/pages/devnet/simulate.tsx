// SPDX-License-Identifier: LicenseRef-Blockscout

import type { NextPage } from 'next';
import dynamic from 'next/dynamic';
import React from 'react';

import PageNextJs from 'src/server/PageNextJs';

const DevNetSimulate = dynamic(() => import('src/features/devnet/pages/DevNetSimulate'), { ssr: false });

const Page: NextPage = () => {
  return (
    <PageNextJs pathname="/devnet/simulate">
      <DevNetSimulate/>
    </PageNextJs>
  );
};

export default Page;

export { base as getServerSideProps } from 'src/server/getServerSideProps/main';
