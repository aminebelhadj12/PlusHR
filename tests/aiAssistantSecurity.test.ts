import assert from 'node:assert/strict';
import { createAppServer } from '../server.js';
import { loadDb, mutateAuthDb } from '../server/repositories/dataStore.js';
import { isolateTestDatabase } from './isolatedDatabase.js';

const cleanup = isolateTestDatabase();
const realFetch = globalThis.fetch;
const fakeKey = 'isolated-assistant-provider-key';
const streamRequests: string[] = [];
let releaseStream: (() => void) | undefined;
let providerMode: 'stream' | 'fail' = 'stream';

function mockGemini() {
  process.env.GEMINI_API_KEY = fakeKey;
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname !== 'generativelanguage.googleapis.com') return realFetch(input, init);
    const raw = typeof init?.body === 'string' ? init.body :
      input instanceof Request ? await input.clone().text() : '';
    streamRequests.push(raw);
    if (providerMode === 'fail') {
      return new Response(JSON.stringify({ error: { message: 'fake provider diagnostic ' + fakeKey } }), {
        status: 400, headers: { 'Content-Type': 'application/json' },
      });
    }
    assert.match(url.pathname, /:streamGenerateContent$/);
    const encoder = new TextEncoder();
    const chunk = (text: string) => encoder.encode('data: ' + JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text }] } }],
    }) + '\n\n');
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(chunk('### HR summary\n'));
        releaseStream = () => {
          controller.enqueue(chunk('\n- **Information**'));
          controller.close();
        };
      },
    }), { headers: { 'Content-Type': 'text/event-stream' } });
  };
}

async function run() {
  const { httpServer } = await createAppServer({ skipVite: true, scheduleBackups: false });
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const address = httpServer.address() as { port: number };
  const url = 'http://127.0.0.1:' + address.port + '/api';
  const conversations = '/ai/conversations';
  const chat = '/ai/chat';

  function call(path: string, token?: string, method = 'GET', body?: unknown, stream = false) {
    return fetch(url + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(stream ? { Accept: 'application/x-ndjson' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
  }

  async function login(identifier: string, password: string) {
    const response = await call('/auth/login', undefined, 'POST', { identifier, password });
    assert.equal(response.status, 200);
    return (await response.json()).accessToken as string;
  }

  try {
    const owner = await login('ATL-010', 'Atlas#Emp2026!');
    const colleague = await login('ATL-002', 'Atlas#HR2026!');
    const manager = await login('ATL-003', 'Atlas#Mgr2026!');
    const otherCompany = await login('MGT-001', 'Maghreb#Admin2026!');
    const platform = await login('SA-001', 'PlusHR#Super2026!');

    assert.equal((await call(chat, undefined, 'POST', { question: 'Safety check' })).status, 401);
    const created = await call(chat, owner, 'POST', { question: 'My remaining leave balance', lang: 'en' });
    assert.equal(created.status, 200);
    const { conversationId, answer } = await created.json();
    assert.match(answer, /Remaining leave/);
    assert.doesNotMatch(answer, /Maghreb|salar/i);
    for (const notOwner of [colleague, manager, otherCompany, platform]) {
      const foreignList = await call(conversations + '?q=remaining&summary=1', notOwner);
      assert.deepEqual((await foreignList.json()).conversations, []);
      assert.equal((await call(conversations + '/' + conversationId, notOwner)).status, 404);
      assert.equal((await call(conversations + '/' + conversationId, notOwner, 'PATCH', { title: 'Changed' })).status, 404);
      assert.equal((await call(conversations + '/' + conversationId, notOwner, 'DELETE')).status, 404);
      assert.equal((await call(chat, notOwner, 'POST', { question: 'Tell me the previous reply', conversationId }, true)).status, 404);
    }

    const transcript = await call(conversations + '/' + conversationId, owner);
    assert.equal((await transcript.json()).conversation.messages.length, 2);
    assert.equal((await call(conversations + '/' + conversationId, owner, 'PATCH', { title: 'Annual leave' })).status, 200);
    const search = await call(conversations + '?summary=1&q=remaining%20leave%20balance', owner);
    const results = (await search.json()).conversations;
    // Search hits by original user message as well as the new title.
    const byTitle = await call(conversations + '?summary=1&q=annual', owner);
    assert.equal((await byTitle.json()).conversations[0].id, conversationId);
    assert.deepEqual(results.map((item: { id: string }) => item.id), [conversationId]);
    assert.ok(results.every((item: object) => !('messages' in item)));
    assert.equal((await call(conversations + '/' + conversationId, owner, 'PATCH', { title: ' ' })).status, 400);

    const legacyId = 'aiconv-old-scope';
    await mutateAuthDb((db) => {
      const user = db.users.find((entry) => entry.matricule === 'ATL-010')!;
      db.ai_conversations.push({ id: legacyId, company_id: user.company_id, user_id: user.id, title: 'Legacy', created_at: new Date().toISOString() });
      db.ai_messages.push({ id: 'legacy-sensitive', ai_conversation_id: legacyId, role: 'assistant', content: 'Unverified old answer', created_at: new Date().toISOString() });
    });
    const legacy = (await (await call(conversations + '/' + legacyId, owner)).json()).conversation;
    assert.equal(legacy.archived, true);
    assert.deepEqual(legacy.messages, []);
    assert.equal((await call(chat, owner, 'POST', { question: 'Continue', conversationId: legacyId })).status, 409);
    assert.ok(loadDb().ai_messages.some((item) => item.id === 'legacy-sensitive'));
    console.log('[PASS] Ownership and tenant isolation for history, search, continuation, rename, and delete');

    mockGemini();
    const response = await call(chat, owner, 'POST', { question: 'Follow-up', conversationId, lang: 'en' }, true);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /application\/x-ndjson/);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let result = decoder.decode((await reader.read()).value);
    assert.match(result, /"type":"delta"/);
    assert.doesNotMatch(result, /"type":"done"/);
    assert.equal((await call(chat, owner, 'POST', { question: 'Concurrent', conversationId })).status, 409);
    releaseStream!();
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      result += decoder.decode(next.value, { stream: true });
    }
    const events = result.trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(events.map((event) => event.type), ['delta', 'delta', 'done']);
    assert.equal(events.at(-1).answer, '### HR summary\n\n- **Information**');
    assert.equal(events.at(-1).usedGemini, true);
    assert.match(streamRequests[0], /Atlas Industrial Group/);
    assert.doesNotMatch(streamRequests[0], /Maghreb Tech|Unverified old answer|salary|base_salary/i);
    assert.doesNotMatch(result, new RegExp(fakeKey));

    providerMode = 'fail';
    const failed = await call(chat, owner, 'POST', { question: 'Leave summary', lang: 'ar' }, true);
    const fallback = await failed.text();
    assert.match(fallback, /"usedGemini":false/);
    assert.match(fallback, /\p{Script=Arabic}/u);
    assert.doesNotMatch(fallback, /fake provider diagnostic|isolated-assistant-provider-key/);
    console.log('[PASS] Gemini streaming, single in-flight turn, and sanitized fallback');

    const managerEmployee = loadDb().employees.find((employee) => employee.matricule === 'ATL-003')!;
    const managerStart = await call(chat, manager, 'POST', { question: 'Workload', lang: 'en' });
    assert.equal(managerStart.status, 200);
    const managerId = (await managerStart.json()).conversationId;
    const formerDepartment = managerEmployee.department_id;
    await mutateAuthDb((db) => {
      db.employees.find((employee) => employee.id === managerEmployee.id)!.department_id = '';
    });
    assert.equal((await call(chat, manager, 'POST', { question: 'Company-wide data' })).status, 403);
    await mutateAuthDb((db) => {
      db.employees.find((employee) => employee.id === managerEmployee.id)!.department_id = db.departments.find(
        (department) => department.company_id === managerEmployee.company_id && department.id !== formerDepartment
      )!.id;
    });
    assert.equal((await (await call(conversations + '/' + managerId, manager)).json()).conversation.archived, true);
    assert.equal((await call(chat, manager, 'POST', { question: 'Continue', conversationId: managerId })).status, 409);
    providerMode = 'stream';
    const deleting = await call(chat, owner, 'POST', { question: 'Pending deletion', conversationId }, true);
    const pending = deleting.body!.getReader();
    assert.match(decoder.decode((await pending.read()).value), /"type":"delta"/);
    assert.equal((await call(conversations + '/' + conversationId, owner, 'DELETE')).status, 204);
    releaseStream!();
    let remainder = '';
    for (;;) {
      const next = await pending.read();
      if (next.done) break;
      remainder += decoder.decode(next.value, { stream: true });
    }
    assert.match(remainder, /"type":"error"/);
    assert.doesNotMatch(remainder, /Information|"type":"done"/);
    assert.equal((await call(conversations + '/' + conversationId, owner)).status, 404);
    assert.equal(loadDb().ai_messages.filter((item) => item.ai_conversation_id === conversationId).length, 0);
    console.log('[PASS] Manager department scoping, permission changes, and owner deletion');
  } finally {
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
}

try {
  await run();
} finally {
  globalThis.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
  cleanup();
}
