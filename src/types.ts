export type Language = 'en' | 'ur';

export type NavTab =
  | 'pos'
  | 'dashboard'
  | 'transactions'
  | 'inventory'
  | 'inventory_report'
  | 'purchases'
  | 'vendors'
  | 'expenses'
  | 'customers'
  | 'udhaar'
  | 'staff'
  | 'settings'
  | 'saas_admin';

export type CategoryId = 'all' | 'beverages' | 'bakery' | 'pantry';

export type PaymentMethod =
  | 'cash'
  | 'jazzcash'
  | 'easypaisa'
  | 'card'
  | 'udhaar'
  | 'mobile';

export interface ShopkeeperUser {
  id: string;
  email: string;
  shopName: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  nameEn: string;
  nameUr: string;
  category: Exclude<CategoryId, 'all'>;
  price: number;
  cost: number;
  taxRate: number;
  stock: number;
  image: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface OrderLineItem {
  productId: string;
  sku: string;
  nameEn: string;
  nameUr: string;
  category: Exclude<CategoryId, 'all'>;
  unitPrice: number;
  unitCost: number;
  taxRate: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderRecord {
  id: string;
  receiptNumber: string;
  createdAt: string; // ISO timestamp
  customerId?: string;
  customerName: string;
  udhaarCustomerId?: string;
  paymentMethod: PaymentMethod;
  items: OrderLineItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  amountTendered: number;
  changeDue: number;
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
  reminderSchedule?: ReminderSchedule;
  dueDate?: string; // YYYY-MM-DD
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

// Phase 2: Vendors, Purchases & Inventory Adjustments

export interface Vendor {
  id: string;
  name: string;
  company: string;
  phone: string;
  address: string;
  balance: number;
  createdAt: string;
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseRecord {
  id: string;
  vendorId: string;
  vendorName: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  note: string;
  items: PurchaseItem[];
  createdAt: string;
}

export type AdjustmentType =
  | 'Damaged'
  | 'Expired'
  | 'Lost/Theft'
  | 'Stock Count Correction';

export interface InventoryAdjustment {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  adjustmentType: AdjustmentType;
  quantityChange: number;
  previousStock: number;
  newStock: number;
  reason: string;
  createdAt: string;
}

// Phase 3: Customers, Staff & Permissions, Store Settings

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  balance: number;
  createdAt: string;
}

export type EmployeeRole = 'admin' | 'manager' | 'cashier';

export interface Employee {
  id: string;
  name: string;
  phone: string;
  role: EmployeeRole;
  pinCode: string;
  isActive: boolean;
  createdAt: string;
}

export interface StoreSettings {
  storeName: string;
  phone: string;
  address: string;
  taxNumber: string;
  receiptFooter: string;
}

// Phase 4: Offline Queue & Sync
export interface OfflineQueuedSale {
  id: string;
  userId: string;
  createdAt: string;
  order: OrderRecord;
  updatedProducts: Product[];
  newUdhaarEntry?: UdhaarEntry;
  updatedCustomer?: Customer;
}

// Phase 5: Commercial SaaS Subscriptions, Shop Expenses
export interface SubscriptionRecord {
  userId: string;
  email: string;
  shopName?: string;
  planName: string;
  expiresAt: string; // ISO timestamp
  isBlocked: boolean;
  createdAt: string;
  updatedAt?: string;
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
  createdAt: string;
}

