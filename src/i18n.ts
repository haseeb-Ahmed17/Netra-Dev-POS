import type { CategoryId, Language, PaymentMethod } from './types';

export interface TranslationStrings {
  brandName: string;
  navPos: string;
  navDashboard: string;
  navTransactions: string;
  navInventory: string;
  navUdhaar: string;
  langToggleLabel: string;

  // POS Billing
  posTitle: string;
  posSubtitle: string;
  searchProductsPlaceholder: string;
  categoryAll: string;
  categoryBeverages: string;
  categoryBakery: string;
  categoryPantry: string;
  skuLabel: string;
  barcodeLabel: string;
  inStockLabel: string;
  outOfStockLabel: string;
  addToCart: string;
  addedMore: string;
  noProductsMatch: string;
  resetFilters: string;

  // Cart & Checkout
  currentBill: string;
  itemsCount: string;
  clearCart: string;
  emptyCartTitle: string;
  emptyCartDesc: string;
  customerOptionalPlaceholder: string;
  discountLabel: string;
  subtotalLabel: string;
  taxLabel: string;
  grandTotalLabel: string;
  paymentMethodLabel: string;
  paymentCash: string;
  paymentCard: string;
  paymentMobile: string;
  paymentUdhaar: string;
  selectUdhaarCustomerLabel: string;
  chooseCustomerOption: string;
  udhaarCustomerRequired: string;
  udhaarBalanceNotice: string;
  amountTenderedLabel: string;
  exactAmount: string;
  changeDueLabel: string;
  insufficientCash: string;
  completeSalePrint: string;
  lastSaleSuccess: string;
  viewDashboardLink: string;

  // Executive Dashboard
  dashboardTitle: string;
  dashboardSubtitle: string;
  goToPos: string;
  resetDemoData: string;
  totalRevenue: string;
  ordersCompleted: string;
  avgOrderValue: string;
  grossProfit: string;
  itemsSoldUnit: string;
  marginLabel: string;
  latestOrderDelta: string;
  hourlyRevenueTitle: string;
  hourlyRevenueSubtitle: string;
  categoryPerformanceTitle: string;
  categoryPerformanceSubtitle: string;
  topProductsTitle: string;
  recentReceiptsTitle: string;
  productCol: string;
  unitsCol: string;
  revenueCol: string;
  profitCol: string;
  receiptCol: string;
  timeCol: string;
  methodCol: string;
  amountCol: string;
  actionCol: string;
  printBtn: string;

  // Transactions Ledger
  transactionsTitle: string;
  transactionsSubtitle: string;
  searchReceiptsPlaceholder: string;
  filterAllPayments: string;
  customerCol: string;
  itemsCol: string;
  subtotalCol: string;
  taxCol: string;
  totalCol: string;
  walkInCustomer: string;
  noTransactionsMatch: string;

  // Inventory & Stock Management
  inventoryTitle: string;
  inventorySubtitle: string;
  addProductBtn: string;
  editProductTitle: string;
  addProductTitle: string;
  productNameEnLabel: string;
  productNameUrLabel: string;
  categoryLabel: string;
  retailPriceLabel: string;
  costPriceLabel: string;
  stockQtyLabel: string;
  barcodeInputLabel: string;
  saveProductBtn: string;
  cancelBtn: string;
  editBtn: string;
  deleteBtn: string;
  confirmDeleteBtn: string;
  filterAllStock: string;
  filterInStock: string;
  filterLowStock: string;
  costCol: string;
  priceCol: string;
  stockCol: string;
  statusCol: string;
  statusHealthy: string;
  statusLow: string;
  statusOut: string;
  restockBtn: string;
  reduceBtn: string;

  // Udhaar / Khata Register
  udhaarTitle: string;
  udhaarSubtitle: string;
  addCustomerBtn: string;
  totalReceivableLabel: string;
  totalCreditGivenLabel: string;
  totalPaymentsReceivedLabel: string;
  activeCustomersLabel: string;
  searchCustomersPlaceholder: string;
  noCustomersFound: string;
  selectCustomerPrompt: string;
  customerNameLabel: string;
  phoneNumberLabel: string;
  customerNotesLabel: string;
  openingBalanceLabel: string;
  saveCustomerBtn: string;
  remainingBalanceLabel: string;
  recordCreditBtn: string;
  receivePaymentBtn: string;
  entryAmountLabel: string;
  entryNoteLabel: string;
  creditNotePlaceholder: string;
  paymentNotePlaceholder: string;
  submitCreditBtn: string;
  submitPaymentBtn: string;
  ledgerHistoryTitle: string;
  entryDateCol: string;
  entryTypeCol: string;
  entryNoteCol: string;
  creditCol: string;
  paymentCol: string;
  balanceCol: string;
  typeCredit: string;
  typePayment: string;
  noLedgerEntries: string;
  settledStatus: string;

  // Receipt Modal
  receiptModalTitle: string;
  storeAddress: string;
  storePhone: string;
  taxRegNumber: string;
  receiptNoLabel: string;
  dateLabel: string;
  cashierLabel: string;
  cashierDefault: string;
  customerLabel: string;
  itemCol: string;
  qtyCol: string;
  rateCol: string;
  paidViaLabel: string;
  tenderedLabel: string;
  changeLabel: string;
  udhaarAddedLabel: string;
  thankYouMsg: string;
  printReceiptBtn: string;
  downloadTxtBtn: string;
  newOrderBtn: string;
  closeBtn: string;
}

export const TRANSLATIONS: Record<Language, TranslationStrings> = {
  en: {
    brandName: 'Khaas Retail',
    navPos: 'POS Billing',
    navDashboard: 'Dashboard',
    navTransactions: 'Transactions',
    navInventory: 'Stock',
    navUdhaar: 'Udhaar / Khata',
    langToggleLabel: 'اردو',

    posTitle: 'Point of Sale Register',
    posSubtitle: 'Select or scan items to build a bill, print thermal receipts, and update live analytics',
    searchProductsPlaceholder: 'Search by item name, SKU, or barcode...',
    categoryAll: 'All Items',
    categoryBeverages: 'Beverages',
    categoryBakery: 'Bakery',
    categoryPantry: 'Pantry',
    skuLabel: 'SKU',
    barcodeLabel: 'Barcode',
    inStockLabel: 'Stock',
    outOfStockLabel: 'Out of stock',
    addToCart: 'Add to Cart',
    addedMore: 'Add Another',
    noProductsMatch: 'No products match your search or category filter.',
    resetFilters: 'Reset Filters',

    currentBill: 'Active Order Bill',
    itemsCount: 'items',
    clearCart: 'Clear',
    emptyCartTitle: 'Cart is empty',
    emptyCartDesc: 'Click "Add to Cart" on any product to calculate totals and generate a receipt.',
    customerOptionalPlaceholder: 'Customer name or phone (optional)',
    discountLabel: 'Discount',
    subtotalLabel: 'Subtotal',
    taxLabel: 'GST (5%)',
    grandTotalLabel: 'Grand Total',
    paymentMethodLabel: 'Payment Method',
    paymentCash: 'Cash',
    paymentCard: 'Card',
    paymentMobile: 'Mobile Pay',
    paymentUdhaar: 'Udhaar',
    selectUdhaarCustomerLabel: 'Khata Customer',
    chooseCustomerOption: 'Select a customer...',
    udhaarCustomerRequired: 'Please select a customer for Udhaar (Credit) sale.',
    udhaarBalanceNotice: 'Full bill amount will be added to customer Udhaar balance.',
    amountTenderedLabel: 'Cash Tendered',
    exactAmount: 'Exact',
    changeDueLabel: 'Change Due',
    insufficientCash: 'Cash tendered is less than the grand total.',
    completeSalePrint: 'Complete Sale & Print Receipt',
    lastSaleSuccess: 'Sale recorded and Executive Dashboard updated.',
    viewDashboardLink: 'View Dashboard',

    dashboardTitle: 'Executive Sales Dashboard',
    dashboardSubtitle: 'Live store revenue, margin performance, and itemized analytics',
    goToPos: 'Open POS Billing',
    resetDemoData: 'Reset Demo Data',
    totalRevenue: 'Total Revenue',
    ordersCompleted: 'Orders Completed',
    avgOrderValue: 'Average Order Value',
    grossProfit: 'Gross Profit',
    itemsSoldUnit: 'units sold',
    marginLabel: 'margin',
    latestOrderDelta: 'Last sale:',
    hourlyRevenueTitle: 'Hourly Sales Volume',
    hourlyRevenueSubtitle: 'Automatically updates as POS receipts are completed',
    categoryPerformanceTitle: 'Sales by Category',
    categoryPerformanceSubtitle: 'Revenue distribution across store departments',
    topProductsTitle: 'Top Selling Products',
    recentReceiptsTitle: 'Recent Completed Receipts',
    productCol: 'Product',
    unitsCol: 'Units',
    revenueCol: 'Revenue',
    profitCol: 'Profit',
    receiptCol: 'Receipt',
    timeCol: 'Time',
    methodCol: 'Method',
    amountCol: 'Amount',
    actionCol: 'Action',
    printBtn: 'Receipt',

    transactionsTitle: 'Transaction Ledger',
    transactionsSubtitle: 'Complete record of completed bills and printable receipts',
    searchReceiptsPlaceholder: 'Search receipt # or customer...',
    filterAllPayments: 'All Methods',
    customerCol: 'Customer',
    itemsCol: 'Items',
    subtotalCol: 'Subtotal',
    taxCol: 'Tax',
    totalCol: 'Total',
    walkInCustomer: 'Walk-in Customer',
    noTransactionsMatch: 'No transactions match your current filters.',

    inventoryTitle: 'Stock Management',
    inventorySubtitle: 'Add new products, edit prices or barcodes, and monitor live POS stock',
    addProductBtn: 'Add New Product',
    editProductTitle: 'Edit Product',
    addProductTitle: 'Add New Product',
    productNameEnLabel: 'Product Name (English)',
    productNameUrLabel: 'Product Name (Urdu)',
    categoryLabel: 'Category',
    retailPriceLabel: 'Selling Price (Rs.)',
    costPriceLabel: 'Cost Price (Rs.)',
    stockQtyLabel: 'Stock Quantity',
    barcodeInputLabel: 'Barcode',
    saveProductBtn: 'Save Product',
    cancelBtn: 'Cancel',
    editBtn: 'Edit',
    deleteBtn: 'Delete',
    confirmDeleteBtn: 'Confirm',
    filterAllStock: 'All Stock',
    filterInStock: 'Healthy',
    filterLowStock: 'Low / Out',
    costCol: 'Unit Cost',
    priceCol: 'Retail Price',
    stockCol: 'Available',
    statusCol: 'Status',
    statusHealthy: 'In Stock',
    statusLow: 'Low Stock',
    statusOut: 'Out of Stock',
    restockBtn: '+10',
    reduceBtn: '-1',

    udhaarTitle: 'Customer Udhaar / Khata Register',
    udhaarSubtitle: 'Manage credit sales, record cash payments received, and track balances',
    addCustomerBtn: 'Add Customer',
    totalReceivableLabel: 'Total Receivable Balance',
    totalCreditGivenLabel: 'Total Udhaar Given',
    totalPaymentsReceivedLabel: 'Cash Payments Received',
    activeCustomersLabel: 'Khata Customers',
    searchCustomersPlaceholder: 'Search customer name or phone...',
    noCustomersFound: 'No customers match your search.',
    selectCustomerPrompt: 'Select a customer from the left to view their Khata ledger.',
    customerNameLabel: 'Customer Full Name',
    phoneNumberLabel: 'Phone Number',
    customerNotesLabel: 'Address / Note (optional)',
    openingBalanceLabel: 'Opening Udhaar (Rs., optional)',
    saveCustomerBtn: 'Save Customer',
    remainingBalanceLabel: 'Remaining Balance',
    recordCreditBtn: 'Record Udhaar (Credit)',
    receivePaymentBtn: 'Receive Cash Payment',
    entryAmountLabel: 'Amount (Rs.)',
    entryNoteLabel: 'Description / Note',
    creditNotePlaceholder: 'e.g., Grocery & pantry items on credit',
    paymentNotePlaceholder: 'e.g., Cash received at counter',
    submitCreditBtn: 'Add Credit Entry',
    submitPaymentBtn: 'Record Payment',
    ledgerHistoryTitle: 'Khata Ledger History',
    entryDateCol: 'Date & Time',
    entryTypeCol: 'Type',
    entryNoteCol: 'Details',
    creditCol: 'Udhaar (+)',
    paymentCol: 'Received (-)',
    balanceCol: 'Balance',
    typeCredit: 'Credit Sale',
    typePayment: 'Payment Received',
    noLedgerEntries: 'No ledger transactions recorded yet.',
    settledStatus: 'Settled',

    receiptModalTitle: '80mm Thermal Receipt',
    storeAddress: 'Plot 14-B, Gulberg III, Lahore',
    storePhone: 'Tel: +92 42 3578 9021',
    taxRegNumber: 'STRN: 32-08-9410-221-4',
    receiptNoLabel: 'Receipt #',
    dateLabel: 'Date & Time',
    cashierLabel: 'Cashier',
    cashierDefault: 'Counter 01 (A. Raza)',
    customerLabel: 'Customer',
    itemCol: 'Item',
    qtyCol: 'Qty',
    rateCol: 'Rate',
    paidViaLabel: 'Paid Via',
    tenderedLabel: 'Tendered',
    changeLabel: 'Change',
    udhaarAddedLabel: 'Posted to Udhaar Khata',
    thankYouMsg: 'Thank you for shopping at Khaas Retail!',
    printReceiptBtn: 'Print Receipt',
    downloadTxtBtn: 'Save TXT',
    newOrderBtn: 'New Order',
    closeBtn: 'Close',
  },
  ur: {
    brandName: 'خاص ریٹیل',
    navPos: 'بلنگ کاؤنٹر',
    navDashboard: 'ڈیش بورڈ',
    navTransactions: 'لین دین',
    navInventory: 'اسٹاک',
    navUdhaar: 'ادھار / کھاتہ',
    langToggleLabel: 'English',

    posTitle: 'پوائنٹ آف سیل رجسٹر',
    posSubtitle: 'بل بنانے کے لیے اشیاء منتخب کریں، تھرمل رسید پرنٹ کریں اور سیلز خودکار اپڈیٹ کریں',
    searchProductsPlaceholder: 'نام، ایس کے یو یا بارکوڈ سے تلاش کریں...',
    categoryAll: 'تمام اشیاء',
    categoryBeverages: 'مشروبات',
    categoryBakery: 'بیکری',
    categoryPantry: 'گروسری',
    skuLabel: 'کوڈ',
    barcodeLabel: 'بارکوڈ',
    inStockLabel: 'اسٹاک',
    outOfStockLabel: 'اسٹاک ختم',
    addToCart: 'کارٹ میں شامل کریں',
    addedMore: 'مزید شامل کریں',
    noProductsMatch: 'آپ کی تلاش کے مطابق کوئی چیز نہیں ملی۔',
    resetFilters: 'فلٹر صاف کریں',

    currentBill: 'موجودہ بل',
    itemsCount: 'اشیاء',
    clearCart: 'صاف کریں',
    emptyCartTitle: 'کارٹ خالی ہے',
    emptyCartDesc: 'رقم کا حساب لگانے اور رسید بنانے کے لیے کسی بھی آئٹم پر "کارٹ میں شامل کریں" دبائیں۔',
    customerOptionalPlaceholder: 'گاہک کا نام یا فون نمبر (اختیاری)',
    discountLabel: 'رعایت',
    subtotalLabel: 'ذیلی کل',
    taxLabel: 'جی ایس ٹی (5%)',
    grandTotalLabel: 'کل رقم',
    paymentMethodLabel: 'ادائیگی کا طریقہ',
    paymentCash: 'نقد',
    paymentCard: 'کارڈ',
    paymentMobile: 'موبائل پے',
    paymentUdhaar: 'ادھار',
    selectUdhaarCustomerLabel: 'کھاتہ گاہک',
    chooseCustomerOption: 'گاہک منتخب کریں...',
    udhaarCustomerRequired: 'ادھار سیل کے لیے براہ کرم گاہک منتخب کریں۔',
    udhaarBalanceNotice: 'مکمل بل کی رقم گاہک کے ادھار کھاتے میں شامل ہو جائے گی۔',
    amountTenderedLabel: 'وصول شدہ نقد رقم',
    exactAmount: 'پوری رقم',
    changeDueLabel: 'واپسی رقم',
    insufficientCash: 'وصول شدہ نقد رقم کل بل سے کم ہے۔',
    completeSalePrint: 'سیل مکمل کریں اور رسید پرنٹ کریں',
    lastSaleSuccess: 'سیل ریکارڈ ہو گئی اور ایگزیکٹو ڈیش بورڈ اپڈیٹ ہو گیا۔',
    viewDashboardLink: 'ڈیش بورڈ دیکھیں',

    dashboardTitle: 'ایگزیکٹو سیلز ڈیش بورڈ',
    dashboardSubtitle: 'اسٹور کی براہِ راست آمدنی، منافع اور فروخت کی تفصیلات',
    goToPos: 'بلنگ کاؤنٹر کھولیں',
    resetDemoData: 'ڈیمو ڈیٹا بحال کریں',
    totalRevenue: 'کل آمدنی',
    ordersCompleted: 'مکمل آرڈرز',
    avgOrderValue: 'اوسط آرڈر مالیت',
    grossProfit: 'مجموعی منافع',
    itemsSoldUnit: 'فروخت شدہ یونٹس',
    marginLabel: 'منافع شرح',
    latestOrderDelta: 'تازہ سیل:',
    hourlyRevenueTitle: 'فی گھنٹہ فروخت',
    hourlyRevenueSubtitle: 'ہر نئی رسید کے ساتھ خودکار اپڈیٹ',
    categoryPerformanceTitle: 'زمرہ جات کے لحاظ سے فروخت',
    categoryPerformanceSubtitle: 'مختلف شعبوں میں آمدنی کی تقسیم',
    topProductsTitle: 'سب سے زیادہ فروخت ہونے والی اشیاء',
    recentReceiptsTitle: 'حالیہ مکمل رسیدیں',
    productCol: 'آئٹم',
    unitsCol: 'تعداد',
    revenueCol: 'آمدنی',
    profitCol: 'منافع',
    receiptCol: 'رسید نمبر',
    timeCol: 'وقت',
    methodCol: 'طریقہ',
    amountCol: 'رقم',
    actionCol: 'عمل',
    printBtn: 'رسید',

    transactionsTitle: 'لین دین کا ریکارڈ',
    transactionsSubtitle: 'مکمل بلز اور پرنٹ ایبل رسیدوں کی مکمل فہرست',
    searchReceiptsPlaceholder: 'رسید نمبر یا گاہک تلاش کریں...',
    filterAllPayments: 'تمام طریقے',
    customerCol: 'گاہک',
    itemsCol: 'اشیاء',
    subtotalCol: 'ذیلی کل',
    taxCol: 'ٹیکس',
    totalCol: 'کل رقم',
    walkInCustomer: 'عام گاہک',
    noTransactionsMatch: 'موجودہ فلٹرز کے مطابق کوئی لین دین نہیں ملا۔',

    inventoryTitle: 'اسٹاک مینجمنٹ',
    inventorySubtitle: 'نئی اشیاء شامل کریں، قیمت یا بارکوڈ تبدیل کریں اور اسٹاک مانیٹر کریں',
    addProductBtn: 'نیا پروڈکٹ شامل کریں',
    editProductTitle: 'پروڈکٹ میں ترمیم کریں',
    addProductTitle: 'نیا پروڈکٹ شامل کریں',
    productNameEnLabel: 'پروڈکٹ کا نام (انگریزی)',
    productNameUrLabel: 'پروڈکٹ کا نام (اردو)',
    categoryLabel: 'زمرہ',
    retailPriceLabel: 'فروخت قیمت (روپے)',
    costPriceLabel: 'لاگت قیمت (روپے)',
    stockQtyLabel: 'اسٹاک کی تعداد',
    barcodeInputLabel: 'بارکوڈ',
    saveProductBtn: 'محفوظ کریں',
    cancelBtn: 'منسوخ',
    editBtn: 'ترمیم',
    deleteBtn: 'حذف',
    confirmDeleteBtn: 'تصدیق',
    filterAllStock: 'تمام اسٹاک',
    filterInStock: 'دستیاب',
    filterLowStock: 'کم / ختم',
    costCol: 'لاگت قیمت',
    priceCol: 'فروخت قیمت',
    stockCol: 'موجودہ اسٹاک',
    statusCol: 'حالت',
    statusHealthy: 'دستیاب',
    statusLow: 'کم اسٹاک',
    statusOut: 'اسٹاک ختم',
    restockBtn: '+10',
    reduceBtn: '-1',

    udhaarTitle: 'گاہک ادھار / کھاتہ رجسٹر',
    udhaarSubtitle: 'ادھار فروخت درج کریں، وصول شدہ نقد رقم ریکارڈ کریں اور بقایا دیکھیں',
    addCustomerBtn: 'نیا گاہک شامل کریں',
    totalReceivableLabel: 'کل واجب الادا رقم',
    totalCreditGivenLabel: 'کل دیا گیا ادھار',
    totalPaymentsReceivedLabel: 'کل وصول شدہ رقم',
    activeCustomersLabel: 'کھاتہ گاہک',
    searchCustomersPlaceholder: 'گاہک کا نام یا فون نمبر تلاش کریں...',
    noCustomersFound: 'تلاش کے مطابق کوئی گاہک نہیں ملا۔',
    selectCustomerPrompt: 'کھاتہ دیکھنے کے لیے بائیں جانب سے کسی گاہک کو منتخب کریں۔',
    customerNameLabel: 'گاہک کا پورا نام',
    phoneNumberLabel: 'فون نمبر',
    customerNotesLabel: 'پتہ یا نوٹ (اختیاری)',
    openingBalanceLabel: 'ابتدائی ادھار رقم (اختیاری)',
    saveCustomerBtn: 'گاہک محفوظ کریں',
    remainingBalanceLabel: 'بقایا ادھار',
    recordCreditBtn: 'ادھار درج کریں',
    receivePaymentBtn: 'نقد وصولی درج کریں',
    entryAmountLabel: 'رقم (روپے)',
    entryNoteLabel: 'تفصیل / نوٹ',
    creditNotePlaceholder: 'مثلاً گروسری اور بیکری کا سامان ادھار',
    paymentNotePlaceholder: 'مثلاً کاؤنٹر پر نقد رقم وصول ہوئی',
    submitCreditBtn: 'ادھار شامل کریں',
    submitPaymentBtn: 'وصولی محفوظ کریں',
    ledgerHistoryTitle: 'کھاتہ تفصیلات',
    entryDateCol: 'تاریخ و وقت',
    entryTypeCol: 'قسم',
    entryNoteCol: 'تفصیل',
    creditCol: 'ادھار (+)',
    paymentCol: 'وصولی (-)',
    balanceCol: 'بقایا',
    typeCredit: 'ادھار فروخت',
    typePayment: 'رقم وصولی',
    noLedgerEntries: 'ابھی تک اس کھاتے میں کوئی اندراج نہیں ہے۔',
    settledStatus: 'حساب برابر',

    receiptModalTitle: '80mm تھرمل رسید',
    storeAddress: 'پلاٹ 14-بی، گلبرگ 3، لاہور',
    storePhone: 'فون: 9021 3578 42 92+',
    taxRegNumber: 'ٹیکس نمبر: 4-221-9410-08-32',
    receiptNoLabel: 'رسید نمبر',
    dateLabel: 'تاریخ و وقت',
    cashierLabel: 'کیشیئر',
    cashierDefault: 'کاؤنٹر 01 (عمر رضا)',
    customerLabel: 'گاہک',
    itemCol: 'تفصیل',
    qtyCol: 'تعداد',
    rateCol: 'نرخ',
    paidViaLabel: 'ادائیگی',
    tenderedLabel: 'وصول رقم',
    changeLabel: 'بقایا رقم',
    udhaarAddedLabel: 'ادھار کھاتے میں درج',
    thankYouMsg: 'خاص ریٹیل سے خریداری کا شکریہ!',
    printReceiptBtn: 'رسید پرنٹ کریں',
    downloadTxtBtn: 'ٹیکسٹ محفوظ کریں',
    newOrderBtn: 'نیا آرڈر',
    closeBtn: 'بند کریں',
  },
};

export function formatCurrency(amount: number, _lang?: Language): string {
  const rounded = Math.round(amount);
  const formatted = rounded.toLocaleString('en-PK');
  return `Rs. ${formatted}`;
}

export function getCategoryLabel(category: CategoryId, t: TranslationStrings): string {
  switch (category) {
    case 'all':
      return t.categoryAll;
    case 'beverages':
      return t.categoryBeverages;
    case 'bakery':
      return t.categoryBakery;
    case 'pantry':
      return t.categoryPantry;
  }
}

export function getPaymentLabel(method: PaymentMethod, t: TranslationStrings): string {
  switch (method) {
    case 'cash':
      return t.paymentCash;
    case 'card':
      return t.paymentCard;
    case 'mobile':
      return t.paymentMobile;
    case 'udhaar':
      return t.paymentUdhaar;
  }
}

export function formatTimeShort(isoString: string, lang: Language): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString(lang === 'ur' ? 'en-PK' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-PK', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
