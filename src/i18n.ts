import type { CategoryId, Language, PaymentMethod } from './types';

export interface TranslationStrings {
  brandName: string;
  navPos: string;
  navDashboard: string;
  navTransactions: string;
  navInventory: string;
  navInventoryReport: string;
  navPurchases: string;
  navVendors: string;
  navExpenses: string;
  navCustomers: string;
  navUdhaar: string;
  navStaff: string;
  navSettings: string;
  navSaasAdmin: string;
  navGroupOperations: string;
  navGroupInventory: string;
  navGroupFinance: string;
  navGroupAdmin: string;
  openMenuBtn: string;
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
  paymentJazzCash: string;
  paymentEasyPaisa: string;
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
  profitAmountLabel: string;
  profitMarginLabel: string;
  taxRateLabel: string;
  stockQtyLabel: string;
  barcodeInputLabel: string;
  generateBarcodeBtn: string;
  printBarcodeBtn: string;
  productPhotoLabel: string;
  uploadPhotoBtn: string;
  uploadingPhotoLabel: string;
  removePhotoBtn: string;
  photoUploadHint: string;
  barcodeModalTitle: string;
  printStickerBtn: string;
  saveProductBtn: string;
  cancelBtn: string;
  editBtn: string;
  deleteBtn: string;
  confirmDeleteBtn: string;
  deleteProductTitle: string;
  deleteProductConfirmDesc: string;
  deleteForeverBtn: string;
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

  // Auth & Account
  logoutBtn: string;
  authTitle: string;
  authSubtitle: string;
  signInTab: string;
  signUpTab: string;
  shopNameLabel: string;
  emailLabel: string;
  passwordLabel: string;
  signInBtn: string;
  createAccountBtn: string;
  demoSignInBtn: string;
  signingInLabel: string;
  loadingWorkspace: string;
  passwordMinLengthError: string;

  // Cloud Sync Notice & SQL Modal
  cloudSyncBannerTitle: string;
  cloudSyncBannerFallback: string;
  cloudSyncRetryBtn: string;
  cloudSyncSqlBtn: string;
  cloudSyncModalTitle: string;
  cloudSyncModalDesc: string;
  copySqlBtn: string;
  copiedSqlBtn: string;

  // Phase 2: Stock & Adjustments
  adjustStockBtn: string;
  totalStockValueLabel: string;
  totalUnitsInStockLabel: string;
  lowStockCountLabel: string;
  stockValueCol: string;
  adjustModalTitle: string;
  adjustmentTypeLabel: string;
  adjTypeDamaged: string;
  adjTypeExpired: string;
  adjTypeLost: string;
  adjTypeCorrection: string;
  qtyChangeLabel: string;
  qtyDirectionAdd: string;
  qtyDirectionRemove: string;
  currentStockLabel: string;
  newStockPreviewLabel: string;
  adjustmentReasonLabel: string;
  adjustmentReasonPlaceholder: string;
  saveAdjustmentBtn: string;
  adjustmentHistoryTitle: string;
  noAdjustmentsRecorded: string;
  previousNewCol: string;
  reasonCol: string;

  // Phase 2: Vendors / Suppliers
  vendorsTitle: string;
  vendorsSubtitle: string;
  addVendorBtn: string;
  editVendorTitle: string;
  addVendorTitle: string;
  totalVendorsLabel: string;
  totalPayableLabel: string;
  vendorsWithDueLabel: string;
  totalPurchasedLabel: string;
  searchVendorsPlaceholder: string;
  filterAllVendors: string;
  filterPayableVendors: string;
  vendorNameLabel: string;
  vendorCompanyLabel: string;
  vendorPhoneLabel: string;
  vendorAddressLabel: string;
  vendorOpeningBalanceLabel: string;
  saveVendorBtn: string;
  payableBalanceCol: string;
  payVendorBtn: string;
  payVendorModalTitle: string;
  paymentAmountLabel: string;
  confirmPaymentBtn: string;
  noVendorsFound: string;
  vendorPurchasesTitle: string;
  noVendorPurchases: string;

  // Phase 2: Purchases / Stock In
  purchasesTitle: string;
  purchasesSubtitle: string;
  newPurchaseTitle: string;
  selectVendorLabel: string;
  chooseVendorOption: string;
  invoiceNoLabel: string;
  addProductToPurchaseLabel: string;
  chooseProductOption: string;
  addRowBtn: string;
  purchaseCostCol: string;
  lineTotalCol: string;
  purchaseTotalLabel: string;
  paidAmountLabel: string;
  payFullBtn: string;
  remainingPayableLabel: string;
  purchaseNoteLabel: string;
  purchaseNotePlaceholder: string;
  receiveInventoryBtn: string;
  purchaseSuccessMsg: string;
  purchaseHistoryTitle: string;
  noPurchasesYet: string;
  vendorCol: string;
  paidCol: string;
  balanceDueCol: string;
  noVendorsNotice: string;
  goToVendorsBtn: string;

  // Phase 3: Customers & Purchase History
  selectSaleCustomerLabel: string;
  walkInOption: string;
  posCustomerBalanceBadge: string;
  customersTitle: string;
  customersSubtitle: string;
  addCrmCustomerBtn: string;
  editCrmCustomerTitle: string;
  addCrmCustomerTitle: string;
  customerAddressLabel: string;
  customerUdhaarBalanceLabel: string;
  totalCrmCustomersLabel: string;
  customersWithBalanceLabel: string;
  totalCustomerPurchasesLabel: string;
  customerBillsCol: string;
  customerAddressCol: string;
  filterAllCustomers: string;
  filterUdhaarCustomers: string;
  viewProfileHistoryBtn: string;
  customerProfileTitle: string;
  customerHistoryTitle: string;
  customerTotalBillsLabel: string;
  noCustomerBills: string;
  recordCustomerPaymentBtn: string;
  payCustomerModalTitle: string;

  // Phase 3: Staff & Permissions + PIN Switcher
  staffTitle: string;
  staffSubtitle: string;
  addEmployeeBtn: string;
  editEmployeeTitle: string;
  addEmployeeTitle: string;
  employeeNameLabel: string;
  employeePhoneLabel: string;
  employeeRoleLabel: string;
  employeePinLabel: string;
  employeePinHint: string;
  employeePinError: string;
  employeeActiveLabel: string;
  activeStatusLabel: string;
  inactiveStatusLabel: string;
  saveEmployeeBtn: string;
  roleAdmin: string;
  roleManager: string;
  roleCashier: string;
  roleAdminDesc: string;
  roleManagerDesc: string;
  roleCashierDesc: string;
  permissionsGuideTitle: string;
  switchStaffBtn: string;
  lockScreenBtn: string;
  activeStaffLabel: string;
  lockScreenTitle: string;
  lockScreenSubtitle: string;
  enterPinLabel: string;
  unlockRegisterBtn: string;
  invalidPinError: string;
  quickSwitchStaffLabel: string;
  lastAdminNotice: string;
  pinTakenError: string;
  firstAdminSetupBadge: string;
  firstAdminSetupTitle: string;
  firstAdminSetupSubtitle: string;
  adminFullNameLabel: string;
  adminPhoneOptionalLabel: string;
  newPinLabel: string;
  confirmPinLabel: string;
  pinMismatchError: string;
  adminNameRequiredError: string;
  createAdminSaveBtn: string;
  firstAdminSecurityNote: string;

  // Phase 3: Store Settings & Thermal Receipt Width
  storeSettingsTitle: string;
  storeSettingsSubtitle: string;
  storeNameInputLabel: string;
  storePhoneInputLabel: string;
  storeAddressInputLabel: string;
  storeTaxNumberLabel: string;
  receiptFooterLabel: string;
  saveStoreSettingsBtn: string;
  storeSettingsSavedMsg: string;
  receiptPreviewTitle: string;
  paperSizeLabel: string;
  paper58mm: string;
  paper80mm: string;

  // Phase 4: Monthly/Yearly Sales & Profit Reports, Inventory Report, Offline Auto-Sync
  timeframeToday: string;
  timeframeMonth: string;
  timeframeYear: string;
  timeframeCustom: string;
  startDateLabel: string;
  endDateLabel: string;
  totalCogsLabel: string;
  netProfitLabel: string;
  totalDiscountsLabel: string;
  totalTaxCollectedLabel: string;
  paymentBreakdownTitle: string;
  paymentBreakdownSubtitle: string;
  exportCsvBtn: string;
  printReportBtn: string;
  qtySoldCol: string;
  reportGeneratedLabel: string;
  noOrdersInRange: string;

  invReportTitle: string;
  invReportSubtitle: string;
  totalExpectedRetailLabel: string;
  potentialProfitLabel: string;
  lowStockSectionTitle: string;
  noLowStockItems: string;
  stockValuationTitle: string;
  retailValueCol: string;
  potentialProfitCol: string;
  adjustmentsSummaryTitle: string;

  onlineStatusLabel: string;
  offlineStatusLabel: string;
  pendingSyncLabel: string;
  syncNowBtn: string;
  syncingNowLabel: string;
  offlineSaleQueuedNotice: string;
  offlineSyncedToast: string;

  // Phase 5: SaaS Subscription Lock, Super Admin, Expenses, WhatsApp Reminders
  daysLeftSuffix: string;
  trialExpiredBadge: string;
  accountBlockedBadge: string;
  superAdminBadge: string;
  subLockTitle: string;
  subLockDesc: string;
  subLockWhatsappBtn: string;
  subLockRefreshBtn: string;
  subLockEmailLabel: string;
  subLockPlanLabel: string;
  subLockExpiryLabel: string;

  saasAdminTitle: string;
  saasAdminSubtitle: string;
  totalTenantsLabel: string;
  activeTenantsLabel: string;
  expiredBlockedLabel: string;
  searchTenantsPlaceholder: string;
  extend30DaysBtn: string;
  extend1YearBtn: string;
  blockUserBtn: string;
  unblockUserBtn: string;
  statusActiveLabel: string;
  statusExpiredLabel: string;
  statusBlockedLabel: string;
  tenantEmailCol: string;
  tenantShopCol: string;
  tenantPlanCol: string;
  tenantExpiryCol: string;
  noTenantsFound: string;
  refreshListBtn: string;

  expensesTitle: string;
  expensesSubtitle: string;
  addExpenseBtn: string;
  editExpenseTitle: string;
  addExpenseTitle: string;
  expenseTitleLabel: string;
  expenseCategoryLabel: string;
  expenseAmountLabel: string;
  expenseDateLabel: string;
  expenseNotesLabel: string;
  saveExpenseBtn: string;
  todayExpensesLabel: string;
  monthExpensesLabel: string;
  yearExpensesLabel: string;
  totalExpensesLabel: string;
  noExpensesFound: string;
  expCatRent: string;
  expCatElectricity: string;
  expCatSalary: string;
  expCatSupplies: string;
  expCatMaintenance: string;
  expCatOther: string;
  netProfitAfterExpensesLabel: string;

  customerWhatsappLabel: string;
  reminderScheduleLabel: string;
  scheduleNone: string;
  schedule3Days: string;
  schedule1Week: string;
  schedule2Weeks: string;
  schedule1Month: string;
  scheduleCustom: string;
  dueDateLabel: string;
  dueRemindersTitle: string;
  dueTodayLabel: string;
  overdueLabel: string;
  sendWhatsappBtn: string;
  editReminderBtn: string;
  noDueReminders: string;

  returnExchangeBtn: string;
  returnModalTitle: string;
  returnModalSubtitle: string;
  returnSelectItemsLabel: string;
  returnQtyCol: string;
  purchasedQtyCol: string;
  alreadyReturnedLabel: string;
  returnResolutionLabel: string;
  returnRefundOptionTitle: string;
  returnRefundOptionDesc: string;
  returnExchangeOptionTitle: string;
  returnExchangeOptionDesc: string;
  returnReasonLabel: string;
  returnReasonPlaceholder: string;
  returnSummaryStockLabel: string;
  returnSummaryRevenueLabel: string;
  confirmRefundBtn: string;
  confirmExchangeBtn: string;
  statusCompletedLabel: string;
  statusPartiallyRefundedLabel: string;
  statusRefundedLabel: string;
  statusExchangedLabel: string;
  refundedBadgePrefix: string;
  fullyReturnedLabel: string;
  posReturnToggleBtn: string;
  posReturnBadge: string;
  netRefundDueLabel: string;
  newKhataCustomerInlineBtn: string;
  cancelNewKhataBtn: string;
  saveSelectCustomerBtn: string;
  quickKhataNamePlaceholder: string;
  quickKhataPhonePlaceholder: string;
  jazzcashSectionTitle: string;
  easypaisaSectionTitle: string;
  walletTitleLabel: string;
  walletNumberLabel: string;
  transferToAccountLabel: string;
  walletNotConfiguredMsg: string;
  transactionIdLabel: string;
  transactionIdPlaceholder: string;
  tidReceiptLabel: string;
  timeframeWeek: string;
  salesOverviewTitle: string;
  salesOverviewSubtitle: string;
  granularityDaily: string;
  granularityWeekly: string;
  granularityMonthly: string;
  granularityYearly: string;
  vsYesterdayLabel: string;
  vsLastWeekLabel: string;
  vsLastMonthLabel: string;
  vsLastYearLabel: string;
  vsPrevPeriodLabel: string;
  newPeriodBadge: string;
  salesGrowthLabel: string;
  kpiTooltipRevenue: string;
  kpiTooltipCogs: string;
  kpiTooltipGrossProfit: string;
  kpiTooltipExpenses: string;
  kpiTooltipNetProfit: string;
  kpiTooltipTax: string;
  inventoryAlertsTitle: string;
  inventoryAlertsSubtitle: string;
  alertTabLowOut: string;
  alertTabFastMoving: string;
  alertTabSlowMoving: string;
  manageInventoryBtn: string;
  suggestedReorderCol: string;
  sold30dCol: string;
  daysCoverCol: string;
  outOfStockBadge: string;
  lowStockBadge: string;
  noInventoryAlertsMsg: string;
  rankCol: string;
  topProductsSubtitle: string;
  noPaymentDataMsg: string;
  retryBtn: string;
  emptyDashboardTitle: string;
  emptyDashboardDesc: string;
  sellingUnitLabel: string;
  selectUnitPlaceholder: string;
  sellingUnitRequiredError: string;
  customQtyHint: string;
  pinEncryptedBadge: string;
  pinOptionalEditHint: string;
  switchRequiresPinNote: string;
  rbacUnauthorizedError: string;
  barcodeScanNotFound: string;
  barcodeScanOutOfStock: string;
  barcodeScanAdded: string;
  inCartLabel: string;
  dismissLabel: string;

  // Commercial Suite Navigation & Shared Labels (Phases 1-15)
  navShifts: string;
  navBranches: string;
  navAuditLogs: string;
  paymentBankTransfer: string;

  // Phase 1: Camera Barcode & QR Scanner
  scannerModeHid: string;
  scannerModeCameraBarcode: string;
  scannerModeQr: string;
  startCameraBtn: string;
  stopCameraBtn: string;
  switchCameraBtn: string;
  cameraPermissionDenied: string;
  cameraUnavailableMsg: string;
  cameraScanningHint: string;
  qrLabelTitle: string;
  labelFormatBarcode: string;
  labelFormatQr: string;
  labelFormatBoth: string;

  // Phase 2: Cash Drawer & Shifts
  shiftsTitle: string;
  shiftsSubtitle: string;
  openShiftBtn: string;
  closeShiftBtn: string;
  openingCashLabel: string;
  expectedCashLabel: string;
  actualCashCountLabel: string;
  cashShortageOverLabel: string;
  cashInBtn: string;
  cashOutBtn: string;
  shiftOpenStatus: string;
  shiftClosedStatus: string;
  shiftCloseAdminRequired: string;
  shiftHistoryTitle: string;
  cashDrawerMovementsTitle: string;
  noActiveShiftMsg: string;
  printShiftSlipBtn: string;

  // Phase 3: Advanced Inventory, Batch/Expiry, CSV & Bulk Edit
  brandLabel: string;
  variantLabel: string;
  wholesalePriceLabel: string;
  minStockLabel: string;
  reorderLevelLabel: string;
  batchNumberLabel: string;
  expiryDateLabel: string;
  expiredBadge: string;
  expiringSoonBadge: string;
  bulkEditBtn: string;
  importCsvBtn: string;
  poStatusLabel: string;
  supplierReturnBtn: string;
  supplierPaymentBtn: string;
  supplierStatementBtn: string;

  // Phase 5: Held Bills, Split Payment, Discounts, Cancel, Customer Display
  holdBillBtn: string;
  heldBillsBtn: string;
  resumeBillBtn: string;
  discardBillBtn: string;
  splitPaymentBtn: string;
  addPaymentSplitBtn: string;
  remainingToPayLabel: string;
  discountPercentMode: string;
  discountFixedMode: string;
  cancelOrderBtn: string;
  cancelOrderReasonLabel: string;
  statusCancelledLabel: string;
  reprintBadge: string;
  openCustomerDisplayBtn: string;
  customerDisplayTitle: string;

  // Phase 6-7: Credit Limit & WhatsApp
  creditLimitLabel: string;
  creditLimitExceededMsg: string;
  customerDiscountLabel: string;
  whatsappOptInLabel: string;
  printStatementBtn: string;
  sendWhatsappReceiptBtn: string;
  whatsappManualFallbackNotice: string;
  whatsappLogsTitle: string;
  timeframeYesterday: string;

  // Phase 9-12 & 14-15: Recurring Expenses, Branches, Offline History, Audit & Backup
  recurringExpenseLabel: string;
  deductFromDrawerLabel: string;
  approvalStatusLabel: string;
  branchesTitle: string;
  branchesSubtitle: string;
  addBranchBtn: string;
  stockTransferBtn: string;
  auditLogsTitle: string;
  auditLogsSubtitle: string;
  downloadBackupBtn: string;
  restoreBackupBtn: string;
  syncHistoryTitle: string;
  employeeActivityTitle: string;
  branchLimitReachedMsg: string;
  employeeLimitReachedMsg: string;
}

export const TRANSLATIONS: Record<Language, TranslationStrings> = {
  en: {
    brandName: 'Khaas Retail',
    navPos: 'POS Billing',
    navDashboard: 'Dashboard',
    navTransactions: 'Transactions',
    navInventory: 'Stock & Adjustments',
    navInventoryReport: 'Inventory Report',
    navPurchases: 'Purchases',
    navVendors: 'Vendors',
    navExpenses: 'Expenses',
    navCustomers: 'Customers',
    navUdhaar: 'Udhaar / Khata',
    navStaff: 'Staff & Permissions',
    navSettings: 'Store Settings',
    navSaasAdmin: 'SaaS Admin',
    navGroupOperations: 'Operations',
    navGroupInventory: 'Inventory & Supply',
    navGroupFinance: 'Finance & Khata',
    navGroupAdmin: 'Administration',
    openMenuBtn: 'Open navigation menu',
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
    taxLabel: 'Tax',
    grandTotalLabel: 'Grand Total',
    paymentMethodLabel: 'Payment Method',
    paymentCash: 'Cash',
    paymentJazzCash: 'JazzCash',
    paymentEasyPaisa: 'EasyPaisa',
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
    retailPriceLabel: 'Sale Price (Farokht) (Rs.)',
    costPriceLabel: 'Cost Price (Kharid) (Rs.)',
    profitAmountLabel: 'Profit Amount',
    profitMarginLabel: 'Profit Margin',
    taxRateLabel: 'Tax %',
    stockQtyLabel: 'Stock Quantity',
    barcodeInputLabel: 'Barcode / UPC',
    generateBarcodeBtn: 'Generate Barcode',
    printBarcodeBtn: 'Print Barcode Label',
    productPhotoLabel: 'Product Photo',
    uploadPhotoBtn: 'Upload Photo',
    uploadingPhotoLabel: 'Uploading...',
    removePhotoBtn: 'Remove',
    photoUploadHint: 'PNG, JPG or WEBP stored in product-images',
    barcodeModalTitle: 'Printable Barcode Label',
    printStickerBtn: 'Print Label',
    saveProductBtn: 'Save Product',
    cancelBtn: 'Cancel',
    editBtn: 'Edit',
    deleteBtn: 'Delete',
    confirmDeleteBtn: 'Confirm',
    deleteProductTitle: 'Delete Product Permanently?',
    deleteProductConfirmDesc:
      'This product will be permanently removed from your inventory and Supabase cloud database. This action cannot be undone.',
    deleteForeverBtn: 'Delete Product',
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

    logoutBtn: 'Logout',
    authTitle: 'Shopkeeper Sign In',
    authSubtitle: 'Access your private POS register, stock catalog, sales analytics, and Khata ledger',
    signInTab: 'Sign In',
    signUpTab: 'Create Account',
    shopNameLabel: 'Shop / Store Name',
    emailLabel: 'Email Address',
    passwordLabel: 'Password',
    signInBtn: 'Sign In to Register',
    createAccountBtn: 'Create Shopkeeper Account',
    demoSignInBtn: 'Continue with Demo Store',
    signingInLabel: 'Signing in...',
    loadingWorkspace: 'Loading your store records...',
    passwordMinLengthError: 'Password must be at least 6 characters.',

    cloudSyncBannerTitle: 'Supabase Database Permissions Needed',
    cloudSyncBannerFallback:
      'Running with local browser storage for now. Run the setup SQL in your Supabase SQL Editor, then click Retry Sync.',
    cloudSyncRetryBtn: 'Retry Sync',
    cloudSyncSqlBtn: 'View SQL Fix',
    cloudSyncModalTitle: 'Supabase SQL Setup & Permissions',
    cloudSyncModalDesc:
      'Copy and run this SQL in your Supabase Project → SQL Editor to grant table permissions, enable Row Level Security, and create the product-images storage bucket.',
    copySqlBtn: 'Copy SQL',
    copiedSqlBtn: 'Copied!',

    adjustStockBtn: 'Adjust Stock',
    totalStockValueLabel: 'Total Stock Value (Cost)',
    totalUnitsInStockLabel: 'Total Units in Stock',
    lowStockCountLabel: 'Low / Out of Stock',
    stockValueCol: 'Stock Value',
    adjustModalTitle: 'Inventory Stock Adjustment',
    adjustmentTypeLabel: 'Adjustment Type',
    adjTypeDamaged: 'Damaged',
    adjTypeExpired: 'Expired',
    adjTypeLost: 'Lost / Theft',
    adjTypeCorrection: 'Stock Count Correction',
    qtyChangeLabel: 'Quantity Change',
    qtyDirectionAdd: 'Add (+)',
    qtyDirectionRemove: 'Deduct (-)',
    currentStockLabel: 'Current Stock',
    newStockPreviewLabel: 'New Stock After Adjustment',
    adjustmentReasonLabel: 'Reason / Remarks',
    adjustmentReasonPlaceholder: 'e.g., Damaged carton during storage, physical audit...',
    saveAdjustmentBtn: 'Save Stock Adjustment',
    adjustmentHistoryTitle: 'Recent Inventory Adjustments',
    noAdjustmentsRecorded: 'No stock adjustments recorded yet.',
    previousNewCol: 'Prev → New',
    reasonCol: 'Reason',

    vendorsTitle: 'Vendors & Suppliers',
    vendorsSubtitle: 'Manage wholesale suppliers, track payable balances (Baqi Udhaar), and record vendor payments',
    addVendorBtn: 'Add Vendor',
    editVendorTitle: 'Edit Vendor',
    addVendorTitle: 'Add New Vendor',
    totalVendorsLabel: 'Total Vendors',
    totalPayableLabel: 'Total Payable (Baqi Udhaar)',
    vendorsWithDueLabel: 'Vendors With Balance Due',
    totalPurchasedLabel: 'Total Purchases Volume',
    searchVendorsPlaceholder: 'Search vendor name, company, or phone...',
    filterAllVendors: 'All Vendors',
    filterPayableVendors: 'Payable Due',
    vendorNameLabel: 'Contact Person Name',
    vendorCompanyLabel: 'Company / Business Name',
    vendorPhoneLabel: 'Phone Number',
    vendorAddressLabel: 'Address / Market',
    vendorOpeningBalanceLabel: 'Opening Payable Balance (Rs., optional)',
    saveVendorBtn: 'Save Vendor',
    payableBalanceCol: 'Payable Balance',
    payVendorBtn: 'Record Payment',
    payVendorModalTitle: 'Record Vendor Payment',
    paymentAmountLabel: 'Payment Amount (Rs.)',
    confirmPaymentBtn: 'Confirm Payment',
    noVendorsFound: 'No vendors match your search.',
    vendorPurchasesTitle: 'Purchase History for Vendor',
    noVendorPurchases: 'No purchases recorded for this vendor yet.',

    purchasesTitle: 'Purchases & Receiving Inventory',
    purchasesSubtitle: 'Receive supplier deliveries, automatically increase stock, update latest cost prices, and post unpaid balances to vendor Khata',
    newPurchaseTitle: 'Create Purchase / Stock In',
    selectVendorLabel: 'Select Vendor / Supplier',
    chooseVendorOption: 'Choose a vendor...',
    invoiceNoLabel: 'Supplier Invoice / PO #',
    addProductToPurchaseLabel: 'Add Product to Purchase List',
    chooseProductOption: 'Select a product to add...',
    addRowBtn: 'Add Item',
    purchaseCostCol: 'Purchase Cost',
    lineTotalCol: 'Line Total',
    purchaseTotalLabel: 'Total Purchase Bill',
    paidAmountLabel: 'Paid Amount (Rs.)',
    payFullBtn: 'Paid Full',
    remainingPayableLabel: 'Added to Vendor Payable (Baqi)',
    purchaseNoteLabel: 'Delivery Note (optional)',
    purchaseNotePlaceholder: 'e.g., Weekly wholesale delivery...',
    receiveInventoryBtn: 'Receive Inventory',
    purchaseSuccessMsg: 'Inventory received! Product stock & cost prices updated.',
    purchaseHistoryTitle: 'Recent Purchases & Stock In History',
    noPurchasesYet: 'No purchases recorded yet.',
    vendorCol: 'Vendor',
    paidCol: 'Paid',
    balanceDueCol: 'Unpaid / Baqi',
    noVendorsNotice: 'Add a vendor first before receiving a purchase.',
    goToVendorsBtn: 'Go to Vendors',

    selectSaleCustomerLabel: 'Link Customer (Optional)',
    walkInOption: 'Walk-in Customer (No Profile)',
    posCustomerBalanceBadge: 'Udhaar Bal:',
    customersTitle: 'Customer Management & History',
    customersSubtitle: 'Manage store customers, track Udhaar balances, and inspect itemized purchase histories',
    addCrmCustomerBtn: 'Add Customer',
    editCrmCustomerTitle: 'Edit Customer Profile',
    addCrmCustomerTitle: 'Add New Customer',
    customerAddressLabel: 'Address / Area',
    customerUdhaarBalanceLabel: 'Udhaar / Khata Balance (Rs.)',
    totalCrmCustomersLabel: 'Total Customers',
    customersWithBalanceLabel: 'Customers With Udhaar',
    totalCustomerPurchasesLabel: 'Total Billed Volume',
    customerBillsCol: 'Past Bills',
    customerAddressCol: 'Address',
    filterAllCustomers: 'All Customers',
    filterUdhaarCustomers: 'With Balance Due',
    viewProfileHistoryBtn: 'Profile & History',
    customerProfileTitle: 'Customer Profile & Purchase History',
    customerHistoryTitle: 'Past Bills & Itemized Purchases',
    customerTotalBillsLabel: 'Completed Bills',
    noCustomerBills: 'No completed sales linked to this customer yet.',
    recordCustomerPaymentBtn: 'Receive Payment',
    payCustomerModalTitle: 'Receive Customer Payment',

    staffTitle: 'Staff & Role Permissions',
    staffSubtitle: 'Manage cashiers, managers, and admins with 4-digit PIN codes for quick register switching',
    addEmployeeBtn: 'Add Staff Member',
    editEmployeeTitle: 'Edit Staff Member',
    addEmployeeTitle: 'Add New Staff Member',
    employeeNameLabel: 'Staff Full Name',
    employeePhoneLabel: 'Phone Number',
    employeeRoleLabel: 'Access Role',
    employeePinLabel: '4-Digit PIN Code',
    employeePinHint: 'Used for quick staff switch & register lock screen',
    employeePinError: 'Please enter a valid 4-digit numeric PIN.',
    employeeActiveLabel: 'Active Staff Account',
    activeStatusLabel: 'Active',
    inactiveStatusLabel: 'Disabled',
    saveEmployeeBtn: 'Save Staff Member',
    roleAdmin: 'Admin',
    roleManager: 'Manager',
    roleCashier: 'Cashier',
    roleAdminDesc: 'Full access: cost prices, margins, analytics, staff, store settings, and delete actions.',
    roleManagerDesc: 'Manage products, purchases, stock adjustments, vendors, and customers (no staff/settings/delete).',
    roleCashierDesc: 'POS Billing, Sales History, and Customers only. Cost prices, margins, analytics, and delete hidden.',
    permissionsGuideTitle: 'Role Permission Matrix',
    switchStaffBtn: 'Switch Staff / Lock',
    lockScreenBtn: 'Lock Register',
    activeStaffLabel: 'Active Staff',
    lockScreenTitle: 'Register Locked — Enter Staff PIN',
    lockScreenSubtitle: 'Enter your 4-digit PIN or select an active staff profile to resume POS operations.',
    enterPinLabel: '4-Digit PIN',
    unlockRegisterBtn: 'Unlock Register',
    invalidPinError: 'Invalid PIN code or inactive staff account.',
    quickSwitchStaffLabel: 'Select Active Staff Member',
    lastAdminNotice: 'At least one active Admin account must remain active.',
    pinTakenError: 'Another staff member is already using this 4-digit PIN.',
    firstAdminSetupBadge: 'First-Time Setup',
    firstAdminSetupTitle: 'Create Your Store Admin PIN',
    firstAdminSetupSubtitle: 'No Admin PIN has been configured for this store yet. Create your initial Admin profile and choose a 4-digit PIN to secure your register.',
    adminFullNameLabel: 'Admin Full Name',
    adminPhoneOptionalLabel: 'Phone Number (Optional)',
    newPinLabel: 'New 4-Digit PIN',
    confirmPinLabel: 'Confirm 4-Digit PIN',
    pinMismatchError: 'PIN and confirmation PIN do not match.',
    adminNameRequiredError: 'Please enter the Admin full name.',
    createAdminSaveBtn: 'Save Admin PIN & Enter POS',
    firstAdminSecurityNote: 'Your PIN is encrypted before saving. No existing PIN is needed for initial setup.',

    storeSettingsTitle: 'Business & Store Settings',
    storeSettingsSubtitle: 'Configure your store identity, contact info, tax/NTN number, and printed receipt footer',
    storeNameInputLabel: 'Store / Business Name',
    storePhoneInputLabel: 'Store Phone Number',
    storeAddressInputLabel: 'Store Address',
    storeTaxNumberLabel: 'Tax / NTN / STRN Number',
    receiptFooterLabel: 'Custom Receipt Footer Message',
    saveStoreSettingsBtn: 'Save Store Settings',
    storeSettingsSavedMsg: 'Store settings saved! Header and thermal receipts updated.',
    receiptPreviewTitle: 'Live Thermal Receipt Preview',
    paperSizeLabel: 'Paper Width',
    paper58mm: '58mm',
    paper80mm: '80mm',

    timeframeToday: 'Today',
    timeframeMonth: 'This Month',
    timeframeYear: 'This Year',
    timeframeCustom: 'Custom Range',
    startDateLabel: 'From',
    endDateLabel: 'To',
    totalCogsLabel: 'Total Cost of Goods (COGS)',
    netProfitLabel: 'Net Profit (Rev - Cost)',
    totalDiscountsLabel: 'Total Discounts',
    totalTaxCollectedLabel: 'Total Tax Collected',
    paymentBreakdownTitle: 'Payment Method Breakdown',
    paymentBreakdownSubtitle: 'Revenue share across Cash, JazzCash, EasyPaisa, Card & Udhaar',
    exportCsvBtn: 'Export CSV (Excel)',
    printReportBtn: 'Print Report',
    qtySoldCol: 'Qty Sold',
    reportGeneratedLabel: 'Report Period',
    noOrdersInRange: 'No sales recorded in the selected date range.',

    invReportTitle: 'Inventory Valuation & Stock Report',
    invReportSubtitle: 'Live stock cost value, expected retail value, potential profit, low-stock alerts & adjustments summary',
    totalExpectedRetailLabel: 'Expected Retail Value',
    potentialProfitLabel: 'Potential Profit',
    lowStockSectionTitle: 'Low-Stock & Out-of-Stock Items (<= 5 units)',
    noLowStockItems: 'All inventory items are comfortably stocked.',
    stockValuationTitle: 'Stock Valuation Breakdown',
    retailValueCol: 'Retail Value',
    potentialProfitCol: 'Potential Profit',
    adjustmentsSummaryTitle: 'Inventory Adjustments Summary',

    onlineStatusLabel: 'Online • Cloud Synced',
    offlineStatusLabel: 'Offline Mode • Saving Locally',
    pendingSyncLabel: 'pending',
    syncNowBtn: 'Sync Now',
    syncingNowLabel: 'Syncing...',
    offlineSaleQueuedNotice: 'Offline sale saved locally to queue and ready for auto-sync.',
    offlineSyncedToast: 'offline sale(s) & stock updates synced to Supabase cloud.',

    daysLeftSuffix: 'Days Left',
    trialExpiredBadge: 'License Expired',
    accountBlockedBadge: 'Account Blocked',
    superAdminBadge: 'Super Admin',
    subLockTitle: 'Subscription Expired / Account Locked',
    subLockDesc:
      'Subscription Expired / Account Locked — Contact Haseeb Ahmed (Netra-Dev Solutions) on WhatsApp to renew your license.',
    subLockWhatsappBtn: 'Contact Haseeb Ahmed on WhatsApp',
    subLockRefreshBtn: 'Check Renewal Status',
    subLockEmailLabel: 'Account Email',
    subLockPlanLabel: 'Current Plan',
    subLockExpiryLabel: 'Expiry Date',

    saasAdminTitle: 'SaaS Admin — License & Subscription Control',
    saasAdminSubtitle:
      'Manage registered shopkeepers, extend trial/annual licenses, or block/unblock store accounts',
    totalTenantsLabel: 'Registered Shopkeepers',
    activeTenantsLabel: 'Active Licenses',
    expiredBlockedLabel: 'Expired / Blocked',
    searchTenantsPlaceholder: 'Search shopkeeper email, shop name, or plan...',
    extend30DaysBtn: 'Extend +30 Days',
    extend1YearBtn: 'Extend +1 Year',
    blockUserBtn: 'Block',
    unblockUserBtn: 'Unblock',
    statusActiveLabel: 'Active',
    statusExpiredLabel: 'Expired',
    statusBlockedLabel: 'Blocked',
    tenantEmailCol: 'Shopkeeper Email',
    tenantShopCol: 'Store Name',
    tenantPlanCol: 'Plan',
    tenantExpiryCol: 'Expires On',
    noTenantsFound: 'No shopkeeper subscriptions match your filter.',
    refreshListBtn: 'Refresh List',

    expensesTitle: 'Daily Shop Expenses',
    expensesSubtitle:
      'Record rent, electricity, staff salaries, and daily operating costs to calculate true Net Profit',
    addExpenseBtn: 'Add Expense',
    editExpenseTitle: 'Edit Expense',
    addExpenseTitle: 'Add Shop Expense',
    expenseTitleLabel: 'Expense Title',
    expenseCategoryLabel: 'Category',
    expenseAmountLabel: 'Amount (Rs.)',
    expenseDateLabel: 'Expense Date',
    expenseNotesLabel: 'Notes (optional)',
    saveExpenseBtn: 'Save Expense',
    todayExpensesLabel: "Today's Expenses",
    monthExpensesLabel: "This Month's Expenses",
    yearExpensesLabel: "This Year's Expenses",
    totalExpensesLabel: 'Total Expenses',
    noExpensesFound: 'No expenses recorded for the current filter.',
    expCatRent: 'Rent',
    expCatElectricity: 'Electricity',
    expCatSalary: 'Staff Salary',
    expCatSupplies: 'Supplies',
    expCatMaintenance: 'Maintenance',
    expCatOther: 'Other',
    netProfitAfterExpensesLabel: 'Net Profit After Expenses',

    customerWhatsappLabel: 'Customer WhatsApp Phone',
    reminderScheduleLabel: 'Reminder Schedule',
    scheduleNone: 'No Reminder',
    schedule3Days: '3 Days',
    schedule1Week: '1 Week',
    schedule2Weeks: '2 Weeks',
    schedule1Month: '1 Month',
    scheduleCustom: 'Custom Date',
    dueDateLabel: 'Due Date',
    dueRemindersTitle: 'Due Reminders',
    dueTodayLabel: 'Due Today',
    overdueLabel: 'Overdue',
    sendWhatsappBtn: 'Send WhatsApp',
    editReminderBtn: 'Reminder Schedule',
    noDueReminders: 'No Udhaar reminders due today or overdue.',

    returnExchangeBtn: 'Return / Exchange',
    returnModalTitle: 'Return / Exchange Items',
    returnModalSubtitle: 'Select invoice items and quantities to restock, then choose Cash Refund or Exchange.',
    returnSelectItemsLabel: 'Select Items to Return',
    returnQtyCol: 'Return Qty',
    purchasedQtyCol: 'Sold',
    alreadyReturnedLabel: 'Returned',
    returnResolutionLabel: 'Resolution Mode',
    returnRefundOptionTitle: 'Cash / Wallet Refund (Paise Wapas)',
    returnRefundOptionDesc: 'Adds returned items back to inventory stock and deducts the refunded amount from sale & revenue totals.',
    returnExchangeOptionTitle: 'Exchange / Store Credit (Cheez Badli)',
    returnExchangeOptionDesc: 'Adds returned items back to inventory stock without deducting cash revenue so the customer can take another item.',
    returnReasonLabel: 'Reason / Note (Optional)',
    returnReasonPlaceholder: 'e.g., Seal broken, wrong flavor, customer exchange...',
    returnSummaryStockLabel: 'Units Added Back to Stock',
    returnSummaryRevenueLabel: 'Revenue / Sale Deduction',
    confirmRefundBtn: 'Confirm Cash Refund',
    confirmExchangeBtn: 'Confirm Exchange',
    statusCompletedLabel: 'Completed',
    statusPartiallyRefundedLabel: 'Partially Refunded',
    statusRefundedLabel: 'Refunded',
    statusExchangedLabel: 'Exchanged',
    refundedBadgePrefix: 'Refunded',
    fullyReturnedLabel: 'Returned',
    posReturnToggleBtn: 'Return',
    posReturnBadge: 'RETURN',
    netRefundDueLabel: 'Net Refund Due',
    newKhataCustomerInlineBtn: '+ New Khata Customer',
    cancelNewKhataBtn: 'Use Existing',
    saveSelectCustomerBtn: 'Save & Select',
    quickKhataNamePlaceholder: 'Customer Full Name *',
    quickKhataPhonePlaceholder: 'WhatsApp Phone (e.g., 0300-1234567)',
    jazzcashSectionTitle: 'JazzCash Account Details',
    easypaisaSectionTitle: 'EasyPaisa Account Details',
    walletTitleLabel: 'Account Title',
    walletNumberLabel: 'Account Number',
    transferToAccountLabel: 'Transfer To',
    walletNotConfiguredMsg: 'No account number saved yet — add it in Store Settings.',
    transactionIdLabel: 'Transaction ID (TID) (Optional)',
    transactionIdPlaceholder: 'e.g., 8492019482',
    tidReceiptLabel: 'TID',
    timeframeWeek: 'This Week',
    salesOverviewTitle: 'Sales Overview & Trends',
    salesOverviewSubtitle: 'Interactive sales revenue, completed orders, and profit trend',
    granularityDaily: 'Daily',
    granularityWeekly: 'Weekly',
    granularityMonthly: 'Monthly',
    granularityYearly: 'Yearly',
    vsYesterdayLabel: 'vs yesterday',
    vsLastWeekLabel: 'vs last week',
    vsLastMonthLabel: 'vs last month',
    vsLastYearLabel: 'vs last year',
    vsPrevPeriodLabel: 'vs prev period',
    newPeriodBadge: 'New',
    salesGrowthLabel: 'Sales Growth',
    kpiTooltipRevenue: 'Net sales revenue collected across completed bills after discounts, taxes, and refunds.',
    kpiTooltipCogs: 'Cost of Goods Sold calculated from unit cost of active sold items (adjusted for returns).',
    kpiTooltipGrossProfit: 'Net Revenue minus Cost of Goods Sold (COGS).',
    kpiTooltipExpenses: 'Total daily shop expenses recorded in this period.',
    kpiTooltipNetProfit: 'Gross Profit minus Total Expenses.',
    kpiTooltipTax: 'Total sales tax collected on completed invoices after returns.',
    inventoryAlertsTitle: 'Inventory Alerts & Velocity',
    inventoryAlertsSubtitle: 'Monitor low/out-of-stock SKUs, 30-day movement speed, and reorder suggestions',
    alertTabLowOut: 'Low & Out of Stock',
    alertTabFastMoving: 'Fast Moving',
    alertTabSlowMoving: 'Slow Moving',
    manageInventoryBtn: 'Open Inventory',
    suggestedReorderCol: 'Suggested Reorder',
    sold30dCol: '30d Sold',
    daysCoverCol: 'Cover',
    outOfStockBadge: 'Out of Stock',
    lowStockBadge: 'Low Stock',
    noInventoryAlertsMsg: 'All stock levels are healthy with no alerts.',
    rankCol: '#',
    topProductsSubtitle: 'Ranked by revenue with units sold and gross profit',
    noPaymentDataMsg: 'No completed sales in this period.',
    retryBtn: 'Retry',
    emptyDashboardTitle: 'No sales recorded yet',
    emptyDashboardDesc: 'Complete your first sale on the POS Billing counter to populate live charts and metrics.',
    sellingUnitLabel: 'Selling Unit',
    selectUnitPlaceholder: 'Select unit (kg, litre, piece...)',
    sellingUnitRequiredError: 'Please select a selling unit for this product.',
    customQtyHint: 'Enter any exact or decimal quantity (e.g. 0.25, 1.5, 3.75)',
    pinEncryptedBadge: 'PIN Encrypted (PBKDF2/Bcrypt)',
    pinOptionalEditHint: 'Leave blank to keep existing PIN',
    switchRequiresPinNote: 'Switching staff requires verifying their 4-digit PIN.',
    rbacUnauthorizedError: 'Your current staff role is not permitted to perform this action.',
    barcodeScanNotFound: 'No product found for barcode',
    barcodeScanOutOfStock: 'Out of stock for scanned product',
    barcodeScanAdded: 'Scanned',
    inCartLabel: 'in cart',
    dismissLabel: 'Dismiss',

    navShifts: 'Cash & Shifts',
    navBranches: 'Branches & Transfers',
    navAuditLogs: 'Audit & Backups',
    paymentBankTransfer: 'Bank Transfer',

    scannerModeHid: 'HID Scanner',
    scannerModeCameraBarcode: 'Camera Barcode',
    scannerModeQr: 'QR Scanner',
    startCameraBtn: 'Start Camera',
    stopCameraBtn: 'Stop Camera',
    switchCameraBtn: 'Switch Camera',
    cameraPermissionDenied: 'Camera permission was denied. Allow camera access in browser settings and retry.',
    cameraUnavailableMsg: 'No camera device detected or camera is in use by another app.',
    cameraScanningHint: 'Hold barcode or product QR code steady inside the frame.',
    qrLabelTitle: 'Barcode & QR Label',
    labelFormatBarcode: 'Barcode Only',
    labelFormatQr: 'QR Code Only',
    labelFormatBoth: 'Barcode + QR',

    shiftsTitle: 'Cash Drawer & Cashier Shifts',
    shiftsSubtitle: 'Open registers with starting float, track drawer cash in/out, and reconcile shift closing totals',
    openShiftBtn: 'Open Shift',
    closeShiftBtn: 'Close Shift',
    openingCashLabel: 'Opening Cash Float (Rs.)',
    expectedCashLabel: 'Expected Drawer Cash',
    actualCashCountLabel: 'Actual Counted Cash (Rs.)',
    cashShortageOverLabel: 'Shortage / Overage',
    cashInBtn: 'Cash In (+)',
    cashOutBtn: 'Cash Out (-)',
    shiftOpenStatus: 'Shift Open',
    shiftClosedStatus: 'Closed',
    shiftCloseAdminRequired: 'Only an Admin or Manager can finalize and close a register shift.',
    shiftHistoryTitle: 'Shift History & Cashier Performance',
    cashDrawerMovementsTitle: 'Drawer Movements Ledger',
    noActiveShiftMsg: 'No active register shift is open. Open a shift to track drawer movements.',
    printShiftSlipBtn: 'Print Shift Slip',

    brandLabel: 'Brand',
    variantLabel: 'Variant / Size',
    wholesalePriceLabel: 'Wholesale Price (Rs.)',
    minStockLabel: 'Min Stock Alert',
    reorderLevelLabel: 'Reorder Level',
    batchNumberLabel: 'Batch #',
    expiryDateLabel: 'Expiry Date',
    expiredBadge: 'Expired',
    expiringSoonBadge: 'Near Expiry',
    bulkEditBtn: 'Bulk Edit',
    importCsvBtn: 'Import CSV',
    poStatusLabel: 'PO Status',
    supplierReturnBtn: 'Purchase Return',
    supplierPaymentBtn: 'Supplier Payment',
    supplierStatementBtn: 'Statement',

    holdBillBtn: 'Hold Bill',
    heldBillsBtn: 'Held Bills',
    resumeBillBtn: 'Resume',
    discardBillBtn: 'Discard',
    splitPaymentBtn: 'Split Payment',
    addPaymentSplitBtn: 'Add Payment Part',
    remainingToPayLabel: 'Remaining Balance',
    discountPercentMode: '% Percent',
    discountFixedMode: 'Rs. Fixed',
    cancelOrderBtn: 'Cancel Order',
    cancelOrderReasonLabel: 'Cancellation Reason',
    statusCancelledLabel: 'Cancelled',
    reprintBadge: 'REPRINT',
    openCustomerDisplayBtn: 'Customer Display',
    customerDisplayTitle: 'Customer Facing Display',

    creditLimitLabel: 'Credit Limit (Rs.)',
    creditLimitExceededMsg: 'This credit sale exceeds the customer credit limit.',
    customerDiscountLabel: 'Customer Discount %',
    whatsappOptInLabel: 'Customer opted in for WhatsApp receipts & reminders',
    printStatementBtn: 'Print Statement',
    sendWhatsappReceiptBtn: 'Send via WhatsApp',
    whatsappManualFallbackNotice: 'WhatsApp Cloud API credentials are not configured on the server; opening manual WhatsApp share fallback.',
    whatsappLogsTitle: 'WhatsApp Delivery Log',
    timeframeYesterday: 'Yesterday',

    recurringExpenseLabel: 'Recurring Expense',
    deductFromDrawerLabel: 'Deduct from active cash drawer',
    approvalStatusLabel: 'Approval',
    branchesTitle: 'Multi-Branch & Stock Transfers',
    branchesSubtitle: 'Manage shop locations, branch-wise stock, and inter-branch transfer approvals',
    addBranchBtn: 'Add Branch',
    stockTransferBtn: 'New Stock Transfer',
    auditLogsTitle: 'Audit Logs, Sync & Backups',
    auditLogsSubtitle: 'Inspect security & price/stock audit trails, employee activity, offline sync history, and workspace backups',
    downloadBackupBtn: 'Download Full JSON Backup',
    restoreBackupBtn: 'Restore From Backup',
    syncHistoryTitle: 'Offline Sync History',
    employeeActivityTitle: 'Employee Login & Switch Activity',
    branchLimitReachedMsg: 'Branch limit reached for your current SaaS subscription plan.',
    employeeLimitReachedMsg: 'Employee limit reached for your current SaaS subscription plan.',
  },
  ur: {
    brandName: 'خاص ریٹیل',
    navPos: 'بلنگ کاؤنٹر',
    navDashboard: 'ڈیش بورڈ',
    navTransactions: 'لین دین',
    navInventory: 'اسٹاک و ایڈجسٹمنٹ',
    navInventoryReport: 'اسٹاک رپورٹ',
    navPurchases: 'خریداری / اسٹاک ان',
    navVendors: 'سپلائرز',
    navExpenses: 'اخراجات',
    navCustomers: 'گاہک',
    navUdhaar: 'ادھار / کھاتہ',
    navStaff: 'اسٹاف و پرمیشنز',
    navSettings: 'اسٹور سیٹنگز',
    navSaasAdmin: 'سپر ایڈمن پینل',
    navGroupOperations: 'روزمرہ کاروبار',
    navGroupInventory: 'اسٹاک اور خریداری',
    navGroupFinance: 'مالیات اور کھاتہ',
    navGroupAdmin: 'انتظامیہ',
    openMenuBtn: 'مینو کھولیں',
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
    taxLabel: 'ٹیکس',
    grandTotalLabel: 'کل رقم',
    paymentMethodLabel: 'ادائیگی کا طریقہ',
    paymentCash: 'نقد',
    paymentJazzCash: 'جاز کیش',
    paymentEasyPaisa: 'ایزی پیسہ',
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
    retailPriceLabel: 'قیمتِ فروخت (روپے)',
    costPriceLabel: 'قیمتِ خرید / لاگت (روپے)',
    profitAmountLabel: 'منافع رقم',
    profitMarginLabel: 'منافع شرح',
    taxRateLabel: 'ٹیکس %',
    stockQtyLabel: 'اسٹاک کی تعداد',
    barcodeInputLabel: 'بارکوڈ / یو پی سی',
    generateBarcodeBtn: 'بارکوڈ بنائیں',
    printBarcodeBtn: 'بارکوڈ لیبل پرنٹ کریں',
    productPhotoLabel: 'پروڈکٹ کی تصویر',
    uploadPhotoBtn: 'تصویر اپ لوڈ کریں',
    uploadingPhotoLabel: 'اپ لوڈ ہو رہا ہے...',
    removePhotoBtn: 'ہٹائیں',
    photoUploadHint: 'پروڈکٹ کی تصویر اپ لوڈ کریں',
    barcodeModalTitle: 'پرنٹ ایبل بارکوڈ لیبل',
    printStickerBtn: 'لیبل پرنٹ کریں',
    saveProductBtn: 'محفوظ کریں',
    cancelBtn: 'منسوخ',
    editBtn: 'ترمیم',
    deleteBtn: 'حذف',
    confirmDeleteBtn: 'تصدیق',
    deleteProductTitle: 'پروڈکٹ مستقل طور پر حذف کریں؟',
    deleteProductConfirmDesc:
      'یہ پروڈکٹ آپ کے اسٹاک اور کلاؤڈ ڈیٹابیس سے مستقل طور پر حذف ہو جائے گی۔ یہ عمل واپس نہیں ہو سکتا۔',
    deleteForeverBtn: 'حذف کریں',
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

    logoutBtn: 'لاگ آؤٹ',
    authTitle: 'دکاندار لاگ ان',
    authSubtitle: 'اپنے ذاتی پی او ایس رجسٹر، اسٹاک، سیلز ڈیش بورڈ اور کھاتہ رجسٹر تک رسائی حاصل کریں',
    signInTab: 'لاگ ان',
    signUpTab: 'نیا اکاؤنٹ بنائیں',
    shopNameLabel: 'دکان / اسٹور کا نام',
    emailLabel: 'ای میل ایڈریس',
    passwordLabel: 'پاس ورڈ',
    signInBtn: 'رجسٹر میں لاگ ان کریں',
    createAccountBtn: 'نیا دکاندار اکاؤنٹ بنائیں',
    demoSignInBtn: 'ڈیمو اسٹور کے ساتھ جاری رکھیں',
    signingInLabel: 'لاگ ان ہو رہا ہے...',
    loadingWorkspace: 'آپ کی دکان کا ڈیٹا لوڈ ہو رہا ہے...',
    passwordMinLengthError: 'پاس ورڈ کم از کم 6 حروف کا ہونا چاہیے۔',

    cloudSyncBannerTitle: 'Supabase ڈیٹا بیس پرمیشن درکار ہے',
    cloudSyncBannerFallback:
      'فی الحال ڈیٹا مقامی براؤزر اسٹوریج میں محفوظ ہو رہا ہے۔ اپنے Supabase SQL Editor میں سیٹ اپ SQL چلائیں اور دوبارہ کوشش کریں۔',
    cloudSyncRetryBtn: 'دوبارہ سنک کریں',
    cloudSyncSqlBtn: 'SQL حل دیکھیں',
    cloudSyncModalTitle: 'Supabase SQL سیٹ اپ اور پرمیشنز',
    cloudSyncModalDesc:
      'ٹیبل پرمیشنز، RLS پالیسیز اور product-images اسٹوریج بکٹ بنانے کے لیے یہ SQL اپنے Supabase SQL Editor میں چلائیں۔',
    copySqlBtn: 'SQL کاپی کریں',
    copiedSqlBtn: 'کاپی ہو گیا!',

    adjustStockBtn: 'اسٹاک ایڈجسٹ کریں',
    totalStockValueLabel: 'کل اسٹاک مالیت (لاگت)',
    totalUnitsInStockLabel: 'کل دستیاب یونٹس',
    lowStockCountLabel: 'کم / ختم اسٹاک',
    stockValueCol: 'اسٹاک مالیت',
    adjustModalTitle: 'اسٹاک ایڈجسٹمنٹ فارم',
    adjustmentTypeLabel: 'ایڈجسٹمنٹ کی قسم',
    adjTypeDamaged: 'خراب / ٹوٹ پھوٹ (Damaged)',
    adjTypeExpired: 'میعاد ختم (Expired)',
    adjTypeLost: 'گمشدہ / چوری (Lost/Theft)',
    adjTypeCorrection: 'گنتی کی تصحیح (Correction)',
    qtyChangeLabel: 'تعداد میں تبدیلی',
    qtyDirectionAdd: 'اضافہ (+)',
    qtyDirectionRemove: 'کمی (-)',
    currentStockLabel: 'موجودہ اسٹاک',
    newStockPreviewLabel: 'تبدیلی کے بعد نیا اسٹاک',
    adjustmentReasonLabel: 'وجہ / تفصیل',
    adjustmentReasonPlaceholder: 'مثلاً اسٹوریج میں نقصان یا گنتی کی درستگی...',
    saveAdjustmentBtn: 'ایڈجسٹمنٹ محفوظ کریں',
    adjustmentHistoryTitle: 'حالیہ اسٹاک ایڈجسٹمنٹ ریکارڈ',
    noAdjustmentsRecorded: 'ابھی تک کوئی اسٹاک ایڈجسٹمنٹ درج نہیں ہوئی۔',
    previousNewCol: 'پہلے ← نیا',
    reasonCol: 'وجہ',

    vendorsTitle: 'وینڈرز اور سپلائرز',
    vendorsSubtitle: 'سپلائرز شامل اور ایڈٹ کریں، واجب الادا ادھار دیکھیں اور ادائیگی ریکارڈ کریں',
    addVendorBtn: 'نیا سپلائر شامل کریں',
    editVendorTitle: 'سپلائر میں ترمیم کریں',
    addVendorTitle: 'نیا سپلائر شامل کریں',
    totalVendorsLabel: 'کل سپلائرز',
    totalPayableLabel: 'کل واجب الادا رقم (باقی ادھار)',
    vendorsWithDueLabel: 'واجب الادا سپلائرز',
    totalPurchasedLabel: 'کل خریداری حجم',
    searchVendorsPlaceholder: 'سپلائر کا نام، کمپنی یا فون تلاش کریں...',
    filterAllVendors: 'تمام سپلائرز',
    filterPayableVendors: 'واجب الادا',
    vendorNameLabel: 'رابطہ شخص کا نام',
    vendorCompanyLabel: 'کمپنی / کاروبار کا نام',
    vendorPhoneLabel: 'فون نمبر',
    vendorAddressLabel: 'پتہ / مارکیٹ',
    vendorOpeningBalanceLabel: 'ابتدائی واجب الادا بیلنس (اختیاری)',
    saveVendorBtn: 'سپلائر محفوظ کریں',
    payableBalanceCol: 'واجب الادا بیلنس',
    payVendorBtn: 'ادائیگی درج کریں',
    payVendorModalTitle: 'سپلائر کو ادائیگی ریکارڈ کریں',
    paymentAmountLabel: 'ادائیگی کی رقم (روپے)',
    confirmPaymentBtn: 'ادائیگی محفوظ کریں',
    noVendorsFound: 'تلاش کے مطابق کوئی سپلائر نہیں ملا۔',
    vendorPurchasesTitle: 'سپلائر کی خریداری کا ریکارڈ',
    noVendorPurchases: 'اس سپلائر سے ابھی تک کوئی خریداری درج نہیں ہوئی۔',

    purchasesTitle: 'خریداری اور اسٹاک وصولی (Stock In)',
    purchasesSubtitle: 'سپلائر سے مال وصول کریں، اسٹاک اور لاگت قیمت خودکار اپڈیٹ کریں اور بقایا ادھار درج کریں',
    newPurchaseTitle: 'نئی خریداری / اسٹاک انٹری',
    selectVendorLabel: 'سپلائر منتخب کریں',
    chooseVendorOption: 'سپلائر چنیں...',
    invoiceNoLabel: 'سپلائر بل / انوائس نمبر',
    addProductToPurchaseLabel: 'خریداری میں پروڈکٹ شامل کریں',
    chooseProductOption: 'پروڈکٹ منتخب کریں...',
    addRowBtn: 'شامل کریں',
    purchaseCostCol: 'خرید قیمت',
    lineTotalCol: 'کل رقم',
    purchaseTotalLabel: 'کل خریداری بل',
    paidAmountLabel: 'ادا شدہ رقم (روپے)',
    payFullBtn: 'مکمل ادائیگی',
    remainingPayableLabel: 'سپلائر کے کھاتے میں باقی ادھار',
    purchaseNoteLabel: 'نوٹ / تفصیل (اختیاری)',
    purchaseNotePlaceholder: 'مثلاً ہفتہ وار ہول سیل ڈیلیوری...',
    receiveInventoryBtn: 'اسٹاک وصول کریں (Receive Inventory)',
    purchaseSuccessMsg: 'اسٹاک وصول ہو گیا! مصنوعات کا اسٹاک اور لاگت قیمت اپڈیٹ ہو گئی۔',
    purchaseHistoryTitle: 'حالیہ خریداری اور اسٹاک ان ریکارڈ',
    noPurchasesYet: 'ابھی تک کوئی خریداری ریکارڈ نہیں ہوئی۔',
    vendorCol: 'سپلائر',
    paidCol: 'ادا شدہ',
    balanceDueCol: 'باقی ادھار',
    noVendorsNotice: 'خریداری درج کرنے سے پہلے کم از کم ایک سپلائر شامل کریں۔',
    goToVendorsBtn: 'سپلائرز پر جائیں',

    selectSaleCustomerLabel: 'گاہک منتخب کریں (اختیاری)',
    walkInOption: 'عام گاہک (بغیر پروفائل)',
    posCustomerBalanceBadge: 'ادھار بیلنس:',
    customersTitle: 'گاہک مینجمنٹ اور خریداری ریکارڈ',
    customersSubtitle: 'گاہکوں کا ریکارڈ، ادھار بیلنس اور تمام گزشتہ بلز کی تفصیلات دیکھیں',
    addCrmCustomerBtn: 'نیا گاہک شامل کریں',
    editCrmCustomerTitle: 'گاہک کی معلومات میں ترمیم',
    addCrmCustomerTitle: 'نیا گاہک شامل کریں',
    customerAddressLabel: 'پتہ / علاقہ',
    customerUdhaarBalanceLabel: 'ادھار / کھاتہ بیلنس (روپے)',
    totalCrmCustomersLabel: 'کل گاہک',
    customersWithBalanceLabel: 'ادھار والے گاہک',
    totalCustomerPurchasesLabel: 'کل بلز مالیت',
    customerBillsCol: 'گزشتہ بلز',
    customerAddressCol: 'پتہ',
    filterAllCustomers: 'تمام گاہک',
    filterUdhaarCustomers: 'واجب الادا ادھار',
    viewProfileHistoryBtn: 'پروفائل اور ریکارڈ',
    customerProfileTitle: 'گاہک پروفائل اور خریداری کی تاریخ',
    customerHistoryTitle: 'گزشتہ بلز اور اشیاء کی تفصیل',
    customerTotalBillsLabel: 'مکمل بلز',
    noCustomerBills: 'اس گاہک کے نام ابھی تک کوئی سیل ریکارڈ نہیں ہوئی۔',
    recordCustomerPaymentBtn: 'رقم وصول کریں',
    payCustomerModalTitle: 'گاہک سے ادائیگی وصول کریں',

    staffTitle: 'اسٹاف اور رسائی کے اختیارات',
    staffSubtitle: 'ایڈمن، مینیجر اور کیشیئر کے لیے 4 ہندسوں کے PIN کوڈ اور رولز ترتیب دیں',
    addEmployeeBtn: 'نیا اسٹاف ممبر شامل کریں',
    editEmployeeTitle: 'اسٹاف ممبر میں ترمیم کریں',
    addEmployeeTitle: 'نیا اسٹاف ممبر شامل کریں',
    employeeNameLabel: 'اسٹاف کا پورا نام',
    employeePhoneLabel: 'فون نمبر',
    employeeRoleLabel: 'عہدہ / رول',
    employeePinLabel: '4 ہندسوں کا PIN کوڈ',
    employeePinHint: 'فوری اسٹاف تبدیلی اور لاک اسکرین کے لیے استعمال ہوتا ہے',
    employeePinError: 'براہ کرم 4 ہندسوں کا درست عددی PIN درج کریں۔',
    employeeActiveLabel: 'فعال اسٹاف اکاؤنٹ',
    activeStatusLabel: 'فعال',
    inactiveStatusLabel: 'غیر فعال',
    saveEmployeeBtn: 'اسٹاف محفوظ کریں',
    roleAdmin: 'ایڈمن (Admin)',
    roleManager: 'مینیجر (Manager)',
    roleCashier: 'کیشیئر (Cashier)',
    roleAdminDesc: 'مکمل رسائی: لاگت قیمت، منافع، رپورٹس، اسٹاف، اسٹور سیٹنگز اور حذف کرنے کی اجازت۔',
    roleManagerDesc: 'اسٹاک، خریداری، سپلائرز اور گاہکوں کا انتظام (اسٹاف، سیٹنگز اور حذف بند)۔',
    roleCashierDesc: 'صرف پی او ایس بلنگ، سیلز ریکارڈ اور گاہک۔ لاگت، منافع، رپورٹس اور حذف خفیہ رہیں گے۔',
    permissionsGuideTitle: 'عہدوں کے اختیارات کی تفصیل',
    switchStaffBtn: 'اسٹاف تبدیل / لاک',
    lockScreenBtn: 'رجسٹر لاک کریں',
    activeStaffLabel: 'موجودہ اسٹاف',
    lockScreenTitle: 'رجسٹر لاک ہے — اسٹاف PIN درج کریں',
    lockScreenSubtitle: 'بلنگ جاری رکھنے کے لیے اپنا 4 ہندسوں کا PIN کوڈ درج کریں یا فعال اسٹاف منتخب کریں۔',
    enterPinLabel: '4 ہندسوں کا PIN',
    unlockRegisterBtn: 'رجسٹر ان لاک کریں',
    invalidPinError: 'غلط PIN کوڈ یا غیر فعال اسٹاف اکاؤنٹ۔',
    quickSwitchStaffLabel: 'فعال اسٹاف ممبر منتخب کریں',
    lastAdminNotice: 'کم از کم ایک فعال ایڈمن اکاؤنٹ رہنا ضروری ہے۔',
    pinTakenError: 'یہ 4 ہندسوں کا PIN کوڈ کسی اور اسٹاف کے پاس موجود ہے۔',
    firstAdminSetupBadge: 'پہلی بار سیٹ اپ',
    firstAdminSetupTitle: 'اپنا پہلا اسٹور ایڈمن PIN بنائیں',
    firstAdminSetupSubtitle: 'اس اسٹور کے لیے ابھی تک کوئی ایڈمن PIN سیٹ نہیں کیا گیا۔ رجسٹر محفوظ بنانے کے لیے اپنا ایڈمن نام اور 4 ہندسوں کا PIN منتخب کریں۔',
    adminFullNameLabel: 'ایڈمن کا پورا نام',
    adminPhoneOptionalLabel: 'فون نمبر (اختیاری)',
    newPinLabel: 'نیا 4 ہندسوں کا PIN',
    confirmPinLabel: 'PIN کی تصدیق کریں',
    pinMismatchError: 'دونوں PIN کوڈ ایک جیسے نہیں ہیں۔',
    adminNameRequiredError: 'براہ کرم ایڈمن کا نام درج کریں۔',
    createAdminSaveBtn: 'ایڈمن PIN محفوظ کریں اور POS شروع کریں',
    firstAdminSecurityNote: 'محفوظ کرنے سے پہلے آپ کا PIN انکرپٹ کیا جاتا ہے۔ پہلی بار سیٹ اپ کے لیے پرانے PIN کی ضرورت نہیں۔',

    storeSettingsTitle: 'کاروبار اور اسٹور کی ترتیبات',
    storeSettingsSubtitle: 'اسٹور کا نام، فون، پتہ، ٹیکس/NTN نمبر اور رسید کا فٹر سیٹ کریں',
    storeNameInputLabel: 'اسٹور / کاروبار کا نام',
    storePhoneInputLabel: 'اسٹور کا فون نمبر',
    storeAddressInputLabel: 'اسٹور کا پتہ',
    storeTaxNumberLabel: 'ٹیکس / NTN / STRN نمبر',
    receiptFooterLabel: 'رسید کا اختتامی پیغام (Footer)',
    saveStoreSettingsBtn: 'اسٹور سیٹنگز محفوظ کریں',
    storeSettingsSavedMsg: 'اسٹور سیٹنگز محفوظ ہو گئیں! ہیڈر اور تھرمل رسیدیں اپڈیٹ ہو گئیں۔',
    receiptPreviewTitle: 'تھرمل رسید کا لائیو پیش نظارہ',
    paperSizeLabel: 'کاغذ کی چوڑائی',
    paper58mm: '58mm',
    paper80mm: '80mm',

    timeframeToday: 'آج',
    timeframeMonth: 'اس ماہ',
    timeframeYear: 'اس سال',
    timeframeCustom: 'مخصوص تاریخ',
    startDateLabel: 'شروع تاریخ',
    endDateLabel: 'اختتامی تاریخ',
    totalCogsLabel: 'کل لاگتِ مال (COGS)',
    netProfitLabel: 'خالص منافع (آمدنی - لاگت)',
    totalDiscountsLabel: 'کل دی گئی رعایت',
    totalTaxCollectedLabel: 'کل وصول شدہ ٹیکس',
    paymentBreakdownTitle: 'ادائیگی کے طریقوں کی تفصیل',
    paymentBreakdownSubtitle: 'نقد، جاز کیش، ایزی پیسہ، کارڈ اور ادھار کے لحاظ سے آمدنی',
    exportCsvBtn: 'CSV (Excel) ڈاؤن لوڈ',
    printReportBtn: 'رپورٹ پرنٹ کریں',
    qtySoldCol: 'فروخت تعداد',
    reportGeneratedLabel: 'رپورٹ کا دورانیہ',
    noOrdersInRange: 'منتخب کردہ تاریخوں میں کوئی سیل ریکارڈ نہیں ہے۔',

    invReportTitle: 'اسٹاک مالیت اور انوینٹری رپورٹ',
    invReportSubtitle: 'اسٹاک کی لاگت، متوقع فروخت مالیت، ممکنہ منافع، کم اسٹاک الرٹس اور ایڈجسٹمنٹ کا خلاصہ',
    totalExpectedRetailLabel: 'متوقع فروخت مالیت',
    potentialProfitLabel: 'ممکنہ منافع',
    lowStockSectionTitle: 'کم یا ختم اسٹاک والی اشیاء (5 یا کم یونٹس)',
    noLowStockItems: 'تمام اشیاء کا اسٹاک تسلی بخش ہے۔',
    stockValuationTitle: 'اسٹاک مالیت کی تفصیل',
    retailValueCol: 'فروخت مالیت',
    potentialProfitCol: 'ممکنہ منافع',
    adjustmentsSummaryTitle: 'اسٹاک ایڈجسٹمنٹ کا خلاصہ',

    onlineStatusLabel: 'آن لائن • کلاؤڈ سنک شدہ',
    offlineStatusLabel: 'آف لائن موڈ • مقامی محفوظ',
    pendingSyncLabel: 'زیرِ التواء',
    syncNowBtn: 'ابھی سنک کریں',
    syncingNowLabel: 'سنک ہو رہا ہے...',
    offlineSaleQueuedNotice: 'آف لائن سیل مقامی قطار میں محفوظ ہو گئی اور انٹرنیٹ آتے ہی سنک ہو گی۔',
    offlineSyncedToast: 'آف لائن سیلز اور اسٹاک اپڈیٹس کامیابی سے کلاؤڈ پر سنک ہو گئیں۔',

    daysLeftSuffix: 'دن باقی',
    trialExpiredBadge: 'لائسنس ختم',
    accountBlockedBadge: 'اکاؤنٹ بلاک',
    superAdminBadge: 'سپر ایڈمن',
    subLockTitle: 'سبسکرپشن ختم / اکاؤنٹ لاک',
    subLockDesc:
      'آپ کی سبسکرپشن ختم ہو چکی ہے یا اکاؤنٹ لاک ہے۔ لائسنس کی تجدید کے لیے حسیب احمد (Netra-Dev Solutions) سے واٹس ایپ پر رابطہ کریں۔',
    subLockWhatsappBtn: 'حسیب احمد سے واٹس ایپ پر رابطہ کریں',
    subLockRefreshBtn: 'لائسنس اسٹیٹس چیک کریں',
    subLockEmailLabel: 'اکاؤنٹ ای میل',
    subLockPlanLabel: 'موجودہ پلان',
    subLockExpiryLabel: 'آخری تاریخ',

    saasAdminTitle: 'SaaS سپر ایڈمن — لائسنس اور سبسکرپشن کنٹرول',
    saasAdminSubtitle:
      'تمام رجسٹرڈ دکانداروں کے لائسنس دیکھیں، مدت میں توسیع کریں یا اکاؤنٹ بلاک/ان بلاک کریں',
    totalTenantsLabel: 'کل رجسٹرڈ دکاندار',
    activeTenantsLabel: 'فعال لائسنس',
    expiredBlockedLabel: 'ختم شدہ / بلاک',
    searchTenantsPlaceholder: 'ای میل، اسٹور کا نام یا پلان تلاش کریں...',
    extend30DaysBtn: '+30 دن توسیع',
    extend1YearBtn: '+1 سال توسیع',
    blockUserBtn: 'بلاک کریں',
    unblockUserBtn: 'ان بلاک کریں',
    statusActiveLabel: 'فعال',
    statusExpiredLabel: 'ختم شدہ',
    statusBlockedLabel: 'بلاک شدہ',
    tenantEmailCol: 'دکاندار ای میل',
    tenantShopCol: 'اسٹور کا نام',
    tenantPlanCol: 'پلان',
    tenantExpiryCol: 'میعاد ختم',
    noTenantsFound: 'کوئی دکاندار اکاؤنٹ نہیں ملا۔',
    refreshListBtn: 'فہرست تازہ کریں',

    expensesTitle: 'دکان کے روزانہ اخراجات',
    expensesSubtitle:
      'کرایہ، بجلی، ملازمین کی تنخواہ اور روزانہ کے اخراجات درج کریں تاکہ اصل خالص منافع معلوم ہو سکے',
    addExpenseBtn: 'نیا خرچہ شامل کریں',
    editExpenseTitle: 'خرچہ میں ترمیم کریں',
    addExpenseTitle: 'نیا خرچہ درج کریں',
    expenseTitleLabel: 'خرچہ کی تفصیل / عنوان',
    expenseCategoryLabel: 'زمرہ',
    expenseAmountLabel: 'رقم (روپے)',
    expenseDateLabel: 'تاریخ',
    expenseNotesLabel: 'نوٹ (اختیاری)',
    saveExpenseBtn: 'خرچہ محفوظ کریں',
    todayExpensesLabel: 'آج کے اخراجات',
    monthExpensesLabel: 'اس ماہ کے اخراجات',
    yearExpensesLabel: 'اس سال کے اخراجات',
    totalExpensesLabel: 'کل اخراجات',
    noExpensesFound: 'موجودہ فلٹر کے مطابق کوئی خرچہ درج نہیں ہے۔',
    expCatRent: 'کرایہ',
    expCatElectricity: 'بجلی بل / فیول',
    expCatSalary: 'اسٹاف تنخواہ',
    expCatSupplies: 'سامان / شاپنگ بیگز',
    expCatMaintenance: 'مرمت و صفائی',
    expCatOther: 'دیگر اخراجات',
    netProfitAfterExpensesLabel: 'اخراجات کے بعد خالص منافع',

    customerWhatsappLabel: 'گاہک کا واٹس ایپ نمبر',
    reminderScheduleLabel: 'یاد دہانی کا شیڈول',
    scheduleNone: 'کوئی یاد دہانی نہیں',
    schedule3Days: '3 دن بعد',
    schedule1Week: '1 ہفتہ بعد',
    schedule2Weeks: '2 ہفتے بعد',
    schedule1Month: '1 مہینہ بعد',
    scheduleCustom: 'مخصوص تاریخ',
    dueDateLabel: 'واجب الادا تاریخ',
    dueRemindersTitle: 'واجب الادا یاد دہانیاں',
    dueTodayLabel: 'آج واجب الادا',
    overdueLabel: 'تاخیر شدہ',
    sendWhatsappBtn: 'واٹس ایپ بھیجیں',
    editReminderBtn: 'یاد دہانی شیڈول',
    noDueReminders: 'آج کوئی واجب الادا یا تاخیر شدہ ادھار یاد دہانی نہیں ہے۔',

    returnExchangeBtn: 'واپسی / تبدیلی',
    returnModalTitle: 'اشیاء کی واپسی / تبدیلی',
    returnModalSubtitle: 'بل میں سے واپس کی جانے والی اشیاء اور مقدار منتخب کریں، پھر رقم واپسی یا تبدیلی منتخب کریں۔',
    returnSelectItemsLabel: 'واپسی کے لیے اشیاء منتخب کریں',
    returnQtyCol: 'واپسی مقدار',
    purchasedQtyCol: 'فروخت',
    alreadyReturnedLabel: 'واپس شدہ',
    returnResolutionLabel: 'واپسی کا طریقہ منتخب کریں',
    returnRefundOptionTitle: 'نقد / والٹ ریفنڈ (پیسے واپس)',
    returnRefundOptionDesc: 'واپس کی گئی اشیاء خودکار طور پر اسٹاک میں شامل ہو جائیں گی اور واپسی کی رقم کل سیلز/آمدنی سے منہا ہو جائے گی۔',
    returnExchangeOptionTitle: 'تبدیلی / اسٹور کریڈٹ (چیز بدلی)',
    returnExchangeOptionDesc: 'واپس کی گئی اشیاء اسٹاک میں شامل ہو جائیں گی لیکن نقد آمدنی کم نہیں ہوگی تاکہ گاہک متبادل چیز لے سکے۔',
    returnReasonLabel: 'وجہ / نوٹ (اختیاری)',
    returnReasonPlaceholder: 'مثلاً پیکنگ خراب تھی، دوسری چیز تبدیل کی...',
    returnSummaryStockLabel: 'اسٹاک میں شامل یونٹس',
    returnSummaryRevenueLabel: 'سیلز / آمدنی میں کٹوتی',
    confirmRefundBtn: 'رقم واپسی کی تصدیق کریں',
    confirmExchangeBtn: 'تبدیلی کی تصدیق کریں',
    statusCompletedLabel: 'مکمل',
    statusPartiallyRefundedLabel: 'جزوی ریفنڈ',
    statusRefundedLabel: 'ریفنڈ شدہ',
    statusExchangedLabel: 'تبدیل شدہ',
    refundedBadgePrefix: 'واپسی',
    fullyReturnedLabel: 'مکمل واپسی',
    posReturnToggleBtn: 'واپسی',
    posReturnBadge: 'واپسی',
    netRefundDueLabel: 'واپس کی جانے والی رقم',
    newKhataCustomerInlineBtn: '+ نیا کھاتہ گاہک',
    cancelNewKhataBtn: 'موجودہ منتخب کریں',
    saveSelectCustomerBtn: 'محفوظ اور منتخب کریں',
    quickKhataNamePlaceholder: 'گاہک کا مکمل نام *',
    quickKhataPhonePlaceholder: 'واٹس ایپ نمبر (مثلاً 0300-1234567)',
    jazzcashSectionTitle: 'جاز کیش اکاؤنٹ کی تفصیلات',
    easypaisaSectionTitle: 'ایزی پیسہ اکاؤنٹ کی تفصیلات',
    walletTitleLabel: 'اکاؤنٹ ٹائٹل / نام',
    walletNumberLabel: 'اکاؤنٹ نمبر',
    transferToAccountLabel: 'رقم بھیجنے کا اکاؤنٹ',
    walletNotConfiguredMsg: 'ابھی اکاؤنٹ نمبر محفوظ نہیں ہے — اسٹور سیٹنگز میں شامل کریں۔',
    transactionIdLabel: 'ٹرانزیکشن آئی ڈی / TID (اختیاری)',
    transactionIdPlaceholder: 'مثلاً 8492019482',
    tidReceiptLabel: 'TID',
    timeframeWeek: 'اس ہفتے',
    salesOverviewTitle: 'سیلز کا جائزہ اور رجحان',
    salesOverviewSubtitle: 'فروخت کی آمدنی، مکمل آرڈرز اور منافع کا گراف',
    granularityDaily: 'روزانہ',
    granularityWeekly: 'ہفتہ وار',
    granularityMonthly: 'ماہانہ',
    granularityYearly: 'سالانہ',
    vsYesterdayLabel: 'کل کے مقابلے میں',
    vsLastWeekLabel: 'گزشتہ ہفتے سے',
    vsLastMonthLabel: 'گزشتہ ماہ سے',
    vsLastYearLabel: 'گزشتہ سال سے',
    vsPrevPeriodLabel: 'پچھلے دورانیے سے',
    newPeriodBadge: 'نیا',
    salesGrowthLabel: 'سیلز میں اضافہ',
    kpiTooltipRevenue: 'رعایت، ٹیکس اور واپسی کی کٹوتی کے بعد مکمل بلز کی خالص آمدنی۔',
    kpiTooltipCogs: 'فروخت شدہ اشیاء کی اصل خریداری لاگت (واپسی کی ایڈجسٹمنٹ کے ساتھ)۔',
    kpiTooltipGrossProfit: 'کل آمدنی منفی فروخت شدہ اشیاء کی لاگت۔',
    kpiTooltipExpenses: 'اس دورانیے میں درج شدہ دکان کے روزمرہ اخراجات۔',
    kpiTooltipNetProfit: 'مجموعی منافع منفی کل اخراجات۔',
    kpiTooltipTax: 'مکمل رسیدوں پر جمع شدہ کل سیلز ٹیکس۔',
    inventoryAlertsTitle: 'اسٹاک الرٹس اور رفتار',
    inventoryAlertsSubtitle: 'کم یا ختم شدہ اسٹاک، تیز و سست اشیاء اور آرڈر کی تجاویز',
    alertTabLowOut: 'کم اور ختم اسٹاک',
    alertTabFastMoving: 'تیز فروخت',
    alertTabSlowMoving: 'سست فروخت',
    manageInventoryBtn: 'اسٹاک مینجمنٹ کھولیں',
    suggestedReorderCol: 'تجویز کردہ آرڈر',
    sold30dCol: '30 دن فروخت',
    daysCoverCol: 'اسٹاک دن',
    outOfStockBadge: 'اسٹاک ختم',
    lowStockBadge: 'کم اسٹاک',
    noInventoryAlertsMsg: 'تمام اشیاء کا اسٹاک مناسب مقدار میں موجود ہے۔',
    rankCol: '#',
    topProductsSubtitle: 'آمدنی، تعداد اور مجموعی منافع کے لحاظ سے درجہ بندی',
    noPaymentDataMsg: 'اس دورانیے میں کوئی مکمل سیل موجود نہیں۔',
    retryBtn: 'دوبارہ کوشش کریں',
    emptyDashboardTitle: 'ابھی کوئی سیل ریکارڈ نہیں ہوئی',
    emptyDashboardDesc: 'لائیو چارٹس اور تجزیات دیکھنے کے لیے بلنگ کاؤنٹر پر پہلی سیل مکمل کریں۔',
    sellingUnitLabel: 'فروخت کی اکائی (یونٹ)',
    selectUnitPlaceholder: 'اکائی منتخب کریں (کلو، لیٹر، پیس...)',
    sellingUnitRequiredError: 'براہ کرم اس پروڈکٹ کی فروخت کی اکائی منتخب کریں۔',
    customQtyHint: 'درست یا اعشاری مقدار درج کریں (مثلاً 0.25، 1.5، 3.75)',
    pinEncryptedBadge: 'خفیہ پن محفوظ (ہیشڈ)',
    pinOptionalEditHint: 'موجودہ پن برقرار رکھنے کے لیے خالی چھوڑ دیں',
    switchRequiresPinNote: 'اسٹاف تبدیل کرنے کے لیے 4 ہندسوں کا پن درج کرنا لازمی ہے۔',
    rbacUnauthorizedError: 'آپ کے موجودہ اسٹاف رول کو اس عمل کی اجازت نہیں ہے۔',
    barcodeScanNotFound: 'اس بارکوڈ کی کوئی پروڈکٹ نہیں ملی',
    barcodeScanOutOfStock: 'اسکین شدہ پروڈکٹ کا اسٹاک ختم ہو چکا ہے',
    barcodeScanAdded: 'اسکین شدہ',
    inCartLabel: 'کارٹ میں',
    dismissLabel: 'بند کریں',

    navShifts: 'کیش ڈراور و شفٹس',
    navBranches: 'برانچز و ٹرانسفر',
    navAuditLogs: 'آڈٹ و بیک اپ',
    paymentBankTransfer: 'بینک ٹرانسفر',

    scannerModeHid: 'HID اسکینر',
    scannerModeCameraBarcode: 'کیمرہ بارکوڈ',
    scannerModeQr: 'QR اسکینر',
    startCameraBtn: 'کیمرہ شروع کریں',
    stopCameraBtn: 'کیمرہ بند کریں',
    switchCameraBtn: 'کیمرہ تبدیل کریں',
    cameraPermissionDenied: 'کیمرہ کی اجازت نہیں ملی۔ براؤزر سیٹنگز میں اجازت دے کر دوبارہ کوشش کریں۔',
    cameraUnavailableMsg: 'کوئی کیمرہ دستیاب نہیں یا کسی اور ایپ میں استعمال ہو رہا ہے۔',
    cameraScanningHint: 'بارکوڈ یا QR کوڈ کو فریم کے اندر سیدھا رکھیں۔',
    qrLabelTitle: 'بارکوڈ اور QR لیبل',
    labelFormatBarcode: 'صرف بارکوڈ',
    labelFormatQr: 'صرف QR کوڈ',
    labelFormatBoth: 'بارکوڈ + QR',

    shiftsTitle: 'کیش ڈراور اور کیشیئر شفٹس',
    shiftsSubtitle: 'ابتدائی کیش کے ساتھ شفٹ کھولیں، کیش ان/آؤٹ درج کریں اور شفٹ کلوزنگ کا حساب کریں',
    openShiftBtn: 'شفٹ کھولیں',
    closeShiftBtn: 'شفٹ بند کریں',
    openingCashLabel: 'ابتدائی کیش (روپے)',
    expectedCashLabel: 'متوقع ڈراور کیش',
    actualCashCountLabel: 'گن کر موجودہ کیش (روپے)',
    cashShortageOverLabel: 'کمی / بیشی',
    cashInBtn: 'کیش جمع (+)',
    cashOutBtn: 'کیش نکلوائی (-)',
    shiftOpenStatus: 'شفٹ کھلی ہے',
    shiftClosedStatus: 'بند',
    shiftCloseAdminRequired: 'شفٹ بند کرنے کے لیے ایڈمن یا مینیجر کا اختیار ضروری ہے۔',
    shiftHistoryTitle: 'شفٹ ہسٹری اور کیشیئر کارکردگی',
    cashDrawerMovementsTitle: 'کیش ڈراور موومنٹ ریکارڈ',
    noActiveShiftMsg: 'کوئی فعال شفٹ کھلی نہیں ہے۔ کیش ڈراور ٹریک کرنے کے لیے شفٹ کھولیں۔',
    printShiftSlipBtn: 'شفٹ سلپ پرنٹ کریں',

    brandLabel: 'برانڈ',
    variantLabel: 'قسم / سائز',
    wholesalePriceLabel: 'ہول سیل قیمت (روپے)',
    minStockLabel: 'کم از کم اسٹاک الرٹ',
    reorderLevelLabel: 'ری آرڈر لیول',
    batchNumberLabel: 'بیچ نمبر',
    expiryDateLabel: 'ایکسپائری تاریخ',
    expiredBadge: 'میعاد ختم',
    expiringSoonBadge: 'جلد ختم',
    bulkEditBtn: 'بلک ایڈٹ',
    importCsvBtn: 'CSV امپورٹ',
    poStatusLabel: 'آرڈر اسٹیٹس',
    supplierReturnBtn: 'خریداری واپسی',
    supplierPaymentBtn: 'سپلائر ادائیگی',
    supplierStatementBtn: 'اسٹیٹمنٹ',

    holdBillBtn: 'بل ہولڈ کریں',
    heldBillsBtn: 'ہولڈ بلز',
    resumeBillBtn: 'جاری رکھیں',
    discardBillBtn: 'ختم کریں',
    splitPaymentBtn: 'مخلوط ادائیگی',
    addPaymentSplitBtn: 'ادائیگی حصہ شامل کریں',
    remainingToPayLabel: 'باقی رقم',
    discountPercentMode: '% فیصد',
    discountFixedMode: 'روپے مقررہ',
    cancelOrderBtn: 'آرڈر منسوخ کریں',
    cancelOrderReasonLabel: 'منسوخی کی وجہ',
    statusCancelledLabel: 'منسوخ شدہ',
    reprintBadge: 'دوبارہ پرنٹ',
    openCustomerDisplayBtn: 'کسٹمر ڈسپلے',
    customerDisplayTitle: 'کسٹمر اسکرین',

    creditLimitLabel: 'ادھار کی حد (روپے)',
    creditLimitExceededMsg: 'یہ بل گاہک کی مقرر کردہ ادھار کی حد سے تجاوز کر رہا ہے۔',
    customerDiscountLabel: 'گاہک رعایت %',
    whatsappOptInLabel: 'گاہک نے واٹس ایپ رسید اور یاد دہانی کی اجازت دی ہے',
    printStatementBtn: 'اسٹیٹمنٹ پرنٹ کریں',
    sendWhatsappReceiptBtn: 'واٹس ایپ پر بھیجیں',
    whatsappManualFallbackNotice: 'سرور پر واٹس ایپ Cloud API کی تفصیلات موجود نہیں؛ دستی واٹس ایپ شیئر لنک کھولا جا رہا ہے۔',
    whatsappLogsTitle: 'واٹس ایپ پیغامات کا ریکارڈ',
    timeframeYesterday: 'کل',

    recurringExpenseLabel: 'باقاعدہ خرچہ (Recurring)',
    deductFromDrawerLabel: 'فعال کیش ڈراور سے منہا کریں',
    approvalStatusLabel: 'منظوری',
    branchesTitle: 'ملٹی برانچ اور اسٹاک ٹرانسفر',
    branchesSubtitle: 'مختلف شاخوں، برانچ اسٹاک اور اسٹاک ٹرانسفر کی منظوریوں کا انتظام کریں',
    addBranchBtn: 'نئی برانچ شامل کریں',
    stockTransferBtn: 'نیا اسٹاک ٹرانسفر',
    auditLogsTitle: 'آڈٹ لاگز، سنک اور بیک اپ',
    auditLogsSubtitle: 'قیمت و اسٹاک تبدیلیوں، اسٹاف سرگرمی، آف لائن سنک اور مکمل بیک اپ کا ریکارڈ',
    downloadBackupBtn: 'مکمل JSON بیک اپ ڈاؤن لوڈ',
    restoreBackupBtn: 'بیک اپ سے بحال کریں',
    syncHistoryTitle: 'آف لائن سنک ہسٹری',
    employeeActivityTitle: 'اسٹاف لاگ ان اور تبدیلی ریکارڈ',
    branchLimitReachedMsg: 'آپ کے موجودہ پلان میں برانچز کی حد مکمل ہو چکی ہے۔',
    employeeLimitReachedMsg: 'آپ کے موجودہ پلان میں اسٹاف ممبران کی حد مکمل ہو چکی ہے۔',
  },
};

export function formatCurrency(amount: number, _lang?: Language): string {
  const rounded = Math.round(amount);
  if (rounded < 0) {
    return `-Rs. ${Math.abs(rounded).toLocaleString('en-PK')}`;
  }
  return `Rs. ${rounded.toLocaleString('en-PK')}`;
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
    case 'jazzcash':
      return t.paymentJazzCash;
    case 'easypaisa':
      return t.paymentEasyPaisa;
    case 'card':
      return t.paymentCard;
    case 'bank_transfer':
      return t.paymentBankTransfer;
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
