export function isDemoModeEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_ACCOUNTS !== 'false';
}

export const demoPasswords = new Set([
  'PlusHR#Super2026!',
  'Atlas#Admin2026!', 'Atlas#HR2026!', 'Atlas#Mgr2026!', 'Atlas#Emp2026!',
  'Maghreb#Admin2026!', 'Maghreb#HR2026!', 'Maghreb#Mgr2026!', 'Maghreb#Emp2026!',
]);
