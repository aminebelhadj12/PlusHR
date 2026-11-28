import assert from 'node:assert/strict';
import type { JwtPayload } from '../server/middlewares/auth.js';
import { canAccessUpload } from '../server/controllers/coreHrController.js';
import { loadDb, mutateDb, resetDemoDatabase } from '../server/repositories/dataStore.js';
import { isolateTestDatabase } from './isolatedDatabase.js';

const cleanup = isolateTestDatabase();

function payloadFor(userId: string): JwtPayload {
  const user = loadDb().users.find((entry) => entry.id === userId);
  assert.ok(user);
  return {
    userId: user.id,
    sessionId: 'test-session',
    companyId: user.company_id,
    roleCode: user.role_code,
    email: user.email,
    credentialStamp: 'test',
    firstLogin: false,
    rememberMe: false,
  };
}

async function run(): Promise<void> {
  resetDemoDatabase();
  const filePath = '/api/uploads/private-employee-document.pdf';
  await mutateDb((db) => {
    db.employee_documents.push({
      id: 'test-document',
      company_id: 'comp-atlas',
      employee_id: 'emp-atlas-10',
      title: 'Private document',
      category: 'other',
      file_name: 'private-employee-document.pdf',
      file_path: filePath,
      mime_type: 'application/pdf',
      file_size: 128,
      uploaded_by_user_id: 'user-emp-atlas-2',
      created_at: new Date().toISOString(),
    });
  });

  const db = loadDb();
  const ownerId = db.employees.find((entry) => entry.id === 'emp-atlas-10')!.user_id!;
  const otherEmployeeId = db.employees.find((entry) => entry.id === 'emp-atlas-12')!.user_id!;
  const companyAdminId = db.users.find((entry) => entry.role_code === 'COMPANY_ADMIN' && entry.company_id === 'comp-atlas')!.id;
  const otherCompanyAdminId = db.users.find((entry) => entry.role_code === 'COMPANY_ADMIN' && entry.company_id === 'comp-maghreb')!.id;

  assert.equal(canAccessUpload(payloadFor(ownerId), filePath), true);
  assert.equal(canAccessUpload(payloadFor(companyAdminId), filePath), true);
  assert.equal(canAccessUpload(payloadFor(otherEmployeeId), filePath), false);
  assert.equal(canAccessUpload(payloadFor(otherCompanyAdminId), filePath), false);
  assert.equal(canAccessUpload(payloadFor(ownerId), '/api/uploads/unreferenced.pdf'), false);

  console.log('[PASS] Upload access requires an authorized reference and tenant/resource permission');
}

run().finally(cleanup).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
