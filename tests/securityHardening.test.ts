import assert from 'node:assert/strict';
import { io as createSocketClient } from 'socket.io-client';
import { createAppServer } from '../server.js';
import { loadDb, resetDemoDatabase } from '../server/repositories/dataStore.js';
import { isolateTestDatabase } from './isolatedDatabase.js';

const cleanup = isolateTestDatabase();
const passwordByUser: Record<string, string> = {
  'SA-001': 'PlusHR#Super2026!',
  'ATL-001': 'Atlas#Admin2026!',
  'ATL-003': 'Atlas#Mgr2026!',
  'ATL-010': 'Atlas#Emp2026!',
  'ATL-012': 'Atlas#Emp2026!',
  'MGT-001': 'Maghreb#Admin2026!',
};

async function run(): Promise<void> {
  resetDemoDatabase();
  const { httpServer } = await createAppServer({ skipVite: true, scheduleBackups: false });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(
    path: string,
    options: { method?: string; identifier?: string; password?: string; token?: string; cookie?: string; body?: unknown; origin?: string | null } = {}
  ): Promise<{ status: number; data: any; cookie: string | undefined }> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options.origin !== null) headers.Origin = options.origin || baseUrl;
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.cookie) headers.Cookie = options.cookie;
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const data = await response.json();
    const cookies = response.headers.getSetCookie();
    return {
      status: response.status,
      data,
      cookie: cookies.map((value) => value.split(';')[0]).join('; ') || undefined,
    };
  }

  async function login(identifier: string) {
    const result = await request('/api/auth/login', {
      method: 'POST',
      identifier,
      password: passwordByUser[identifier],
      body: { identifier, password: passwordByUser[identifier] },
    });
    assert.equal(result.status, 200);
    return result;
  }

  try {
    const superAdmin = await login('SA-001');
    const companyAdmin = await login('ATL-001');
    const manager = await login('ATL-003');
    const assignedEmployee = await login('ATL-010');
    const otherEmployee = await login('ATL-012');
    const otherTenantAdmin = await login('MGT-001');

    const noOrigin = await request('/api/auth/refresh', {
      method: 'POST',
      cookie: companyAdmin.cookie,
      origin: null,
    });
    assert.equal(noOrigin.status, 403);
    const hostileOrigin = await request('/api/auth/refresh', {
      method: 'POST',
      cookie: companyAdmin.cookie,
      origin: 'https://untrusted.example',
    });
    assert.equal(hostileOrigin.status, 403);
    const allowedRefresh = await request('/api/auth/refresh', {
      method: 'POST',
      cookie: companyAdmin.cookie,
    });
    assert.equal(allowedRefresh.status, 200);
    assert.equal((await request('/api/auth/me', { token: companyAdmin.data.accessToken })).status, 401);

    const missingCsrfOnTask = await request('/api/tasks/task-1', {
      method: 'PATCH',
      cookie: assignedEmployee.cookie,
      origin: null,
      body: { status: 'done' },
    });
    assert.equal(missingCsrfOnTask.status, 403);

    assert.equal((await request('/api/tasks/task-1', {
      method: 'PATCH',
      token: superAdmin.data.accessToken,
      body: { status: 'done' },
    })).status, 403);
    assert.equal((await request('/api/tasks/task-1', {
      method: 'PATCH',
      token: otherTenantAdmin.data.accessToken,
      body: { status: 'done' },
    })).status, 404);
    assert.equal((await request('/api/tasks/task-1', {
      method: 'PATCH',
      token: otherEmployee.data.accessToken,
      body: { status: 'done' },
    })).status, 404);
    assert.equal((await request('/api/tasks/task-1', {
      method: 'PATCH',
      token: assignedEmployee.data.accessToken,
      body: { status: 'in_review', actual_hours: 5, comment: 'Progress recorded' },
    })).status, 200);
    assert.equal(loadDb().tasks.find((task) => task.id === 'task-1')?.status, 'in_review');
    assert.equal((await request('/api/tasks/task-1', {
      method: 'PATCH',
      token: assignedEmployee.data.accessToken,
      body: { company_id: 'comp-maghreb', status: 'done' },
    })).status, 400);
    assert.equal((await request('/api/tasks/task-1', {
      method: 'PATCH',
      token: assignedEmployee.data.accessToken,
      body: { assignee_id: 'emp-atlas-12' },
    })).status, 400);

    const managerUpdate = await request('/api/tasks/task-1', {
      method: 'PATCH',
      token: manager.data.accessToken,
      body: { assignee_id: 'emp-atlas-12' },
    });
    assert.equal(managerUpdate.status, 200);
    const invalidTask = await request('/api/tasks', {
      method: 'POST',
      token: manager.data.accessToken,
      body: {
        title: 'Cross-company assignment',
        department_id: 'dept-prod',
        project_id: 'proj-4',
        assignee_id: 'emp-atlas-12',
      },
    });
    assert.equal(invalidTask.status, 400);

    const socket = createSocketClient(baseUrl, {
      auth: { token: assignedEmployee.data.accessToken },
      extraHeaders: { Origin: baseUrl },
      transports: ['websocket'],
      reconnection: false,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
      setTimeout(() => reject(new Error('Socket connection timed out')), 5000).unref();
    });
    const disconnected = new Promise<void>((resolve, reject) => {
      socket.once('disconnect', () => resolve());
      setTimeout(() => reject(new Error('Revoked session socket was not disconnected')), 3000).unref();
    });
    const logout = await request('/api/auth/logout', {
      method: 'POST',
      token: assignedEmployee.data.accessToken,
    });
    assert.equal(logout.status, 200);
    await disconnected;
    socket.close();
    assert.equal((await request('/api/auth/me', { token: assignedEmployee.data.accessToken })).status, 401);

    const cookieSession = await login('ATL-012');
    const bearerSession = await login('ATL-012');
    const mixedLogout = await request('/api/auth/logout', {
      method: 'POST',
      cookie: cookieSession.cookie,
      token: bearerSession.data.accessToken,
    });
    assert.equal(mixedLogout.status, 200);
    assert.equal((await request('/api/auth/me', { token: cookieSession.data.accessToken })).status, 401);
    assert.equal((await request('/api/auth/me', { token: bearerSession.data.accessToken })).status, 401);

    console.log('[PASS] CSRF origin validation, task role/tenant/team/assignment/field validation and session/socket revocation');
  } finally {
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

run().finally(cleanup).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
