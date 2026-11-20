export type Language = 'en' | 'ur';

export type NavTab = 'pos' | 'dashboard' | 'transactions' | 'inventory' | 'udhaar';

export type CategoryId = 'all' | 'beverages' | 'bakery' | 'pantry';

export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'udhaar';

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
  quantity: number;
  lineTotal: number;
}

export interface OrderRecord {
  id: string;
  receiptNumber: string;
  createdAt: string; // ISO timestamp
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

export interface UdhaarCustomer {
  id: string;
  name: string;
  phone: string;
  notes?: string;
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
