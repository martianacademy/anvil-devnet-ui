// SPDX-License-Identifier: LicenseRef-Blockscout

/**
 * Thin client for the DevNet Control API. Every call goes through the Next.js
 * proxy at /api/devnet/*, so the control plane never has to be CORS-enabled or
 * exposed to the browser directly.
 */

export class DevNetApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DevNetApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit & { projectId?: string | null }): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (init?.projectId) {
    headers.set('x-project-id', init.projectId);
  }

  const response = await fetch(`/api/devnet${ path }`, { ...init, headers });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new DevNetApiError(`Request failed: HTTP ${ response.status }`, response.status);
    }
  }

  const error = (payload as { error?: string } | null)?.error;
  if (!response.ok || error) {
    throw new DevNetApiError(error ?? `Request failed: HTTP ${ response.status }`, response.status);
  }

  return payload as T;
}

export const devnetApi = {
  get: <T>(path: string, projectId?: string | null) => request<T>(path, { method: 'GET', projectId }),
  post: <T>(path: string, body?: unknown, projectId?: string | null) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}), projectId }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  'delete': <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body: JSON.stringify(body ?? {}) }),
};

/** Etherscan-style envelope returned by the control API's explorer endpoint. */
interface ExplorerEnvelope<T> {
  status: string;
  message: string;
  result: T;
  total?: number;
}

export async function devnetExplorer<T>(query: string, fallback: T, projectId?: string | null): Promise<T> {
  try {
    const data = await devnetApi.get<ExplorerEnvelope<T>>(`/explorer?${ query }`, projectId);
    return data.status === '1' ? data.result : fallback;
  } catch {
    return fallback;
  }
}
