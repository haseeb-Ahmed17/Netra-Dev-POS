import type { SellingUnit } from './lib/unitUtils';

export type Language = 'en' | 'ur';
export type { SellingUnit };

export type NavTab =
  | 'pos'
  | 'orders_omnichannel'
  | 'dashboard'
  | 'transactions'
  | 'shifts'
  | 'inventory'
  | 'inventory_report'
  | 'purchases'
  | 'vendors'
  | 'expenses'
  | 'customers'
  | 'udhaar'
  | 'branches'
  | 'staff'
  | 'settings'
  | 'audit_logs'
  | 'saas_admin'
  | 'ai_assistant';

export type CategoryId = 'all' | 'beverages' | 'bakery' | 'pantry';

export type PaymentMethod =
  | 'cash'
  | 'jazzcash'
  | 'easypaisa'
  | 'card'
  | 'bank_transfer'
  | 'udhaar'
  | 'mobile';

export type ScannerMode = 'hid' | 'camera_barcode' | 'camera_qr';

export interface ShopkeeperUser {
  id: string;
  email: string;
  shopName: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  isMain: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  qrCode?: string;
  nameEn: string;
  nameUr: string;
  category: Exclude<CategoryId, 'all'>;
  brand?: string;
  variant?: string;
  price: number;
  wholesalePrice?: number;
  cost: number;
  taxRate: number;
  sellingUnit: SellingUnit;
  stock: number;
  minStock?: number;
  reorderLevel?: number;
  batchNumber?: string;
  expiryDate?: string; // YYYY-MM-DD
  branchId?: string;
  branchStock?: Record<string, number>;
  image: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
  enteredUnit?: SellingUnit;
  itemDiscountPercent?: number;
  itemDiscountFixed?: number;
  isReturn?: boolean;
}

export interface HeldBill {
  id: string;
  label: string;
  createdAt: string;
  cashierName: string;
  branchId?: string;
  cart: CartItem[];
  customerId?: string;
  customerName: string;
  discountPercent: number;
  discountMode: 'percent' | 'fixed';
  fixedDiscountAmount: number;
  note?: string;
}

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export type ReturnStatus =
  | 'completed'
  | 'partially_refunded'
  | 'refunded'
  | 'exchanged'
  | 'cancelled';

export interface OrderLineItem {
  productId: string;
  sku: string;
  nameEn: string;
  nameUr: string;
  category: Exclude<CategoryId, 'all'>;
  unitPrice: number;
  unitCost: number;
  taxRate: number;
  sellingUnit?: SellingUnit;
  enteredUnit?: SellingUnit;
  enteredQuantity?: number;
  itemDiscountAmount?: number;
  quantity: number; // Always in product's base sellingUnit for stock math
  lineTotal: number;
  isReturn?: boolean;
  returnedQty?: number;
  refundedQty?: number;
  exchangedQty?: number;
}

export interface OrderRecord {
  id: string;
  receiptNumber: string;
  createdAt: string; // ISO timestamp
  branchId?: string;
  branchName?: string;
  cashierId?: string;
  cashierName?: string;
  shiftId?: string;
  customerId?: string;
  customerName: string;
  udhaarCustomerId?: string;
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  items: OrderLineItem[];
  subtotal: number;
  discountPercent: number;
  discountMode?: 'percent' | 'fixed';
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  paidAmount?: number;
  balanceDue?: number;
  amountTendered: number;
  changeDue: number;
  transactionId?: string;
  clientTxRef?: string;
  returnStatus?: ReturnStatus;
  refundedAmount?: number;
  returnedAt?: string;
  returnNote?: string;
  cancellationReason?: string;
  cancelledBy?: string;
  cancelledAt?: string;
}

export type UdhaarEntryType = 'credit' | 'payment';

export type ReminderSchedule =
  | 'none'
  | '3_days'
  | '1_week'
  | '2_weeks'
  | '1_month'
  | 'custom';

export interface UdhaarCustomer {
  id: string;
  name: string;
  phone: string;
  notes?: string;
  creditLimit?: number;
  discountPercent?: number;
  reminderSchedule?: ReminderSchedule;
  dueDate?: string; // YYYY-MM-DD
  whatsappOptIn?: boolean;
  createdAt: string;
}

export interface UdhaarEntry {
  id: string;
  customerId: string;
  type: UdhaarEntryType;
  amount: number;
  note: string;
  receiptNumber?: string;
  createdAt: string;
}

// Phase 2 (existing): Vendors, Purchases & Inventory Adjustments

export interface Vendor {
  id: string;
  name: string;
  company: string;
  phone: string;
  address: string;
  balance: number;
  createdAt: string;
}

export interface SupplierPayment {
  id: string;
  vendorId: string;
  purchaseId?: string;
  amount: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'jazzcash' | 'easypaisa';
  note: string;
  employeeName?: string;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  sku: string;
  sellingUnit?: SellingUnit;
  quantity: number;
  unitCost: number;
  lineTotal: number;
  batchNumber?: string;
  expiryDate?: string;
}

export type PurchaseOrderStatus = 'ordered' | 'partial' | 'received' | 'returned';

export interface PurchaseRecord {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  status?: PurchaseOrderStatus;
  branchId?: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  returnedAmount?: number;
  note: string;
  items: PurchaseItem[];
  createdAt: string;
}

export interface PurchaseReturnRecord {
  id: string;
  purchaseId: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  branchId?: string;
  items: PurchaseItem[];
  totalAmount: number;
  reason: string;
  employeeName?: string;
  createdAt: string;
}

export type AdjustmentType =
  | 'Damaged'
  | 'Expired'
  | 'Lost/Theft'
  | 'Stock Count Correction'
  | 'Sale Stock Out'
  | 'Sale Return In'
  | 'Purchase Stock In'
  | 'Purchase Return Out'
  | 'Branch Transfer';

export interface InventoryAdjustment {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  sellingUnit?: SellingUnit;
  branchId?: string;
  adjustmentType: AdjustmentType;
  quantityChange: number;
  previousStock: number;
  newStock: number;
  reason: string;
  actorName?: string;
  createdAt: string;
}

// Phase 3 (existing): Customers, Staff & Permissions, Store Settings

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  balance: number;
  creditLimit?: number;
  discountPercent?: number;
  dueDate?: string;
  reminderSchedule?: ReminderSchedule;
  notes?: string;
  whatsappOptIn?: boolean;
  whatsappOptInAt?: string;
  createdAt: string;
}

export type EmployeeRole = 'admin' | 'manager' | 'cashier';

export type EmployeePinState =
  | 'hashed'
  | 'demo_fixture'
  | 'legacy_4digit'
  | 'unconfigured';

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: EmployeeRole;
  pinHash: string;
  hasPin?: boolean;
  isDemoFixturePin?: boolean;
  pinState?: EmployeePinState;
  isActive: boolean;
  branchId?: string;
  shiftAssignment?: string;
  customPermissions?: string[];
  createdAt: string;
}

export interface StaffSessionInfo {
  token: string;
  employeeId: string;
  role: EmployeeRole;
  expiresAt: string;
}

export interface StoreSettings {
  storeName: string;
  phone: string;
  address: string;
  taxNumber: string;
  receiptFooter: string;
  defaultTaxRate?: number;
  thermalPaperWidth?: '58mm' | '80mm';
  enabledPaymentMethods?: PaymentMethod[];
  bankName?: string;
  bankAccountTitle?: string;
  bankAccountNumber?: string;
  jazzcashAccountTitle?: string;
  jazzcashAccountNumber?: string;
  easypaisaAccountTitle?: string;
  easypaisaAccountNumber?: string;
  autoKickDrawer?: boolean;
  showCustomerDisplay?: boolean;
  whatsappAutoReceipts?: boolean;
  whatsappTemplateReceipt?: string;
  whatsappTemplateReminder?: string;
  storefrontSlug?: string;
  storefrontEnabled?: boolean;
  storefrontDescription?: string;
  codEnabled?: boolean;
  whatsappPhoneNumberId?: string;
  onlinePaymentEnabled?: boolean;
}

// Phase 4 (existing) & Phase 11: Offline Queue & Sync History

export interface OfflineQueuedSale {
  id: string;
  userId: string;
  createdAt: string;
  localUpdatedAt?: string;
  order: OrderRecord;
  updatedProducts: Product[];
  newUdhaarCustomer?: UdhaarCustomer;
  newUdhaarEntry?: UdhaarEntry;
  updatedCustomer?: Customer;
}

export interface SyncHistoryEntry {
  id: string;
  actionType: 'sale_sync' | 'conflict_detected' | 'sync_error' | 'manual_sync';
  summary: string;
  status: 'synced' | 'conflict' | 'failed';
  detail: string;
  createdAt: string;
}

// Phase 5 (existing) & Phase 14: Commercial SaaS Subscriptions, Shop Expenses

export interface SubscriptionPaymentEntry {
  id: string;
  amount: number;
  currency: string;
  planName: string;
  paidAt: string;
  note: string;
}

export type ShopSubscriptionStatus = 'active' | 'suspended' | 'blocked';

export interface SubscriptionRecord {
  userId: string;
  email: string;
  shopName?: string;
  planName: string;
  expiresAt: string; // ISO timestamp
  isBlocked: boolean;
  status?: ShopSubscriptionStatus;
  suspendedReason?: string;
  suspendedAt?: string;
  trialEndsAt?: string;
  maxBranches?: number;
  maxEmployees?: number;
  employeeCount?: number;
  activeEmployeeCount?: number;
  adminConfigured?: boolean;
  lastSignInAt?: string;
  paymentHistory?: SubscriptionPaymentEntry[];
  createdAt: string;
  updatedAt?: string;
}

export interface SaasAuditLogEntry {
  id: string;
  actorUserId?: string;
  actorEmail: string;
  targetUserId: string;
  targetEmail: string;
  targetShopName?: string;
  action: string;
  previousStatus?: string;
  newStatus?: string;
  details: string;
  createdAt: string;
}

export type ExpenseCategory =
  | 'Rent'
  | 'Electricity'
  | 'Staff Salary'
  | 'Supplies'
  | 'Maintenance'
  | 'Other';

export interface ExpenseRecord {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  notes: string;
  expenseDate: string; // YYYY-MM-DD
  branchId?: string;
  isRecurring?: boolean;
  recurrenceInterval?: 'weekly' | 'monthly' | 'yearly';
  nextDueDate?: string;
  approvalStatus?: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  paidFromDrawer?: boolean;
  createdAt: string;
}

// Phase 2 (Master): Cash Drawer & Cashier Shifts

export type CashDrawerMovementType =
  | 'opening'
  | 'cash_sale'
  | 'cash_refund'
  | 'cash_in'
  | 'cash_out'
  | 'expense'
  | 'closing';

export interface CashDrawerMovement {
  id: string;
  shiftId: string;
  branchId?: string;
  type: CashDrawerMovementType;
  amount: number;
  note: string;
  employeeId: string;
  employeeName: string;
  createdAt: string;
}

export interface CashShift {
  id: string;
  branchId?: string;
  cashierId: string;
  cashierName: string;
  startedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  openingCash: number;
  expectedCash: number;
  actualCash?: number;
  cashDifference?: number;
  cashSalesTotal: number;
  cashRefundsTotal: number;
  cashInTotal: number;
  cashOutTotal: number;
  expenseTotal: number;
  closedById?: string;
  closedByName?: string;
  closingNote?: string;
  movements: CashDrawerMovement[];
}

// Phase 7: WhatsApp Message Logs

export type WhatsAppMessageType =
  | 'receipt'
  | 'udhaar_receipt'
  | 'reminder'
  | 'statement';

export interface WhatsAppMessageLog {
  id: string;
  customerId?: string;
  customerName: string;
  phone: string;
  messageType: WhatsAppMessageType;
  content: string;
  status: 'sent_api' | 'manual_fallback' | 'failed' | 'pending_retry';
  deliveryMode: 'cloud_api' | 'manual_link';
  providerMessageId?: string;
  errorMessage?: string;
  attempts: number;
  createdAt: string;
}

// Phase 10: Inter-Branch Stock Transfers

export interface StockTransferItem {
  productId: string;
  sku: string;
  nameEn: string;
  nameUr: string;
  quantity: number;
  sellingUnit: SellingUnit;
}

export interface StockTransfer {
  id: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  items: StockTransferItem[];
  requestedBy: string;
  approvedBy?: string;
  note: string;
  createdAt: string;
  completedAt?: string;
}

// Phase 12 & 15: Employee Activity Logs & Business Audit Logs

export interface EmployeeActivityLog {
  id: string;
  employeeId: string;
  employeeName: string;
  role: EmployeeRole;
  eventType: 'login' | 'logout' | 'pin_switch' | 'lock';
  branchId?: string;
  createdAt: string;
}

export type AuditCategory =
  | 'price_change'
  | 'stock_adjustment'
  | 'refund'
  | 'drawer_movement'
  | 'permission_change'
  | 'shift'
  | 'backup'
  | 'sale_cancel'
  | 'transfer'
  | 'subscription';

export interface AuditLogEntry {
  id: string;
  category: AuditCategory;
  actorId: string;
  actorName: string;
  actorRole: EmployeeRole;
  action: string;
  targetId?: string;
  targetName?: string;
  details: string;
  previousValue?: string;
  newValue?: string;
  branchId?: string;
  createdAt: string;
}

export type AiAssistantLanguageMode = 'auto' | 'en' | 'ur' | 'roman_ur';

export type AiAssistantAllowedMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif';

export interface AiAssistantAttachmentPayload {
  mimeType: AiAssistantAllowedMimeType;
  base64Data: string;
  fileName?: string;
}

export interface AiAssistantHistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface AiAssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  language?: AiAssistantLanguageMode;
  imagePreviewUrl?: string;
  imageName?: string;
  createdAt: string;
  error?: boolean;
  modelUsed?: string;
}

export interface AiAssistantStatusResponse {
  available: boolean;
  configured: boolean;
  enabled: boolean;
  model: string;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  maxImageBytes: number;
  reason?: string;
}

// Omnichannel Order Management & Public Storefront

export type OrderChannel = 'website' | 'whatsapp' | 'phone';

export type OmnichannelOrderStatus =
  | 'new'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'rejected'
  | 'cancelled';

export type OmnichannelPaymentMethod =
  | 'cod'
  | 'cash'
  | 'jazzcash'
  | 'easypaisa'
  | 'card'
  | 'bank_transfer'
  | 'udhaar'
  | 'online';

export type OmnichannelPaymentStatus =
  | 'unpaid'
  | 'cod_pending'
  | 'partially_paid'
  | 'paid'
  | 'refunded';

export interface OmnichannelOrderItem {
  productId: string;
  sku: string;
  nameEn: string;
  nameUr: string;
  category: Exclude<CategoryId, 'all'>;
  sellingUnit: SellingUnit;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
}

export interface OmnichannelStatusHistoryEntry {
  status: OmnichannelOrderStatus;
  changedAt: string;
  actorId: string;
  actorName: string;
  actorRole: EmployeeRole | 'customer' | 'webhook';
  note?: string;
}

export interface OmnichannelNotificationEntry {
  id: string;
  event: 'new_order' | 'order_accepted' | 'order_ready' | 'order_delivered';
  channel: 'whatsapp';
  status: 'sent' | 'manual_fallback' | 'skipped' | 'failed';
  recipientPhone: string;
  messagePreview: string;
  manualShareUrl?: string;
  error?: string;
  createdAt: string;
}

export interface OmnichannelOrder {
  id: string;
  userId?: string;
  orderNumber: string;
  channel: OrderChannel;
  status: OmnichannelOrderStatus;
  branchId?: string;
  branchName?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  notes?: string;
  items: OmnichannelOrderItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  paymentMethod: OmnichannelPaymentMethod;
  paymentStatus: OmnichannelPaymentStatus;
  paidAmount: number;
  idempotencyKey?: string;
  externalMessageId?: string;
  stockReserved: boolean;
  stockReservedAt?: string;
  stockRestoredAt?: string;
  statusHistory: OmnichannelStatusHistoryEntry[];
  notificationLog: OmnichannelNotificationEntry[];
  cancellationReason?: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicStorefrontProduct {
  id: string;
  sku: string;
  nameEn: string;
  nameUr: string;
  category: Exclude<CategoryId, 'all'>;
  brand?: string;
  variant?: string;
  price: number;
  sellingUnit: SellingUnit;
  stock: number;
  branchStock?: Record<string, number>;
  image: string;
}

export interface PublicStorefrontData {
  storeSlug: string;
  storeName: string;
  storeDescription: string;
  phone: string;
  address: string;
  codEnabled: boolean;
  onlinePaymentConfigured: boolean;
  whatsappConfigured: boolean;
  defaultTaxRate: number;
  branches: Array<{ id: string; name: string; isMain: boolean }>;
  products: PublicStorefrontProduct[];
}


