import { createInitialBranches } from '../data/initialData';
import type {
  AuditLogEntry,
  Branch,
  CashShift,
  EmployeeActivityLog,
  HeldBill,
  OmnichannelOrder,
  PurchaseReturnRecord,
  StockTransfer,
  SupplierPayment,
  SyncHistoryEntry,
  WhatsAppMessageLog,
} from '../types';
import { idbGetItem, idbSetItem } from './indexedDbStore';

export interface ExtendedWorkspaceModules {
  branches: Branch[];
  activeBranchId: string;
  cashShifts: CashShift[];
  stockTransfers: StockTransfer[];
  supplierPayments: SupplierPayment[];
  purchaseReturns: PurchaseReturnRecord[];
  heldBills: HeldBill[];
  whatsappLogs: WhatsAppMessageLog[];
  auditLogs: AuditLogEntry[];
  employeeActivityLogs: EmployeeActivityLog[];
  syncHistory: SyncHistoryEntry[];
  omnichannelOrders: OmnichannelOrder[];
}

function extStorageKey(userId: string): string {
  return `khaas_pos_extended_${userId}_v1`;
}

export function createDefaultExtendedModules(
  shopName = 'Khaas Retail'
): ExtendedWorkspaceModules {
  const branches = createInitialBranches(shopName);
  return {
    branches,
    activeBranchId: branches[0]?.id || 'branch-main',
    cashShifts: [],
    stockTransfers: [],
    supplierPayments: [],
    purchaseReturns: [],
    heldBills: [],
    whatsappLogs: [],
    auditLogs: [],
    employeeActivityLogs: [],
    syncHistory: [],
    omnichannelOrders: [],
  };
}

export function loadExtendedModulesSync(
  userId: string,
  shopName?: string
): ExtendedWorkspaceModules {
  const fallback = createDefaultExtendedModules(shopName);
  try {
    const raw = globalThis.localStorage?.getItem(extStorageKey(userId));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ExtendedWorkspaceModules>;
    const branches =
      Array.isArray(parsed.branches) && parsed.branches.length > 0
        ? parsed.branches
        : fallback.branches;
    return {
      branches,
      activeBranchId: parsed.activeBranchId || branches[0]?.id || 'branch-main',
      cashShifts: Array.isArray(parsed.cashShifts) ? parsed.cashShifts : [],
      stockTransfers: Array.isArray(parsed.stockTransfers) ? parsed.stockTransfers : [],
      supplierPayments: Array.isArray(parsed.supplierPayments) ? parsed.supplierPayments : [],
      purchaseReturns: Array.isArray(parsed.purchaseReturns) ? parsed.purchaseReturns : [],
      heldBills: Array.isArray(parsed.heldBills) ? parsed.heldBills : [],
      whatsappLogs: Array.isArray(parsed.whatsappLogs) ? parsed.whatsappLogs : [],
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [],
      employeeActivityLogs: Array.isArray(parsed.employeeActivityLogs)
        ? parsed.employeeActivityLogs
        : [],
      syncHistory: Array.isArray(parsed.syncHistory) ? parsed.syncHistory : [],
      omnichannelOrders: Array.isArray(parsed.omnichannelOrders) ? parsed.omnichannelOrders : [],
    };
  } catch {
    return fallback;
  }
}

export async function loadExtendedModulesAsync(
  userId: string,
  shopName?: string
): Promise<ExtendedWorkspaceModules> {
  const fromIdb = await idbGetItem<ExtendedWorkspaceModules>(extStorageKey(userId));
  if (fromIdb && Array.isArray(fromIdb.branches) && fromIdb.branches.length > 0) {
    return {
      ...createDefaultExtendedModules(shopName),
      ...fromIdb,
    };
  }
  const syncData = loadExtendedModulesSync(userId, shopName);
  await idbSetItem(extStorageKey(userId), syncData);
  return syncData;
}

export function saveExtendedModules(
  userId: string,
  modules: ExtendedWorkspaceModules
): void {
  try {
    globalThis.localStorage?.setItem(extStorageKey(userId), JSON.stringify(modules));
  } catch {
    // ignore storage quota errors; IndexedDB retains full snapshot
  }
  void idbSetItem(extStorageKey(userId), modules);
}

export interface FullBackupPayload {
  schemaVersion: 2;
  exportedAt: string;
  userId: string;
  shopName: string;
  workspace: Record<string, unknown>;
  extended: ExtendedWorkspaceModules;
}

export function buildWorkspaceBackupJson(params: {
  userId: string;
  shopName: string;
  workspace: Record<string, unknown>;
  extended: ExtendedWorkspaceModules;
}): string {
  const payload: FullBackupPayload = {
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    userId: params.userId,
    shopName: params.shopName,
    workspace: params.workspace,
    extended: params.extended,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseWorkspaceBackupJson(
  rawJson: string
): { valid: true; payload: FullBackupPayload } | { valid: false; error: string } {
  try {
    const parsed = JSON.parse(rawJson) as Partial<FullBackupPayload>;
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'Backup file is not a valid JSON object.' };
    }
    if (!parsed.workspace || typeof parsed.workspace !== 'object') {
      return { valid: false, error: 'Backup file is missing core workspace data.' };
    }
    if (!Array.isArray((parsed.workspace as Record<string, unknown>).products)) {
      return { valid: false, error: 'Backup file is missing products array.' };
    }
    return {
      valid: true,
      payload: {
        schemaVersion: 2,
        exportedAt: String(parsed.exportedAt || new Date().toISOString()),
        userId: String(parsed.userId || ''),
        shopName: String(parsed.shopName || 'Khaas Retail'),
        workspace: parsed.workspace,
        extended: {
          ...createDefaultExtendedModules(parsed.shopName),
          ...(parsed.extended || {}),
        },
      },
    };
  } catch {
    return { valid: false, error: 'Unable to parse backup JSON file.' };
  }
}
