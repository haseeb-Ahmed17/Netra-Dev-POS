import type {
  Customer,
  Employee,
  ExpenseRecord,
  InventoryAdjustment,
  OrderRecord,
  Product,
  PurchaseRecord,
  StoreSettings,
  UdhaarCustomer,
  UdhaarEntry,
  Vendor,
} from '../types';

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-latte',
    sku: 'BEV-101',
    barcode: '8964001101018',
    nameEn: 'Iced Spanish Latte',
    nameUr: 'آئسڈ اسپینش لاٹے',
    category: 'beverages',
    price: 680,
    cost: 290,
    taxRate: 0,
    stock: 42,
    image: '/src/assets/images/pos_spanish_latte_1795187449452.jpg',
  },
  {
    id: 'prod-chai',
    sku: 'BEV-102',
    barcode: '8964001101025',
    nameEn: 'Spiced Cardamom Chai',
    nameUr: 'الائچی مصالحہ چائے',
    category: 'beverages',
    price: 420,
    cost: 150,
    taxRate: 0,
    stock: 60,
    image: '/src/assets/images/pos_cardamom_chai_1795187451326.jpg',
  },
  {
    id: 'prod-croissant',
    sku: 'BAK-201',
    barcode: '8964001202014',
    nameEn: 'French Butter Croissant',
    nameUr: 'فرینچ بٹر کروسینٹ',
    category: 'bakery',
    price: 540,
    cost: 220,
    taxRate: 0,
    stock: 24,
    image: '/src/assets/images/pos_butter_croissant_1795187451068.jpg',
  },
  {
    id: 'prod-baklava',
    sku: 'BAK-202',
    barcode: '8964001202021',
    nameEn: 'Pistachio Baklava Box',
    nameUr: 'پستہ بقلاوہ باکس',
    category: 'bakery',
    price: 1450,
    cost: 680,
    taxRate: 0,
    stock: 16,
    image: '/src/assets/images/pos_pistachio_baklava_1795187450996.jpg',
  },
  {
    id: 'prod-honey',
    sku: 'PAN-301',
    barcode: '8964001303018',
    nameEn: 'Raw Yemeni Sidr Honey',
    nameUr: 'خالص سدر شہد (340 گرام)',
    category: 'pantry',
    price: 3200,
    cost: 1950,
    taxRate: 0,
    stock: 14,
    image: '/src/assets/images/pos_sidr_honey_1795187451502.jpg',
  },
  {
    id: 'prod-almonds',
    sku: 'PAN-302',
    barcode: '8964001303025',
    nameEn: 'Roasted Saffron Almonds',
    nameUr: 'زعفرانی بھنے ہوئے بادام',
    category: 'pantry',
    price: 1650,
    cost: 920,
    taxRate: 0,
    stock: 19,
    image: '/src/assets/images/pos_saffron_almonds_1795187451775.jpg',
  },
];

function todayAtHour(hour: number, minute: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (d.getTime() > now.getTime()) {
    return new Date(now.getTime() - (24 - hour) * 3600_000).toISOString();
  }
  return d.toISOString();
}

function daysAgo(days: number, hour = 14): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 15, 0, 0);
  return d.toISOString();
}

function thisMonthEarlierDay(hour = 15): string {
  const now = new Date();
  const targetDay = now.getDate() > 2 ? now.getDate() - 2 : 1;
  const d = new Date(now.getFullYear(), now.getMonth(), targetDay, hour, 20, 0, 0);
  if (d.getTime() > now.getTime()) {
    return daysAgo(1, hour);
  }
  return d.toISOString();
}

function earlierThisYear(hour = 16): string {
  const now = new Date();
  const targetMonth = now.getMonth() > 0 ? now.getMonth() - 1 : 0;
  const d = new Date(now.getFullYear(), targetMonth, 12, hour, 10, 0, 0);
  return d.toISOString();
}

export function createInitialOrders(): OrderRecord[] {
  return [
    {
      id: 'ord-0997',
      receiptNumber: 'KR-2026-0997',
      createdAt: earlierThisYear(16),
      customerId: 'cust-1',
      customerName: 'Zainab Tariq',
      paymentMethod: 'jazzcash',
      items: [
        {
          productId: 'prod-honey',
          sku: 'PAN-301',
          nameEn: 'Raw Yemeni Sidr Honey',
          nameUr: 'خالص سدر شہد (340 گرام)',
          category: 'pantry',
          unitPrice: 3200,
          unitCost: 1950,
          taxRate: 5,
          quantity: 2,
          lineTotal: 6400,
        },
        {
          productId: 'prod-baklava',
          sku: 'BAK-202',
          nameEn: 'Pistachio Baklava Box',
          nameUr: 'پستہ بقلاوہ باکس',
          category: 'bakery',
          unitPrice: 1450,
          unitCost: 680,
          taxRate: 5,
          quantity: 1,
          lineTotal: 1450,
        },
      ],
      subtotal: 7850,
      discountPercent: 5,
      discountAmount: 393,
      taxRate: 0.05,
      taxAmount: 373,
      total: 7830,
      amountTendered: 7830,
      changeDue: 0,
    },
    {
      id: 'ord-0998',
      receiptNumber: 'KR-2026-0998',
      createdAt: thisMonthEarlierDay(13),
      customerId: 'cust-3',
      customerName: 'Ayesha Siddiqui',
      paymentMethod: 'easypaisa',
      items: [
        {
          productId: 'prod-almonds',
          sku: 'PAN-302',
          nameEn: 'Roasted Saffron Almonds',
          nameUr: 'زعفرانی بھنے ہوئے بادام',
          category: 'pantry',
          unitPrice: 1650,
          unitCost: 920,
          taxRate: 0,
          quantity: 2,
          lineTotal: 3300,
        },
        {
          productId: 'prod-latte',
          sku: 'BEV-101',
          nameEn: 'Iced Spanish Latte',
          nameUr: 'آئسڈ اسپینش لاٹے',
          category: 'beverages',
          unitPrice: 680,
          unitCost: 290,
          taxRate: 0,
          quantity: 2,
          lineTotal: 1360,
        },
      ],
      subtotal: 4660,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 0,
      taxAmount: 0,
      total: 4660,
      amountTendered: 4660,
      changeDue: 0,
    },
    {
      id: 'ord-1001',
      receiptNumber: 'KR-2026-1001',
      createdAt: todayAtHour(9, 15),
      customerId: 'cust-1',
      customerName: 'Zainab Tariq',
      paymentMethod: 'card',
      items: [
        {
          productId: 'prod-latte',
          sku: 'BEV-101',
          nameEn: 'Iced Spanish Latte',
          nameUr: 'آئسڈ اسپینش لاٹے',
          category: 'beverages',
          unitPrice: 680,
          unitCost: 290,
          taxRate: 5,
          quantity: 2,
          lineTotal: 1360,
        },
        {
          productId: 'prod-croissant',
          sku: 'BAK-201',
          nameEn: 'French Butter Croissant',
          nameUr: 'فرینچ بٹر کروسینٹ',
          category: 'bakery',
          unitPrice: 540,
          unitCost: 220,
          taxRate: 5,
          quantity: 2,
          lineTotal: 1080,
        },
      ],
      subtotal: 2440,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 0.05,
      taxAmount: 122,
      total: 2562,
      amountTendered: 2562,
      changeDue: 0,
    },
    {
      id: 'ord-1002',
      receiptNumber: 'KR-2026-1002',
      createdAt: todayAtHour(10, 42),
      customerName: '',
      paymentMethod: 'cash',
      items: [
        {
          productId: 'prod-chai',
          sku: 'BEV-102',
          nameEn: 'Spiced Cardamom Chai',
          nameUr: 'الائچی مصالحہ چائے',
          category: 'beverages',
          unitPrice: 420,
          unitCost: 150,
          taxRate: 5,
          quantity: 3,
          lineTotal: 1260,
        },
        {
          productId: 'prod-baklava',
          sku: 'BAK-202',
          nameEn: 'Pistachio Baklava Box',
          nameUr: 'پستہ بقلاوہ باکس',
          category: 'bakery',
          unitPrice: 1450,
          unitCost: 680,
          taxRate: 5,
          quantity: 1,
          lineTotal: 1450,
        },
      ],
      subtotal: 2710,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 0.05,
      taxAmount: 136,
      total: 2846,
      amountTendered: 3000,
      changeDue: 154,
    },
    {
      id: 'ord-1003',
      receiptNumber: 'KR-2026-1003',
      createdAt: todayAtHour(11, 20),
      customerName: 'Hamza Mahmood',
      paymentMethod: 'jazzcash',
      items: [
        {
          productId: 'prod-honey',
          sku: 'PAN-301',
          nameEn: 'Raw Yemeni Sidr Honey',
          nameUr: 'خالص سدر شہد (340 گرام)',
          category: 'pantry',
          unitPrice: 3200,
          unitCost: 1950,
          taxRate: 5,
          quantity: 1,
          lineTotal: 3200,
        },
        {
          productId: 'prod-almonds',
          sku: 'PAN-302',
          nameEn: 'Roasted Saffron Almonds',
          nameUr: 'زعفرانی بھنے ہوئے بادام',
          category: 'pantry',
          unitPrice: 1650,
          unitCost: 920,
          taxRate: 5,
          quantity: 1,
          lineTotal: 1650,
        },
      ],
      subtotal: 4850,
      discountPercent: 5,
      discountAmount: 243,
      taxRate: 0.05,
      taxAmount: 230,
      total: 4837,
      amountTendered: 4837,
      changeDue: 0,
    },
    {
      id: 'ord-1004',
      receiptNumber: 'KR-2026-1004',
      createdAt: todayAtHour(13, 5),
      customerName: 'Sana Farooq',
      paymentMethod: 'card',
      items: [
        {
          productId: 'prod-latte',
          sku: 'BEV-101',
          nameEn: 'Iced Spanish Latte',
          nameUr: 'آئسڈ اسپینش لاٹے',
          category: 'beverages',
          unitPrice: 680,
          unitCost: 290,
          taxRate: 5,
          quantity: 2,
          lineTotal: 1360,
        },
        {
          productId: 'prod-almonds',
          sku: 'PAN-302',
          nameEn: 'Roasted Saffron Almonds',
          nameUr: 'زعفرانی بھنے ہوئے بادام',
          category: 'pantry',
          unitPrice: 1650,
          unitCost: 920,
          taxRate: 5,
          quantity: 2,
          lineTotal: 3300,
        },
      ],
      subtotal: 4660,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 0.05,
      taxAmount: 233,
      total: 4893,
      amountTendered: 4893,
      changeDue: 0,
    },
    {
      id: 'ord-1005',
      receiptNumber: 'KR-2026-1005',
      createdAt: todayAtHour(14, 30),
      customerId: 'cust-2',
      customerName: 'Bilal Qureshi',
      udhaarCustomerId: 'khata-1',
      paymentMethod: 'udhaar',
      items: [
        {
          productId: 'prod-croissant',
          sku: 'BAK-201',
          nameEn: 'French Butter Croissant',
          nameUr: 'فرینچ بٹر کروسینٹ',
          category: 'bakery',
          unitPrice: 540,
          unitCost: 220,
          taxRate: 5,
          quantity: 4,
          lineTotal: 2160,
        },
        {
          productId: 'prod-chai',
          sku: 'BEV-102',
          nameEn: 'Spiced Cardamom Chai',
          nameUr: 'الائچی مصالحہ چائے',
          category: 'beverages',
          unitPrice: 420,
          unitCost: 150,
          taxRate: 5,
          quantity: 2,
          lineTotal: 840,
        },
      ],
      subtotal: 3000,
      discountPercent: 0,
      discountAmount: 0,
      taxRate: 0.05,
      taxAmount: 150,
      total: 3150,
      amountTendered: 0,
      changeDue: 0,
    },
  ];
}

function dateInputOffset(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function createInitialUdhaarCustomers(): UdhaarCustomer[] {
  return [
    {
      id: 'khata-1',
      name: 'Bilal Qureshi',
      phone: '0300-4128890',
      notes: 'Regular office account — Gulberg Block B',
      reminderSchedule: '1_week',
      dueDate: dateInputOffset(-1), // Overdue yesterday
      createdAt: daysAgo(12, 10),
    },
    {
      id: 'khata-2',
      name: 'Ayesha Siddiqui',
      phone: '0321-8451902',
      notes: 'Monthly household pantry account',
      reminderSchedule: '3_days',
      dueDate: dateInputOffset(0), // Due today
      createdAt: daysAgo(9, 12),
    },
    {
      id: 'khata-3',
      name: 'Tariq Mehmood',
      phone: '0333-4902211',
      notes: 'Bakery & tea orders',
      reminderSchedule: 'none',
      createdAt: daysAgo(5, 16),
    },
  ];
}

export function createInitialUdhaarEntries(): UdhaarEntry[] {
  return [
    {
      id: 'ue-1',
      customerId: 'khata-1',
      type: 'credit',
      amount: 4850,
      note: 'Sidr Honey & Almonds on credit',
      receiptNumber: 'KR-2026-0984',
      createdAt: daysAgo(4, 11),
    },
    {
      id: 'ue-2',
      customerId: 'khata-1',
      type: 'payment',
      amount: 3000,
      note: 'Partial cash payment received',
      createdAt: daysAgo(2, 17),
    },
    {
      id: 'ue-3',
      customerId: 'khata-1',
      type: 'credit',
      amount: 3150,
      note: 'POS Bill KR-2026-1005 (Croissants & Chai)',
      receiptNumber: 'KR-2026-1005',
      createdAt: todayAtHour(14, 30),
    },
    {
      id: 'ue-4',
      customerId: 'khata-2',
      type: 'credit',
      amount: 6400,
      note: '2x Raw Sidr Honey jars',
      receiptNumber: 'KR-2026-0971',
      createdAt: daysAgo(6, 13),
    },
    {
      id: 'ue-5',
      customerId: 'khata-2',
      type: 'payment',
      amount: 4000,
      note: 'Cash received at counter',
      createdAt: daysAgo(1, 15),
    },
    {
      id: 'ue-6',
      customerId: 'khata-3',
      type: 'credit',
      amount: 2900,
      note: '2x Pistachio Baklava Box',
      receiptNumber: 'KR-2026-0992',
      createdAt: daysAgo(3, 18),
    },
    {
      id: 'ue-7',
      customerId: 'khata-3',
      type: 'payment',
      amount: 2900,
      note: 'Full settlement paid in cash',
      createdAt: daysAgo(1, 11),
    },
  ];
}

export function createInitialVendors(): Vendor[] {
  return [
    {
      id: 'vend-1',
      name: 'Haji Abdul Rashid',
      company: 'Al-Noor Dairy & Beverages Traders',
      phone: '0300-8441290',
      address: 'Hall Road Wholesale Market, Lahore',
      balance: 14500,
      createdAt: daysAgo(20, 10),
    },
    {
      id: 'vend-2',
      name: 'Kamran Sheikh',
      company: 'Gulberg Artisanal Bakery Supply',
      phone: '0321-4119082',
      address: 'Main Boulevard, Gulberg II, Lahore',
      balance: 6800,
      createdAt: daysAgo(14, 12),
    },
    {
      id: 'vend-3',
      name: 'Faisal Mehmood',
      company: 'Karakoram Dry Fruits & Honey Co.',
      phone: '0333-5520194',
      address: 'Akbari Mandi, Lahore',
      balance: 0,
      createdAt: daysAgo(10, 15),
    },
  ];
}

export function createInitialPurchases(): PurchaseRecord[] {
  return [
    {
      id: 'pur-1',
      vendorId: 'vend-1',
      vendorName: 'Haji Abdul Rashid (Al-Noor Dairy & Beverages Traders)',
      invoiceNumber: 'PO-2026-401',
      totalAmount: 24500,
      paidAmount: 10000,
      balanceDue: 14500,
      note: 'Weekly espresso beans, milk & chai spice restock',
      items: [
        {
          id: 'pi-1',
          purchaseId: 'pur-1',
          productId: 'prod-latte',
          productName: 'Iced Spanish Latte',
          sku: 'BEV-101',
          quantity: 50,
          unitCost: 290,
          lineTotal: 14500,
        },
        {
          id: 'pi-2',
          purchaseId: 'pur-1',
          productId: 'prod-chai',
          productName: 'Spiced Cardamom Chai',
          sku: 'BEV-102',
          quantity: 66,
          unitCost: 150,
          lineTotal: 9900,
        },
      ],
      createdAt: daysAgo(4, 10),
    },
    {
      id: 'pur-2',
      vendorId: 'vend-2',
      vendorName: 'Kamran Sheikh (Gulberg Artisanal Bakery Supply)',
      invoiceNumber: 'PO-2026-402',
      totalAmount: 16800,
      paidAmount: 10000,
      balanceDue: 6800,
      note: 'Morning croissant & pistachio baklava tray delivery',
      items: [
        {
          id: 'pi-3',
          purchaseId: 'pur-2',
          productId: 'prod-croissant',
          productName: 'French Butter Croissant',
          sku: 'BAK-201',
          quantity: 30,
          unitCost: 220,
          lineTotal: 6600,
        },
        {
          id: 'pi-4',
          purchaseId: 'pur-2',
          productId: 'prod-baklava',
          productName: 'Pistachio Baklava Box',
          sku: 'BAK-202',
          quantity: 15,
          unitCost: 680,
          lineTotal: 10200,
        },
      ],
      createdAt: daysAgo(2, 9),
    },
  ];
}

export function createInitialInventoryAdjustments(): InventoryAdjustment[] {
  return [
    {
      id: 'adj-1',
      productId: 'prod-croissant',
      productName: 'French Butter Croissant',
      sku: 'BAK-201',
      adjustmentType: 'Expired',
      quantityChange: -2,
      previousStock: 26,
      newStock: 24,
      reason: 'End-of-day unsold bakery tray write-off',
      createdAt: daysAgo(1, 20),
    },
    {
      id: 'adj-2',
      productId: 'prod-almonds',
      productName: 'Roasted Saffron Almonds',
      sku: 'PAN-302',
      adjustmentType: 'Stock Count Correction',
      quantityChange: 3,
      previousStock: 16,
      newStock: 19,
      reason: 'Found 3 sealed pouches during shelf audit',
      createdAt: daysAgo(1, 14),
    },
  ];
}

export function createInitialCustomers(): Customer[] {
  return [
    {
      id: 'cust-1',
      name: 'Zainab Tariq',
      phone: '0301-7782341',
      address: 'House 22, Street 4, Cavalry Ground, Lahore',
      balance: 0,
      createdAt: daysAgo(18, 11),
    },
    {
      id: 'cust-2',
      name: 'Bilal Qureshi',
      phone: '0300-4128890',
      address: 'Office 14, Gulberg Block B, Lahore',
      balance: 5000,
      createdAt: daysAgo(12, 10),
    },
    {
      id: 'cust-3',
      name: 'Ayesha Siddiqui',
      phone: '0321-8451902',
      address: 'Model Town Link Road, Lahore',
      balance: 2400,
      createdAt: daysAgo(9, 12),
    },
  ];
}

export function createInitialEmployees(): Employee[] {
  return [
    {
      id: 'emp-admin',
      name: 'Muhammad Hamza (Owner)',
      phone: '0300-0001234',
      role: 'admin',
      pinCode: '1234',
      isActive: true,
      createdAt: daysAgo(30, 9),
    },
    {
      id: 'emp-manager',
      name: 'Usman Tariq',
      phone: '0322-4451900',
      role: 'manager',
      pinCode: '2222',
      isActive: true,
      createdAt: daysAgo(15, 10),
    },
    {
      id: 'emp-cashier',
      name: 'Ali Raza',
      phone: '0311-9083321',
      role: 'cashier',
      pinCode: '1111',
      isActive: true,
      createdAt: daysAgo(10, 11),
    },
  ];
}

export function createDefaultStoreSettings(shopName = 'Khaas Retail'): StoreSettings {
  return {
    storeName: shopName || 'Khaas Retail',
    phone: '+92 42 3578 9021',
    address: 'Plot 14-B, Gulberg III, Lahore',
    taxNumber: 'STRN: 32-08-9410-221-4',
    receiptFooter: 'Thank you for shopping at Khaas Retail!',
    jazzcashAccountTitle: '',
    jazzcashAccountNumber: '',
    easypaisaAccountTitle: '',
    easypaisaAccountNumber: '',
  };
}

export function createInitialExpenses(): ExpenseRecord[] {
  return [
    {
      id: 'exp-1',
      title: 'Shop Counter Tea & Packaging Bags',
      category: 'Supplies',
      amount: 650,
      notes: 'Daily carry bags and counter hospitality',
      expenseDate: dateInputOffset(0),
      createdAt: todayAtHour(11, 15),
    },
    {
      id: 'exp-2',
      title: 'Electricity & Backup Generator Fuel',
      category: 'Electricity',
      amount: 1450,
      notes: 'UPS & generator fuel refill',
      expenseDate: dateInputOffset(0),
      createdAt: todayAtHour(13, 40),
    },
    {
      id: 'exp-3',
      title: 'Monthly Shop Maintenance & Cleaning',
      category: 'Maintenance',
      amount: 3200,
      notes: 'AC servicing & floor sanitation',
      expenseDate: dateInputOffset(-3),
      createdAt: daysAgo(3, 15),
    },
  ];
}

