// SPDX-License-Identifier: LicenseRef-Blockscout

import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Server-side proxy to the DevNet Control API (the Anvil control plane that lives
 * outside Blockscout). Keeping it server-side means the browser never needs CORS
 * and the control API can stay bound to localhost.
 *
 * /api/devnet/anvil/status  ->  ${DEVNET_API_URL}/api/anvil/status
 */

const DEVNET_API_URL = process.env.DEVNET_API_URL || 'http://localhost:3010';
const TIMEOUT_MS = 30_000;

export default async function devnetProxyHandler(req: NextApiRequest, res: NextApiResponse) {
  const segments = Array.isArray(req.query.path) ? req.query.path : [ req.query.path ].filter(Boolean);
  const search = req.url?.includes('?') ? `?${ req.url.split('?')[1] }` : '';
  const target = `${ DEVNET_API_URL }/api/${ segments.join('/') }${ search }`;

  try {
    const response = await fetch(target, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers['x-project-id'] ? { 'x-project-id': String(req.headers['x-project-id']) } : {}),
      },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const text = await response.text();
    res.status(response.status);
    res.setHeader('Content-Type', response.headers.get('content-type') ?? 'application/json');
    res.send(text);
  } catch (error) {
    res.status(503).json({
      error: `DevNet Control API unreachable at ${ DEVNET_API_URL } — is it running? (${ error instanceof Error ? error.message : error })`,
    });
  }
}
