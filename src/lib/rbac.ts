import type { EmployeeRole, NavTab } from '../types';

export type AppTabId = NavTab;

export const ROLE_ALLOWED_TABS: Record<EmployeeRole, AppTabId[]> = {
  admin: [
    'pos',
    'dashboard',
    'transactions',
    'shifts',
    'inventory',
    'inventory_report',
    'purchases',
    'vendors',
    'expenses',
    'customers',
    'udhaar',
    'branches',
    'staff',
    'settings',
    'audit_logs',
    'ai_assistant',
  ],
  manager: [
    'pos',
    'dashboard',
    'transactions',
    'shifts',
    'inventory',
    'inventory_report',
    'purchases',
    'vendors',
    'expenses',
    'customers',
    'udhaar',
    'branches',
    'audit_logs',
    'ai_assistant',
  ],
  cashier: ['pos', 'transactions', 'shifts', 'customers', 'ai_assistant'],
};

export type RoleAction =
  | 'dashboard.view'
  | 'reports.view'
  | 'pos.checkout'
  | 'orders.read'
  | 'orders.return'
  | 'orders.cancel'
  | 'shifts.manage'
  | 'shifts.close'
  | 'inventory.write'
  | 'purchases.write'
  | 'vendors.write'
  | 'expenses.write'
  | 'expenses.approve'
  | 'customers.write'
  | 'customers.delete'
  | 'udhaar.write'
  | 'branches.manage'
  | 'transfers.approve'
  | 'whatsapp.send'
  | 'audit.view'
  | 'backup.manage'
  | 'staff.manage'
  | 'settings.write'
  | 'workspace.reset'
  | 'ai.assist';

export const ALL_ROLE_ACTIONS: RoleAction[] = [
  'dashboard.view',
  'reports.view',
  'pos.checkout',
  'orders.read',
  'orders.return',
  'orders.cancel',
  'shifts.manage',
  'shifts.close',
  'inventory.write',
  'purchases.write',
  'vendors.write',
  'expenses.write',
  'expenses.approve',
  'customers.write',
  'customers.delete',
  'udhaar.write',
  'branches.manage',
  'transfers.approve',
  'whatsapp.send',
  'audit.view',
  'backup.manage',
  'staff.manage',
  'settings.write',
  'workspace.reset',
  'ai.assist',
];

const ACTION_REQUIRED_ROLES: Record<RoleAction, EmployeeRole[]> = {
  'dashboard.view': ['admin', 'manager'],
  'reports.view': ['admin', 'manager'],
  'pos.checkout': ['admin', 'manager', 'cashier'],
  'orders.read': ['admin', 'manager', 'cashier'],
  'orders.return': ['admin', 'manager', 'cashier'],
  'orders.cancel': ['admin', 'manager'],
  'shifts.manage': ['admin', 'manager', 'cashier'],
  'shifts.close': ['admin', 'manager'],
  'inventory.write': ['admin', 'manager'],
  'purchases.write': ['admin', 'manager'],
  'vendors.write': ['admin', 'manager'],
  'expenses.write': ['admin', 'manager'],
  'expenses.approve': ['admin', 'manager'],
  'customers.write': ['admin', 'manager', 'cashier'],
  'customers.delete': ['admin'],
  'udhaar.write': ['admin', 'manager', 'cashier'],
  'branches.manage': ['admin'],
  'transfers.approve': ['admin', 'manager'],
  'whatsapp.send': ['admin', 'manager', 'cashier'],
  'audit.view': ['admin', 'manager'],
  'backup.manage': ['admin'],
  'staff.manage': ['admin'],
  'settings.write': ['admin'],
  'workspace.reset': ['admin'],
  'ai.assist': ['admin', 'manager', 'cashier'],
};

export function getRequiredRolesForAction(action: RoleAction): EmployeeRole[] {
  return ACTION_REQUIRED_ROLES[action];
}

export function hasRolePermission(
  role: EmployeeRole | null | undefined,
  action: RoleAction,
  customPermissions?: string[] | null
): boolean {
  if (!role) return false;
  if (role === 'admin') return true;
  if (Array.isArray(customPermissions) && customPermissions.length > 0) {
    // Custom permission overrides allow granting extra safe operational actions
    // while keeping critical system actions (staff.manage, backup.manage, workspace.reset, settings.write) admin-only.
    const adminOnlyActions: RoleAction[] = [
      'staff.manage',
      'backup.manage',
      'workspace.reset',
      'settings.write',
      'customers.delete',
      'branches.manage',
    ];
    if (!adminOnlyActions.includes(action) && customPermissions.includes(action)) {
      return true;
    }
  }
  return ACTION_REQUIRED_ROLES[action].includes(role);
}

export function canAccessTab(
  role: EmployeeRole | null | undefined,
  tab: AppTabId,
  isSuperAdmin = false
): boolean {
  if (tab === 'saas_admin') {
    return Boolean(isSuperAdmin);
  }
  if (!role) return false;
  return ROLE_ALLOWED_TABS[role].includes(tab);
}
