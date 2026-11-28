# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth-and-permissions.spec.ts >> OTP recovery uses mocked email and resets the isolated fixture account
- Location: tests\e2e\auth-and-permissions.spec.ts:29:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Mot de passe oublié ?' })
    - waiting for "http://127.0.0.1:4179/" navigation to finish...
    - navigated to "http://127.0.0.1:4179/"

```

# Page snapshot

```yaml
- generic [ref=f6e3]:
  - generic [ref=f6e4]: "[plugin:vite:import-analysis] Failed to resolve import \"./OtpRecoveryModal.css\" from \"src/components/ui/OtpRecoveryModal.tsx\". Does the file exist?"
  - generic [ref=f6e5]: C:/Users/hp/Downloads/+hr-—-intelligent-human-resources-management-system/src/components/ui/OtpRecoveryModal.tsx:4:7
  - generic [ref=f6e6]: "2 | import { createPortal } from \"react-dom\"; 3 | import { X } from \"lucide-react\"; 4 | import \"./OtpRecoveryModal.css\"; | ^ 5 | var _jsxFileName = \"C:/Users/hp/Downloads/+hr-—-intelligent-human-resources-management-system/src/components/ui/OtpRe... 6 | import { jsxDEV as _jsxDEV } from \"react/jsx-dev-runtime\";"
  - generic [ref=f6e7]: at TransformPluginContext._formatLog (C:\Users\hp\Downloads\+hr-—-intelligent-human-resources-management-system\node_modules\vite\dist\node\chunks\node.js:8865:39) at TransformPluginContext.error (C:\Users\hp\Downloads\+hr-—-intelligent-human-resources-management-system\node_modules\vite\dist\node\chunks\node.js:8862:14) at resolveId (C:\Users\hp\Downloads\+hr-—-intelligent-human-resources-management-system\node_modules\vite\dist\node\chunks\node.js:26552:18) at async <anonymous> (C:\Users\hp\Downloads\+hr-—-intelligent-human-resources-management-system\node_modules\vite\dist\node\chunks\node.js:26651:23) at async Promise.all (index 3) at async TransformPluginContext.transform (C:\Users\hp\Downloads\+hr-—-intelligent-human-resources-management-system\node_modules\vite\dist\node\chunks\node.js:26624:4) at async EnvironmentPluginContainer.transform (C:\Users\hp\Downloads\+hr-—-intelligent-human-resources-management-system\node_modules\vite\dist\node\chunks\node.js:8636:14) at async loadAndTransform (C:\Users\hp\Downloads\+hr-—-intelligent-human-resources-management-system\node_modules\vite\dist\node\chunks\node.js:20112:26)
  - generic [ref=f6e8]:
    - text: Click outside, press Esc key, or fix the code to dismiss.You can also disable this overlay by setting
    - code [ref=f6e9]: server.hmr.overlay
    - text: to
    - code [ref=f6e10]: "false"
    - text: in
    - code [ref=f6e11]: vite.config.ts
    - text: .
```

# Test source

```ts
  1  | import { expect, test, type Page } from '@playwright/test';
  2  | import fs from 'node:fs';
  3  | import { e2eMailboxPath } from '../e2ePaths.js';
  4  | 
  5  | const employeeEmail = 'employe@atlas-industrial.ma';
  6  | const recoveryPassword = 'E2e#Recovery2026!';
  7  | 
  8  | async function login(page: Page, identifier: string, password: string, expectedRole?: string) {
  9  |   await page.goto('/');
  10 |   await page.locator('#login-identifier').fill(identifier);
  11 |   await page.locator('#login-password').fill(password);
  12 |   const loginResponse = page.waitForResponse((response) =>
  13 |     response.url().endsWith('/api/auth/login') && response.request().method() === 'POST'
  14 |   );
  15 |   await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  16 |   const response = await loginResponse;
  17 |   expect(response.status()).toBe(200);
  18 |   const data = await response.json() as { user: { role_code: string } };
  19 |   if (expectedRole) expect(data.user.role_code).toBe(expectedRole);
  20 |   await expect(page).toHaveURL(/\/$/);
  21 | }
  22 | 
  23 | async function logout(page: Page) {
  24 |   await page.locator('header button').last().click();
  25 |   await page.getByRole('button', { name: 'Déconnexion', exact: true }).click();
  26 |   await expect(page.locator('#login-identifier')).toBeVisible();
  27 | }
  28 | 
  29 | test('OTP recovery uses mocked email and resets the isolated fixture account', async ({ page }) => {
  30 |   await page.goto('/');
> 31 |   await page.getByRole('button', { name: 'Mot de passe oublié ?' }).click();
     |                                                                     ^ Error: locator.click: Test timeout of 60000ms exceeded.
  32 |   const dialog = page.getByRole('dialog');
  33 |   await expect(dialog).toBeVisible();
  34 |   await page.locator('#otp-recovery-email').fill(employeeEmail);
  35 |   await dialog.getByRole('button', { name: 'Envoyer le code' }).click();
  36 |   await expect(dialog.getByText(/recevrez un code de réinitialisation/)).toBeVisible();
  37 | 
  38 |   await expect.poll(() => fs.existsSync(e2eMailboxPath)).toBe(true);
  39 |   const code = fs.readFileSync(e2eMailboxPath, 'utf8');
  40 |   await page.locator('#otp-recovery-code').fill(code);
  41 |   await dialog.getByRole('button', { name: 'Vérifier le code' }).click();
  42 |   await expect(dialog.getByText(/Code vérifié/)).toBeVisible();
  43 |   await dialog.getByLabel('Nouveau mot de passe').fill(recoveryPassword);
  44 |   await dialog.getByLabel('Confirmer le mot de passe').fill(recoveryPassword);
  45 |   await dialog.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();
  46 |   await expect(dialog).toBeHidden();
  47 | 
  48 |   await login(page, 'ATL-010', recoveryPassword, 'EMPLOYEE');
  49 |   await expect(page.getByText('Tableau de bord').first()).toBeVisible();
  50 | });
  51 | 
  52 | test('all five roles sign in, retain protected-route boundaries, and sign out', async ({ page }) => {
  53 |   const roles = [
  54 |     { role: 'SUPER_ADMIN', identifier: 'SA-001', password: 'PlusHR#Super2026!', allowed: '/companies' },
  55 |     { role: 'COMPANY_ADMIN', identifier: 'admin@atlas-industrial.ma', password: 'Atlas#Admin2026!', allowed: '/employees' },
  56 |     { role: 'HR_MANAGER', identifier: 'ATL-002', password: 'Atlas#HR2026!', allowed: '/payroll' },
  57 |     { role: 'MANAGER', identifier: 'ATL-003', password: 'Atlas#Mgr2026!', allowed: '/tasks' },
  58 |     { role: 'EMPLOYEE', identifier: 'ATL-010', password: recoveryPassword, allowed: '/tasks' },
  59 |   ];
  60 | 
  61 |   for (const fixture of roles) {
  62 |     await login(page, fixture.identifier, fixture.password, fixture.role);
  63 |     await page.goto(fixture.allowed);
  64 |     await expect(page.getByText('Accès non autorisé')).toHaveCount(0);
  65 | 
  66 |     if (fixture.role === 'EMPLOYEE') {
  67 |       await page.goto('/companies');
  68 |       await expect(page.getByText('Accès non autorisé')).toBeVisible();
  69 |     }
  70 | 
  71 |     if (fixture.role === 'COMPANY_ADMIN') {
  72 |       const employeesResponse = page.waitForResponse((response) =>
  73 |         response.url().endsWith('/api/employees') && response.request().method() === 'GET'
  74 |       );
  75 |       await page.goto('/employees');
  76 |       const response = await employeesResponse;
  77 |       expect(response.status()).toBe(200);
  78 |       const data = await response.json() as { employees: Array<{ company_id: string }> };
  79 |       expect(data.employees.every((employee) => employee.company_id === 'comp-atlas')).toBe(true);
  80 |     }
  81 | 
  82 |     await logout(page);
  83 |   }
  84 | });
  85 | 
  86 | test('landing page has no horizontal overflow at mobile width', async ({ page }) => {
  87 |   await page.setViewportSize({ width: 390, height: 844 });
  88 |   await page.goto('/');
  89 |   expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  90 |   await expect(page.locator('#login-identifier')).toBeVisible();
  91 | });
  92 | 
```