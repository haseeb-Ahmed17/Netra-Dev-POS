import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Barcode,
  Camera,
  CheckCircle2,
  Minus,
  Monitor,
  PauseCircle,
  PlayCircle,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  ShoppingBag,
  Smartphone,
  Split,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  formatCurrency,
  getCategoryLabel,
  getPaymentLabel,
  type TranslationStrings,
} from '../i18n';
import {
  createHidScanState,
  findProductByCode,
  processHidKeyEvent,
  resetHidScanState,
  type HidScanState,
} from '../lib/barcodeScanner';
import { broadcastCustomerDisplay } from '../lib/hardwareBridge';
import { generateUuid } from '../lib/idUtils';
import {
  calculateUnitAwarePrice,
  formatQuantity,
  formatQuantityWithUnit,
  getCompatibleUnits,
  getOptionalUnitShortcuts,
  getUnitLabel,
  normalizeSellingUnit,
  roundCurrency,
  roundQuantity,
} from '../lib/unitUtils';
import type {
  CartItem,
  CategoryId,
  Customer,
  HeldBill,
  Language,
  OrderLineItem,
  OrderRecord,
  PaymentMethod,
  PaymentSplit,
  Product,
  ReminderSchedule,
  ScannerMode,
  SellingUnit,
  StoreSettings,
  UdhaarCustomer,
  UdhaarEntry,
} from '../types';
import { CameraScannerPanel } from './CameraScannerPanel';
import { ProductImage } from './ProductImage';
import { calculateDueDateFromSchedule } from './UdhaarView';

export interface InlineUdhaarCustomerPayload {
  name: string;
  phone: string;
  reminderSchedule: ReminderSchedule;
  dueDate?: string;
}

export interface PosCheckoutPayload {
  customerId?: string;
  customerName: string;
  udhaarCustomerId?: string;
  discountPercent: number;
  discountMode?: 'percent' | 'fixed';
  fixedDiscountAmount?: number;
  overrideTaxRate?: number;
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  amountTendered: number;
  transactionId?: string;
  clientTxRef?: string;
  inlineNewUdhaarCustomer?: InlineUdhaarCustomerPayload;
}

interface PosBillingViewProps {
  products: Product[];
  cart: CartItem[];
  customers: Customer[];
  udhaarCustomers: UdhaarCustomer[];
  udhaarEntries: UdhaarEntry[];
  storeSettings: StoreSettings;
  heldBills?: HeldBill[];
  activeBranchName?: string;
  canViewDashboard?: boolean;
  onRefreshUdhaarCustomers?: () => void;
  onCreateInlineKhataCustomer?: (payload: InlineUdhaarCustomerPayload) => {
    crmCustomer: Customer;
    khataCustomer: UdhaarCustomer;
  };
  onAddToCart: (productId: string) => void;
  onUpdateQuantity: (productId: string, delta: number, isReturn?: boolean) => void;
  onSetQuantity: (
    productId: string,
    quantity: number,
    isReturn?: boolean,
    enteredUnit?: SellingUnit
  ) => void;
  onSetCartItemDiscount?: (
    productId: string,
    isReturn: boolean,
    discountPercent: number
  ) => void;
  onToggleReturn: (productId: string, currentIsReturn: boolean) => void;
  onRemoveFromCart: (productId: string, isReturn?: boolean) => void;
  onClearCart: () => void;
  onHoldCurrentBill?: (payload: {
    customerId?: string;
    customerName: string;
    discountPercent: number;
    discountMode: 'percent' | 'fixed';
    fixedDiscountAmount: number;
    label?: string;
  }) => void;
  onResumeHeldBill?: (bill: HeldBill) => void;
  onDiscardHeldBill?: (billId: string) => void;
  onOpenCustomerDisplay?: () => void;
  onCompleteSale: (payload: PosCheckoutPayload) => OrderRecord | null;
  onGoToDashboard: () => void;
  lastCompletedOrder: OrderRecord | null;
  scannerDisabled?: boolean;
  lang: Language;
  t: TranslationStrings;
}

const CATEGORIES: CategoryId[] = ['all', 'beverages', 'bakery', 'pantry'];
const DISCOUNT_OPTIONS = [0, 5, 10, 15];

export function PosBillingView({
  products,
  cart,
  customers,
  udhaarCustomers,
  udhaarEntries,
  storeSettings,
  heldBills = [],
  activeBranchName,
  canViewDashboard = true,
  onRefreshUdhaarCustomers,
  onCreateInlineKhataCustomer,
  onAddToCart,
  onUpdateQuantity,
  onSetQuantity,
  onSetCartItemDiscount,
  onToggleReturn,
  onRemoveFromCart,
  onClearCart,
  onHoldCurrentBill,
  onResumeHeldBill,
  onDiscardHeldBill,
  onOpenCustomerDisplay,
  onCompleteSale,
  onGoToDashboard,
  lastCompletedOrder,
  scannerDisabled = false,
  lang,
  t,
}: PosBillingViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');
  const [scannerMode, setScannerMode] = useState<ScannerMode>('hid');

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [selectedUdhaarKey, setSelectedUdhaarKey] = useState<string>('');
  const [showQuickKhataForm, setShowQuickKhataForm] = useState(false);
  const [quickKhataName, setQuickKhataName] = useState('');
  const [quickKhataPhone, setQuickKhataPhone] = useState('');
  const [quickKhataSchedule, setQuickKhataSchedule] =
    useState<ReminderSchedule>('1_week');

  const [discountMode, setDiscountMode] = useState<'percent' | 'fixed'>('percent');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [fixedDiscountInput, setFixedDiscountInput] = useState<string>('0');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([
    { method: 'cash', amount: 0 },
  ]);
  const [cashTenderedInput, setCashTenderedInput] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');

  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showConfirmCheckout, setShowConfirmCheckout] = useState(false);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const pendingTxRef = useRef<string>(generateUuid());

  const [showSaleBanner, setShowSaleBanner] = useState(false);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const scanStateRef = useRef<HidScanState>(createHidScanState());
  const staleBufferTimerRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);

  const enabledMethods: PaymentMethod[] = useMemo(() => {
    const raw = storeSettings.enabledPaymentMethods;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    return ['cash', 'jazzcash', 'easypaisa', 'card', 'bank_transfer', 'udhaar'];
  }, [storeSettings.enabledPaymentMethods]);

  useEffect(() => {
    if (paymentMethod === 'udhaar' || paymentSplits.some((sp) => sp.method === 'udhaar')) {
      onRefreshUdhaarCustomers?.();
    }
  }, [paymentMethod, paymentSplits, onRefreshUdhaarCustomers]);

  const showScanFeedback = useCallback(
    (type: 'success' | 'error', message: string) => {
      setScanFeedback({ type, message });
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
      feedbackTimerRef.current = window.setTimeout(() => {
        setScanFeedback(null);
        feedbackTimerRef.current = null;
      }, type === 'error' ? 6000 : 3500);
    },
    []
  );

  const productMap = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of products) {
      map.set(p.id, p);
    }
    return map;
  }, [products]);

  const cartQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) {
      if (!item.isReturn) {
        map.set(item.productId, (map.get(item.productId) ?? 0) + item.quantity);
      }
    }
    return map;
  }, [cart]);

  const handleBarcodeScan = useCallback(
    (rawCode: string) => {
      const matched = findProductByCode(products, rawCode);
      if (!matched) {
        showScanFeedback('error', `${t.barcodeScanNotFound}: "${rawCode}"`);
        return;
      }

      const currentCartQty = roundQuantity(cartQtyMap.get(matched.id) ?? 0);
      const remaining = roundQuantity(matched.stock - currentCartQty);
      const prodName = lang === 'ur' ? matched.nameUr : matched.nameEn;

      if (remaining <= 0) {
        showScanFeedback('error', `${t.barcodeScanOutOfStock}: ${prodName}`);
        return;
      }

      const increment = remaining < 1 ? remaining : 1;
      const nextQty = roundQuantity(currentCartQty + increment);
      const draftKey = `${matched.id}-sale`;

      setShowSaleBanner(false);
      setQtyDrafts((prev) => {
        if (!(draftKey in prev)) return prev;
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });
      onAddToCart(matched.id);
      showScanFeedback(
        'success',
        `${t.barcodeScanAdded}: ${prodName} (${formatQuantityWithUnit(
          nextQty,
          matched.sellingUnit,
          lang
        )} ${t.inCartLabel})`
      );
    },
    [products, cartQtyMap, lang, onAddToCart, showScanFeedback, t]
  );

  const handleBarcodeScanRef = useRef(handleBarcodeScan);
  useEffect(() => {
    handleBarcodeScanRef.current = handleBarcodeScan;
  }, [handleBarcodeScan]);

  useEffect(() => {
    if (scannerDisabled || scannerMode !== 'hid') {
      resetHidScanState(scanStateRef.current);
      if (staleBufferTimerRef.current !== null) {
        window.clearTimeout(staleBufferTimerRef.current);
        staleBufferTimerRef.current = null;
      }
      return;
    }

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      const result = processHidKeyEvent(
        scanStateRef.current,
        {
          key: e.key,
          keyCode: e.keyCode,
          ctrlKey: e.ctrlKey,
          metaKey: e.metaKey,
          altKey: e.altKey,
          isComposing: e.isComposing,
          timeStamp: e.timeStamp,
          target: e.target as unknown as Parameters<
            typeof processHidKeyEvent
          >[1]['target'],
        },
        {
          disabled: scannerDisabled,
          now: performance.now(),
        }
      );

      if (staleBufferTimerRef.current !== null) {
        window.clearTimeout(staleBufferTimerRef.current);
        staleBufferTimerRef.current = null;
      }

      if (scanStateRef.current.chars.length > 0) {
        staleBufferTimerRef.current = window.setTimeout(() => {
          resetHidScanState(scanStateRef.current);
          staleBufferTimerRef.current = null;
        }, 200);
      }

      if (result.preventDefault) {
        e.preventDefault();
      }
      if (result.clearSearchInput) {
        setSearchQuery('');
      }
      if (result.scannedCode) {
        handleBarcodeScanRef.current(result.scannedCode);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
      if (staleBufferTimerRef.current !== null) {
        window.clearTimeout(staleBufferTimerRef.current);
        staleBufferTimerRef.current = null;
      }
    };
  }, [scannerDisabled, scannerMode]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current !== null) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const customerBalanceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of udhaarCustomers) {
      map.set(c.id, 0);
    }
    for (const e of udhaarEntries) {
      const prev = map.get(e.customerId) ?? 0;
      map.set(e.customerId, prev + (e.type === 'credit' ? e.amount : -e.amount));
    }
    return map;
  }, [udhaarCustomers, udhaarEntries]);

  const unifiedUdhaarOptions = useMemo(() => {
    const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
    const matchedCrmIds = new Set<string>();
    const options: {
      value: string;
      name: string;
      phone: string;
      balance: number;
      creditLimit?: number;
      udhaarCustomerId?: string;
      crmCustomerId?: string;
    }[] = [];

    for (const kh of udhaarCustomers) {
      const khPhone = normalizePhone(kh.phone);
      const khNameLower = kh.name.trim().toLowerCase();
      const matchedCrm = customers.find((c) => {
        if (c.id === kh.id) return true;
        const cPhone = normalizePhone(c.phone);
        if (khPhone && cPhone && khPhone === cPhone) return true;
        return c.name.trim().toLowerCase() === khNameLower;
      });
      if (matchedCrm) {
        matchedCrmIds.add(matchedCrm.id);
      }
      const khBal = Math.max(0, customerBalanceMap.get(kh.id) ?? 0);
      const crmBal = Math.max(0, matchedCrm?.balance ?? 0);
      options.push({
        value: `khata:${kh.id}`,
        name: kh.name,
        phone: kh.phone || matchedCrm?.phone || '',
        balance: khBal > 0 ? khBal : crmBal,
        creditLimit: matchedCrm?.creditLimit ?? kh.creditLimit,
        udhaarCustomerId: kh.id,
        crmCustomerId: matchedCrm?.id,
      });
    }

    for (const c of customers) {
      if (matchedCrmIds.has(c.id)) continue;
      options.push({
        value: `crm:${c.id}`,
        name: c.name,
        phone: c.phone,
        balance: Math.max(0, c.balance),
        creditLimit: c.creditLimit,
        crmCustomerId: c.id,
      });
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [udhaarCustomers, customers, customerBalanceMap]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        p.nameEn.toLowerCase().includes(q) ||
        p.nameUr.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, selectedCategory]);

  const lineItems: (OrderLineItem & {
    sellingUnit: NonNullable<OrderLineItem['sellingUnit']>;
    enteredUnit: SellingUnit;
    itemDiscountPercent: number;
    itemDiscountAmount: number;
    isReturn: boolean;
    availableStock: number;
  })[] = useMemo(() => {
    return cart
      .map((item) => {
        const prod = productMap.get(item.productId);
        if (!prod) return null;
        const isRet = Boolean(item.isReturn);
        const baseUnit = normalizeSellingUnit(prod.sellingUnit);
        const enteredUnit = normalizeSellingUnit(item.enteredUnit || baseUnit);
        const qtyBase = roundQuantity(item.quantity);
        const itemDiscPct = Math.max(0, Math.min(100, item.itemDiscountPercent || 0));
        const grossTotal = roundCurrency(prod.price * qtyBase);
        const itemDiscAmt = roundCurrency(grossTotal * (itemDiscPct / 100));
        const netTotal = roundCurrency(grossTotal - itemDiscAmt);
        const effectiveTaxRate =
          (prod.taxRate ?? 0) > 0 ? prod.taxRate : storeSettings.defaultTaxRate ?? 0;

        return {
          productId: prod.id,
          sku: prod.sku,
          nameEn: prod.nameEn,
          nameUr: prod.nameUr,
          category: prod.category,
          sellingUnit: baseUnit,
          enteredUnit,
          itemDiscountPercent: itemDiscPct,
          itemDiscountAmount: itemDiscAmt,
          unitPrice: prod.price,
          unitCost: prod.cost,
          taxRate: effectiveTaxRate,
          quantity: qtyBase,
          lineTotal: isRet ? -netTotal : netTotal,
          isReturn: isRet,
          availableStock: prod.stock,
        };
      })
      .filter(
        (
          x
        ): x is OrderLineItem & {
          sellingUnit: NonNullable<OrderLineItem['sellingUnit']>;
          enteredUnit: SellingUnit;
          itemDiscountPercent: number;
          itemDiscountAmount: number;
          isReturn: boolean;
          availableStock: number;
        } => x !== null
      );
  }, [cart, productMap, storeSettings.defaultTaxRate]);

  const totalUnitsInCart = useMemo(
    () => roundQuantity(lineItems.reduce((sum, item) => sum + item.quantity, 0)),
    [lineItems]
  );

  const subtotal = useMemo(
    () => roundCurrency(lineItems.reduce((sum, item) => sum + item.lineTotal, 0)),
    [lineItems]
  );

  const discountAmount = useMemo(() => {
    if (subtotal <= 0) return 0;
    if (discountMode === 'fixed') {
      const raw = Math.max(0, Number(fixedDiscountInput) || 0);
      return Math.min(subtotal, Math.round(raw));
    }
    return Math.round(subtotal * (discountPercent / 100));
  }, [subtotal, discountMode, discountPercent, fixedDiscountInput]);

  const effectiveDiscountPercent =
    subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

  const taxAmount = useMemo(() => {
    const discountFactor = subtotal > 0 ? 1 - effectiveDiscountPercent / 100 : 1;
    return Math.round(
      lineItems.reduce((sum, item) => {
        const discountedLine = item.lineTotal * discountFactor;
        return sum + discountedLine * ((item.taxRate ?? 0) / 100);
      }, 0)
    );
  }, [lineItems, effectiveDiscountPercent, subtotal]);

  const grandTotal = roundCurrency(subtotal - discountAmount + taxAmount);

  // Sync live cart to Customer Facing Display whenever cart changes
  useEffect(() => {
    if (!storeSettings.showCustomerDisplay) return;
    broadcastCustomerDisplay({
      storeName: storeSettings.storeName || t.brandName,
      lang,
      items: lineItems.map((li) => ({
        name: lang === 'ur' ? li.nameUr : li.nameEn,
        qtyLabel: formatQuantityWithUnit(li.quantity, li.sellingUnit, lang),
        lineTotal: li.lineTotal,
      })),
      subtotal,
      discountAmount,
      taxAmount,
      grandTotal,
      status: lineItems.length > 0 ? 'billing' : lastCompletedOrder ? 'completed' : 'idle',
      lastReceiptNumber: lastCompletedOrder?.receiptNumber,
      updatedAt: new Date().toISOString(),
    });
  }, [
    storeSettings.showCustomerDisplay,
    storeSettings.storeName,
    t.brandName,
    lang,
    lineItems,
    subtotal,
    discountAmount,
    taxAmount,
    grandTotal,
    lastCompletedOrder,
  ]);

  const splitTotal = useMemo(
    () => roundCurrency(paymentSplits.reduce((s, sp) => s + Math.max(0, sp.amount || 0), 0)),
    [paymentSplits]
  );
  const splitUsesUdhaar = paymentSplits.some((sp) => sp.method === 'udhaar' && sp.amount > 0);
  const splitRemaining = roundCurrency(grandTotal - splitTotal);

  const parsedTendered = isSplitMode
    ? splitTotal
    : paymentMethod === 'cash'
    ? cashTenderedInput.trim() === ''
      ? grandTotal
      : Math.max(0, Number(cashTenderedInput) || 0)
    : paymentMethod === 'udhaar'
    ? 0
    : grandTotal;

  const isCashInsufficient =
    !isSplitMode &&
    paymentMethod === 'cash' &&
    grandTotal > 0 &&
    cashTenderedInput.trim() !== '' &&
    parsedTendered < grandTotal;

  const isSplitInvalid =
    isSplitMode && grandTotal > 0 && Math.abs(splitTotal - grandTotal) > 1;

  const selectedUdhaarOption = useMemo(
    () =>
      unifiedUdhaarOptions.find((opt) => opt.value === selectedUdhaarKey) ?? null,
    [unifiedUdhaarOptions, selectedUdhaarKey]
  );

  const selectedCrmCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId]
  );

  const hasQuickKhataDraft =
    showQuickKhataForm && quickKhataName.trim().length > 0;

  const needsUdhaarCustomer =
    (!isSplitMode && paymentMethod === 'udhaar') || (isSplitMode && splitUsesUdhaar);

  const isUdhaarInvalid =
    needsUdhaarCustomer &&
    !selectedUdhaarOption &&
    !selectedCustomerId &&
    !hasQuickKhataDraft;

  const udhaarChargeAmount = isSplitMode
    ? paymentSplits
        .filter((sp) => sp.method === 'udhaar')
        .reduce((s, sp) => s + sp.amount, 0)
    : paymentMethod === 'udhaar'
    ? grandTotal
    : 0;

  const activeCreditLimit =
    selectedCrmCustomer?.creditLimit ?? selectedUdhaarOption?.creditLimit ?? 0;
  const currentCustomerBal =
    selectedCrmCustomer?.balance ?? selectedUdhaarOption?.balance ?? 0;
  const isCreditLimitExceeded =
    needsUdhaarCustomer &&
    activeCreditLimit > 0 &&
    currentCustomerBal + udhaarChargeAmount > activeCreditLimit;

  const changeDue =
    !isSplitMode && paymentMethod === 'cash'
      ? Math.max(0, parsedTendered - grandTotal)
      : 0;

  const handleSelectCustomer = (nextCustomerId: string) => {
    setSelectedCustomerId(nextCustomerId);
    const cust = customers.find((c) => c.id === nextCustomerId);
    if (cust && typeof cust.discountPercent === 'number' && cust.discountPercent > 0) {
      setDiscountMode('percent');
      setDiscountPercent(cust.discountPercent);
    }
  };

  const handleSaveAndSelectQuickKhata = () => {
    const trimmedName = quickKhataName.trim();
    if (!trimmedName || !onCreateInlineKhataCustomer) return;
    const dueDate =
      quickKhataSchedule === 'none'
        ? undefined
        : calculateDueDateFromSchedule(quickKhataSchedule) || undefined;
    const { crmCustomer, khataCustomer } = onCreateInlineKhataCustomer({
      name: trimmedName,
      phone: quickKhataPhone.trim(),
      reminderSchedule: quickKhataSchedule,
      dueDate,
    });
    setSelectedUdhaarKey(`khata:${khataCustomer.id}`);
    setSelectedCustomerId(crmCustomer.id);
    setShowQuickKhataForm(false);
    setQuickKhataName('');
    setQuickKhataPhone('');
    setQuickKhataSchedule('1_week');
  };

  const executeCheckout = () => {
    if (
      isSubmittingSale ||
      lineItems.length === 0 ||
      isCashInsufficient ||
      isSplitInvalid ||
      isUdhaarInvalid ||
      isCreditLimitExceeded
    ) {
      return;
    }

    setIsSubmittingSale(true);
    try {
      const inlineNewUdhaarCustomer: InlineUdhaarCustomerPayload | undefined =
        needsUdhaarCustomer && hasQuickKhataDraft
          ? {
              name: quickKhataName.trim(),
              phone: quickKhataPhone.trim(),
              reminderSchedule: quickKhataSchedule,
              dueDate:
                quickKhataSchedule === 'none'
                  ? undefined
                  : calculateDueDateFromSchedule(quickKhataSchedule) || undefined,
            }
          : undefined;

      const resolvedUdhaarCustomerId =
        needsUdhaarCustomer && !inlineNewUdhaarCustomer
          ? selectedUdhaarOption?.udhaarCustomerId
          : undefined;

      const resolvedCrmCustomerId =
        needsUdhaarCustomer && !inlineNewUdhaarCustomer
          ? selectedUdhaarOption?.crmCustomerId ?? (selectedCrmCustomer?.id || undefined)
          : selectedCrmCustomer?.id;

      const resolvedName = inlineNewUdhaarCustomer
        ? inlineNewUdhaarCustomer.name
        : needsUdhaarCustomer && selectedUdhaarOption
        ? selectedUdhaarOption.name
        : selectedCrmCustomer
        ? selectedCrmCustomer.name
        : customerName.trim();

      const resolvedTid =
        (paymentMethod === 'jazzcash' ||
          paymentMethod === 'easypaisa' ||
          paymentMethod === 'bank_transfer') &&
        transactionId.trim()
          ? transactionId.trim()
          : undefined;

      const primaryMethod = isSplitMode
        ? paymentSplits[0]?.method || 'cash'
        : paymentMethod;

      const created = onCompleteSale({
        customerId: resolvedCrmCustomerId,
        customerName: resolvedName,
        udhaarCustomerId: resolvedUdhaarCustomerId,
        discountPercent: discountMode === 'percent' ? discountPercent : Math.round(effectiveDiscountPercent * 100) / 100,
        discountMode,
        fixedDiscountAmount: discountMode === 'fixed' ? discountAmount : 0,
        paymentMethod: primaryMethod,
        paymentSplits: isSplitMode
          ? paymentSplits.filter((sp) => sp.amount > 0)
          : undefined,
        amountTendered: parsedTendered,
        transactionId: resolvedTid,
        clientTxRef: pendingTxRef.current,
        inlineNewUdhaarCustomer,
      });

      if (created) {
        pendingTxRef.current = generateUuid();
        setShowConfirmCheckout(false);
        setSelectedCustomerId('');
        setCustomerName('');
        setSelectedUdhaarKey('');
        setShowQuickKhataForm(false);
        setQuickKhataName('');
        setQuickKhataPhone('');
        setQuickKhataSchedule('1_week');
        setDiscountMode('percent');
        setDiscountPercent(0);
        setFixedDiscountInput('0');
        setCashTenderedInput('');
        setTransactionId('');
        setIsSplitMode(false);
        setPaymentSplits([{ method: 'cash', amount: 0 }]);
        setShowSaleBanner(true);
      }
    } finally {
      setIsSubmittingSale(false);
    }
  };

  const canCheckout =
    lineItems.length > 0 &&
    !isCashInsufficient &&
    !isSplitInvalid &&
    !isUdhaarInvalid &&
    !isCreditLimitExceeded &&
    !isSubmittingSale;

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6">
      {/* Page Heading */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {t.posTitle}
            </h1>
            {activeBranchName && (
              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                {activeBranchName}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-1">{t.posSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenCustomerDisplay && (
            <button
              type="button"
              onClick={onOpenCustomerDisplay}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
              <span>{t.openCustomerDisplayBtn}</span>
            </button>
          )}

          {onHoldCurrentBill && (
            <button
              type="button"
              onClick={() => setShowHeldModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              <PlayCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
              <span>
                {t.heldBillsBtn} ({heldBills.length})
              </span>
            </button>
          )}
        </div>
      </div>

      {showSaleBanner && lastCompletedOrder && (
        <div className="mb-5 flex items-center justify-between gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-900">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>
              {t.lastSaleSuccess}{' '}
              <span className="font-mono font-semibold tabular-nums">
                ({lastCompletedOrder.receiptNumber})
              </span>
            </span>
          </div>
          {canViewDashboard && (
            <button
              type="button"
              onClick={onGoToDashboard}
              className="font-semibold text-teal-800 underline underline-offset-4 hover:text-teal-900 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.viewDashboardLink}
            </button>
          )}
        </div>
      )}

      {/* Main Split Register Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Catalog Area */}
        <section className="lg:col-span-7 xl:col-span-8 space-y-4" aria-label="Product Catalog">
          {/* Search, Scanner Mode Selector & Category Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search
                  className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="pos-product-search"
                  data-barcode-search-input="true"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.searchProductsPlaceholder}
                  className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                {(
                  [
                    ['hid', t.scannerModeHid, Barcode],
                    ['camera_barcode', t.scannerModeCameraBarcode, Camera],
                    ['camera_qr', t.scannerModeQr, QrCode],
                  ] as const
                ).map(([modeKey, label, Icon]) => (
                  <button
                    key={modeKey}
                    type="button"
                    onClick={() => setScannerMode(modeKey)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-md whitespace-nowrap cursor-pointer ${
                      scannerMode === modeKey
                        ? 'bg-teal-700 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div
              role="tablist"
              aria-label="Product categories"
              className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto"
            >
              {CATEGORIES.map((cat) => {
                const active = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {getCategoryLabel(cat, t)}
                  </button>
                );
              })}
            </div>
          </div>

          {scannerMode !== 'hid' && (
            <CameraScannerPanel
              mode={scannerMode}
              onDetected={handleBarcodeScan}
              t={t}
            />
          )}

          {scanFeedback && (
            <div
              role={scanFeedback.type === 'error' ? 'alert' : 'status'}
              aria-live={scanFeedback.type === 'error' ? 'assertive' : 'polite'}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-sm ${
                scanFeedback.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-teal-50 border-teal-200 text-teal-900'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {scanFeedback.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
                ) : (
                  <Barcode className="w-4 h-4 text-teal-700 shrink-0" aria-hidden="true" />
                )}
                <span className="font-medium truncate">{scanFeedback.message}</span>
              </div>
              <button
                type="button"
                aria-label={t.dismissLabel}
                onClick={() => setScanFeedback(null)}
                className="p-1 rounded-md hover:bg-black/5 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Product Grid */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <p className="text-sm text-slate-600 mb-4">{t.noProductsMatch}</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                {t.resetFilters}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredProducts.map((product) => {
                const inCartQty = roundQuantity(cartQtyMap.get(product.id) ?? 0);
                const remainingStock = Math.max(
                  0,
                  roundQuantity(product.stock - inCartQty)
                );
                const isOutOfStock = remainingStock <= 0;
                const productName = lang === 'ur' ? product.nameUr : product.nameEn;
                const unitLabel = getUnitLabel(product.sellingUnit, lang);

                return (
                  <article
                    key={product.id}
                    className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col transition-colors hover:border-slate-300"
                  >
                    <div className="aspect-square w-full bg-slate-100 overflow-hidden">
                      <ProductImage
                        src={product.image}
                        alt={productName}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="p-4 flex flex-col flex-1 justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1 flex-wrap">
                          <span className="font-mono">{product.barcode || product.sku}</span>
                          <span aria-hidden="true">·</span>
                          <span>{getCategoryLabel(product.category, t)}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`tabular-nums ${
                              remainingStock === 0
                                ? 'text-red-700 font-medium'
                                : remainingStock <= (product.minStock ?? 5)
                                ? 'text-amber-700 font-medium'
                                : 'text-slate-500'
                            }`}
                          >
                            {remainingStock === 0
                              ? t.outOfStockLabel
                              : `${t.inStockLabel}: ${formatQuantityWithUnit(
                                  remainingStock,
                                  product.sellingUnit,
                                  lang
                                )}`}
                          </span>
                        </div>

                        <h2 className="text-base font-semibold text-slate-900 leading-snug">
                          {productName}
                        </h2>
                        {(product.brand || product.variant) && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {[product.brand, product.variant].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
                        <span className="font-mono text-base font-bold text-slate-900 tabular-nums whitespace-nowrap">
                          {formatCurrency(product.price, lang)}
                          <span className="text-xs font-normal text-slate-500">
                            {' '}
                            / {unitLabel}
                          </span>
                        </span>

                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => {
                            setShowSaleBanner(false);
                            onAddToCart(product.id);
                          }}
                          className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg whitespace-nowrap shrink-0 min-h-[40px] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                            isOutOfStock
                              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                              : inCartQty > 0
                              ? 'bg-teal-800 hover:bg-teal-900 text-white'
                              : 'bg-teal-700 hover:bg-teal-800 text-white'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>
                            {inCartQty > 0
                              ? `${t.addedMore} (${formatQuantityWithUnit(
                                  inCartQty,
                                  product.sellingUnit,
                                  lang
                                )})`
                              : t.addToCart}
                          </span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Billing Cart & Checkout Panel */}
        <aside
          className="lg:col-span-5 xl:col-span-4 bg-white border border-slate-200 rounded-xl p-5 lg:sticky lg:top-18"
          aria-label="Active Cart and Billing"
        >
          {/* Cart Header */}
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-bold text-slate-900">{t.currentBill}</h2>
              <span className="text-xs font-mono text-slate-500 tabular-nums">
                ({formatQuantity(totalUnitsInCart)} {t.itemsCount})
              </span>
            </div>

            {lineItems.length > 0 && (
              <div className="flex items-center gap-2">
                {onHoldCurrentBill && (
                  <button
                    type="button"
                    onClick={() => {
                      onHoldCurrentBill({
                        customerId: selectedCustomerId || undefined,
                        customerName:
                          selectedCrmCustomer?.name || customerName.trim(),
                        discountPercent,
                        discountMode,
                        fixedDiscountAmount: Number(fixedDiscountInput) || 0,
                      });
                      setQtyDrafts({});
                    }}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-md cursor-pointer"
                  >
                    <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{t.holdBillBtn}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setQtyDrafts({});
                    onClearCart();
                  }}
                  className="text-xs font-medium text-slate-600 hover:text-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {t.clearCart}
                </button>
              </div>
            )}
          </div>

          {/* Cart Items List */}
          {lineItems.length === 0 ? (
            <div className="py-10 text-center">
              <ShoppingBag
                className="w-8 h-8 text-slate-300 mx-auto mb-3"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold text-slate-800">{t.emptyCartTitle}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto leading-relaxed">
                {t.emptyCartDesc}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[360px] overflow-y-auto my-2">
              {lineItems.map((item) => {
                const name = lang === 'ur' ? item.nameUr : item.nameEn;
                const isRet = Boolean(item.isReturn);
                const canIncrement = isRet || item.quantity < item.availableStock;
                const unitLabel = getUnitLabel(item.sellingUnit, lang);
                const compatibleUnits = getCompatibleUnits(item.sellingUnit);
                const shortcuts = getOptionalUnitShortcuts(item.sellingUnit);
                const draftKey = `${item.productId}-${isRet ? 'ret' : 'sale'}`;

                const defaultEnteredDisplay =
                  item.enteredUnit !== item.sellingUnit
                    ? formatQuantity(
                        calculateUnitAwarePrice(
                          1,
                          item.enteredUnit,
                          item.quantity,
                          item.sellingUnit
                        ).baseQuantity
                      )
                    : formatQuantity(item.quantity);

                const displayQtyValue =
                  qtyDrafts[draftKey] !== undefined
                    ? qtyDrafts[draftKey]
                    : defaultEnteredDisplay;

                return (
                  <div
                    key={draftKey}
                    className={`py-3 flex flex-col gap-2 ${
                      isRet ? 'bg-red-50/60 border-s-2 border-red-500 px-2.5 rounded-lg my-1' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {name}
                          </p>
                          {isRet && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide bg-red-100 text-red-700 border border-red-200 shrink-0">
                              {t.posReturnBadge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-slate-500 tabular-nums mt-0.5">
                          {formatCurrency(item.unitPrice, lang)} / {unitLabel}
                          {item.taxRate > 0 ? ` · +${item.taxRate}% ${t.taxCol}` : ''}
                        </p>
                      </div>

                      <button
                        type="button"
                        aria-pressed={isRet}
                        onClick={() => {
                          setQtyDrafts((prev) => {
                            const next = { ...prev };
                            delete next[draftKey];
                            return next;
                          });
                          onToggleReturn(item.productId, isRet);
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-md border whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          isRet
                            ? 'bg-red-600 text-white border-red-600 hover:bg-red-700'
                            : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        <RotateCcw className="w-3 h-3 shrink-0" aria-hidden="true" />
                        <span>{t.posReturnToggleBtn}</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {/* Free-Entry Numeric/Decimal Quantity Input + Unit Switcher */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-white shrink-0">
                          <button
                            type="button"
                            aria-label={`Decrease quantity of ${name}`}
                            onClick={() => {
                              setQtyDrafts((prev) => {
                                const next = { ...prev };
                                delete next[draftKey];
                                return next;
                              });
                              onUpdateQuantity(item.productId, -1, isRet);
                            }}
                            className="w-7 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-s-lg transition-colors cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min="0.001"
                            aria-label={`${t.qtyCol} (${unitLabel}) - ${name}`}
                            title={t.customQtyHint}
                            value={displayQtyValue}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setQtyDrafts((prev) => ({ ...prev, [draftKey]: raw }));
                              const parsed = Number(raw);
                              if (Number.isFinite(parsed) && parsed > 0) {
                                onSetQuantity(
                                  item.productId,
                                  parsed,
                                  isRet,
                                  item.enteredUnit
                                );
                              }
                            }}
                            onBlur={() => {
                              setQtyDrafts((prev) => {
                                const next = { ...prev };
                                delete next[draftKey];
                                return next;
                              });
                            }}
                            className={`w-16 h-8 px-1 text-center font-mono text-xs font-semibold bg-transparent focus:outline-none focus:bg-slate-50 tabular-nums ${
                              isRet ? 'text-red-700' : 'text-slate-900'
                            }`}
                          />
                          <button
                            type="button"
                            aria-label={`Increase quantity of ${name}`}
                            disabled={!canIncrement}
                            onClick={() => {
                              setQtyDrafts((prev) => {
                                const next = { ...prev };
                                delete next[draftKey];
                                return next;
                              });
                              onUpdateQuantity(item.productId, 1, isRet);
                            }}
                            className={`w-7 h-8 flex items-center justify-center rounded-e-lg transition-colors ${
                              canIncrement
                                ? 'text-slate-700 hover:bg-slate-100 cursor-pointer'
                                : 'text-slate-300 cursor-not-allowed'
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        {compatibleUnits.length > 1 ? (
                          <select
                            aria-label="Unit"
                            value={item.enteredUnit}
                            onChange={(e) => {
                              const nextUnit = e.target.value as SellingUnit;
                              setQtyDrafts((prev) => {
                                const next = { ...prev };
                                delete next[draftKey];
                                return next;
                              });
                              const currentInBase = item.quantity;
                              const convertedVal = calculateUnitAwarePrice(
                                1,
                                nextUnit,
                                currentInBase,
                                item.sellingUnit
                              ).baseQuantity;
                              onSetQuantity(
                                item.productId,
                                convertedVal > 0 ? convertedVal : 1,
                                isRet,
                                nextUnit
                              );
                            }}
                            className="h-8 px-1.5 text-[11px] font-medium bg-slate-100 border border-slate-200 rounded-md text-slate-700"
                          >
                            {compatibleUnits.map((u) => (
                              <option key={u} value={u}>
                                {getUnitLabel(u, lang)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-600 px-1.5 py-0.5 rounded bg-slate-100 shrink-0">
                            {unitLabel}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`font-mono text-sm font-semibold tabular-nums min-w-[70px] text-end ${
                            isRet ? 'text-red-700' : 'text-slate-900'
                          }`}
                        >
                          {formatCurrency(item.lineTotal, lang)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${name}`}
                          onClick={() => {
                            setQtyDrafts((prev) => {
                              const next = { ...prev };
                              delete next[draftKey];
                              return next;
                            });
                            onRemoveFromCart(item.productId, isRet);
                          }}
                          className="p-1 text-slate-400 hover:text-red-700 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {/* Optional non-forced convenience chips & item discount */}
                    {(shortcuts.length > 0 || onSetCartItemDiscount) && (
                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5">
                        {shortcuts.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            {shortcuts.map((sc) => (
                              <button
                                key={sc.label}
                                type="button"
                                onClick={() => {
                                  setQtyDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[draftKey];
                                    return next;
                                  });
                                  onSetQuantity(
                                    item.productId,
                                    sc.quantity,
                                    isRet,
                                    sc.unit
                                  );
                                }}
                                className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-100 hover:bg-teal-50 text-slate-600 hover:text-teal-800 border border-slate-200 cursor-pointer"
                              >
                                {sc.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {onSetCartItemDiscount && (
                          <label className="inline-flex items-center gap-1 text-[10px] text-slate-500">
                            <span>Disc%</span>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={item.itemDiscountPercent || 0}
                              onChange={(e) =>
                                onSetCartItemDiscount(
                                  item.productId,
                                  isRet,
                                  Math.max(0, Math.min(100, Number(e.target.value) || 0))
                                )
                              }
                              className="w-11 h-6 px-1 text-center font-mono border border-slate-200 rounded bg-slate-50 text-slate-800"
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Customer & Discount Controls */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="space-y-2">
              <label
                htmlFor="pos-crm-customer-select"
                className="block text-xs font-medium text-slate-600"
              >
                {t.selectSaleCustomerLabel}
              </label>
              <select
                id="pos-crm-customer-select"
                value={selectedCustomerId}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
              >
                <option value="">{t.walkInOption}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone ? ` (${c.phone})` : ''}
                    {c.balance > 0
                      ? ` · ${t.posCustomerBalanceBadge} ${formatCurrency(c.balance, lang)}`
                      : ''}
                  </option>
                ))}
              </select>

              {!selectedCustomerId && !needsUdhaarCustomer && (
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={t.customerOptionalPlaceholder}
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
                />
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">{t.discountLabel}</span>
                <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDiscountMode('percent')}
                    className={`px-2 py-1 rounded font-semibold cursor-pointer ${
                      discountMode === 'percent' ? 'bg-white text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    {t.discountPercentMode}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountMode('fixed')}
                    className={`px-2 py-1 rounded font-semibold cursor-pointer ${
                      discountMode === 'fixed' ? 'bg-white text-slate-900' : 'text-slate-600'
                    }`}
                  >
                    {t.discountFixedMode}
                  </button>
                </div>
              </div>

              {discountMode === 'percent' ? (
                <div className="flex items-center justify-end gap-1 p-1 bg-slate-100 rounded-lg">
                  {DISCOUNT_OPTIONS.map((pct) => {
                    const active = discountPercent === pct;
                    return (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountPercent(pct)}
                        className={`flex-1 px-2.5 py-1 text-xs font-mono font-medium rounded-md tabular-nums transition-colors cursor-pointer ${
                          active
                            ? 'bg-white text-slate-900 shadow-xs font-semibold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {pct}%
                      </button>
                    );
                  })}
                </div>
              ) : (
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={fixedDiscountInput}
                  onChange={(e) => setFixedDiscountInput(e.target.value)}
                  className="w-full h-9 px-3 text-end font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg"
                  placeholder="Rs."
                />
              )}
            </div>
          </div>

          {/* Totals Calculation Breakdown */}
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-2 text-sm">
            <div className="flex items-center justify-between text-slate-600">
              <span>{t.subtotalLabel}</span>
              <span className="font-mono tabular-nums text-slate-900">
                {formatCurrency(subtotal, lang)}
              </span>
            </div>

            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-emerald-700">
                <span>
                  {t.discountLabel}
                  {discountMode === 'percent' ? ` (${discountPercent}%)` : ''}
                </span>
                <span className="font-mono tabular-nums">
                  -{formatCurrency(discountAmount, lang)}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-slate-600">
              <span>{t.taxLabel}</span>
              <span className="font-mono tabular-nums text-slate-900">
                {formatCurrency(taxAmount, lang)}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
              <span
                className={`text-base font-bold ${
                  grandTotal < 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {grandTotal < 0 ? t.netRefundDueLabel : t.grandTotalLabel}
              </span>
              <span
                className={`font-mono text-xl font-bold tabular-nums ${
                  grandTotal < 0 ? 'text-red-700' : 'text-slate-900'
                }`}
              >
                {formatCurrency(grandTotal, lang)}
              </span>
            </div>
          </div>

          {/* Payment Method & Split / Tendered / Udhaar Controls */}
          <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-600">
                {t.paymentMethodLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = !isSplitMode;
                  setIsSplitMode(next);
                  if (next) {
                    setPaymentSplits([
                      { method: 'cash', amount: Math.max(0, grandTotal) },
                    ]);
                  }
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                  isSplitMode
                    ? 'bg-teal-700 text-white border-teal-700'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Split className="w-3 h-3" aria-hidden="true" />
                <span>{t.splitPaymentBtn}</span>
              </button>
            </div>

            {!isSplitMode ? (
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {enabledMethods.map((method) => {
                  const active = paymentMethod === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`px-2 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                        active
                          ? method === 'udhaar'
                            ? 'bg-amber-700 text-white shadow-xs font-semibold'
                            : 'bg-white text-slate-900 shadow-xs font-semibold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {getPaymentLabel(method, t)}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                {paymentSplits.map((sp, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <select
                      value={sp.method}
                      onChange={(e) => {
                        const nextMethod = e.target.value as PaymentMethod;
                        setPaymentSplits((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, method: nextMethod } : row
                          )
                        );
                      }}
                      className="flex-1 h-8 px-2 text-xs bg-white border border-slate-200 rounded-md"
                    >
                      {enabledMethods.map((m) => (
                        <option key={m} value={m}>
                          {getPaymentLabel(m, t)}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={sp.amount}
                      onChange={(e) => {
                        const amt = Math.max(0, Number(e.target.value) || 0);
                        setPaymentSplits((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, amount: amt } : row))
                        );
                      }}
                      className="w-24 h-8 px-2 text-end font-mono text-xs bg-white border border-slate-200 rounded-md tabular-nums"
                    />
                    {paymentSplits.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentSplits((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1 text-slate-400 hover:text-rose-700 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setPaymentSplits((prev) => [
                        ...prev,
                        {
                          method: 'jazzcash',
                          amount: Math.max(0, splitRemaining),
                        },
                      ])
                    }
                    className="text-teal-700 font-semibold hover:underline cursor-pointer"
                  >
                    + {t.addPaymentSplitBtn}
                  </button>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      Math.abs(splitRemaining) > 1 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {t.remainingToPayLabel}: {formatCurrency(splitRemaining, lang)}
                  </span>
                </div>
              </div>
            )}

            {!isSplitMode && paymentMethod === 'cash' && grandTotal > 0 && (
              <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="cash-tendered-input"
                    className="text-xs font-medium text-slate-700"
                  >
                    {t.amountTenderedLabel}
                  </label>
                  <input
                    id="cash-tendered-input"
                    type="number"
                    min={0}
                    value={cashTenderedInput}
                    onChange={(e) => setCashTenderedInput(e.target.value)}
                    placeholder={String(grandTotal)}
                    className="w-32 h-9 px-2.5 text-end font-mono text-sm font-semibold bg-white border border-slate-300 rounded-md text-slate-900 tabular-nums focus:outline-none focus:border-teal-700"
                  />
                </div>

                <div className="flex items-center justify-between gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCashTenderedInput(String(grandTotal))}
                    className="px-2 py-1 text-xs font-medium bg-white border border-slate-200 hover:border-slate-300 rounded text-slate-700 cursor-pointer"
                  >
                    {t.exactAmount}
                  </button>
                  {[1000, 2000, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCashTenderedInput(String(preset))}
                      className="px-2 py-1 text-xs font-mono bg-white border border-slate-200 hover:border-slate-300 rounded text-slate-700 tabular-nums cursor-pointer"
                    >
                      {preset.toLocaleString('en-PK')}
                    </button>
                  ))}
                </div>

                {isCashInsufficient ? (
                  <p className="text-xs font-medium text-red-700">{t.insufficientCash}</p>
                ) : (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                    <span className="font-medium text-slate-600">{t.changeDueLabel}</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatCurrency(changeDue, lang)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {!isSplitMode &&
              (paymentMethod === 'jazzcash' ||
                paymentMethod === 'easypaisa' ||
                paymentMethod === 'bank_transfer') && (
                <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Smartphone
                      className="w-4 h-4 text-teal-700 shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-slate-800">
                        {t.transferToAccountLabel} ({getPaymentLabel(paymentMethod, t)})
                      </p>
                      {(() => {
                        const title =
                          paymentMethod === 'jazzcash'
                            ? storeSettings.jazzcashAccountTitle
                            : paymentMethod === 'easypaisa'
                            ? storeSettings.easypaisaAccountTitle
                            : [storeSettings.bankName, storeSettings.bankAccountTitle]
                                .filter(Boolean)
                                .join(' · ');
                        const number =
                          paymentMethod === 'jazzcash'
                            ? storeSettings.jazzcashAccountNumber
                            : paymentMethod === 'easypaisa'
                            ? storeSettings.easypaisaAccountNumber
                            : storeSettings.bankAccountNumber;
                        if (!title && !number) {
                          return (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {t.walletNotConfiguredMsg}
                            </p>
                          );
                        }
                        return (
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                            {title && (
                              <span className="font-semibold text-slate-900">
                                {title}
                              </span>
                            )}
                            {number && (
                              <span className="font-mono font-bold text-teal-800 tabular-nums">
                                {number}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="pos-wallet-tid"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      {t.transactionIdLabel}
                    </label>
                    <input
                      id="pos-wallet-tid"
                      type="text"
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                      placeholder={t.transactionIdPlaceholder}
                      className="w-full h-9 px-2.5 text-xs font-mono bg-white border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-400 tabular-nums focus:outline-none focus:border-teal-700"
                    />
                  </div>
                </div>
              )}

            {needsUdhaarCustomer && (
              <div className="space-y-2.5 bg-amber-50/70 border border-amber-200 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="pos-udhaar-select"
                    className="block text-xs font-semibold text-amber-900"
                  >
                    {t.selectUdhaarCustomerLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowQuickKhataForm((prev) => !prev)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-amber-900 bg-white border border-amber-300 hover:bg-amber-100 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                  >
                    <UserPlus className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>
                      {showQuickKhataForm
                        ? t.cancelNewKhataBtn
                        : t.newKhataCustomerInlineBtn}
                    </span>
                  </button>
                </div>

                <select
                  id="pos-udhaar-select"
                  value={selectedUdhaarKey}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedUdhaarKey(val);
                    const matched = unifiedUdhaarOptions.find(
                      (opt) => opt.value === val
                    );
                    if (matched?.crmCustomerId) {
                      setSelectedCustomerId(matched.crmCustomerId);
                    }
                    if (val) {
                      setShowQuickKhataForm(false);
                    }
                  }}
                  className="w-full h-10 px-3 text-sm bg-white border border-amber-300 rounded-lg text-slate-900 focus:outline-none focus:border-amber-700"
                >
                  <option value="">{t.chooseCustomerOption}</option>
                  {unifiedUdhaarOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.name}
                      {opt.phone ? ` (${opt.phone})` : ''} —{' '}
                      {formatCurrency(opt.balance, lang)}
                    </option>
                  ))}
                </select>

                {showQuickKhataForm && (
                  <div className="bg-white border border-amber-300 rounded-lg p-3 space-y-2.5">
                    <div>
                      <label
                        htmlFor="quick-khata-name"
                        className="block text-[11px] font-medium text-slate-700 mb-1"
                      >
                        {t.customerNameLabel} *
                      </label>
                      <input
                        id="quick-khata-name"
                        type="text"
                        value={quickKhataName}
                        onChange={(e) => setQuickKhataName(e.target.value)}
                        placeholder={t.quickKhataNamePlaceholder}
                        className="w-full h-9 px-2.5 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-amber-700 focus:bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor="quick-khata-phone"
                          className="block text-[11px] font-medium text-slate-700 mb-1"
                        >
                          {t.customerWhatsappLabel}
                        </label>
                        <input
                          id="quick-khata-phone"
                          type="tel"
                          value={quickKhataPhone}
                          onChange={(e) => setQuickKhataPhone(e.target.value)}
                          placeholder={t.quickKhataPhonePlaceholder}
                          className="w-full h-9 px-2.5 text-xs font-mono bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-amber-700 focus:bg-white"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="quick-khata-schedule"
                          className="block text-[11px] font-medium text-slate-700 mb-1"
                        >
                          {t.reminderScheduleLabel}
                        </label>
                        <select
                          id="quick-khata-schedule"
                          value={quickKhataSchedule}
                          onChange={(e) =>
                            setQuickKhataSchedule(e.target.value as ReminderSchedule)
                          }
                          className="w-full h-9 px-2 text-xs bg-slate-50 border border-slate-200 rounded-md text-slate-900 focus:outline-none focus:border-amber-700 focus:bg-white"
                        >
                          <option value="3_days">{t.schedule3Days}</option>
                          <option value="1_week">{t.schedule1Week}</option>
                          <option value="2_weeks">{t.schedule2Weeks}</option>
                          <option value="1_month">{t.schedule1Month}</option>
                          <option value="none">{t.scheduleNone}</option>
                        </select>
                      </div>
                    </div>

                    {onCreateInlineKhataCustomer && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={!quickKhataName.trim()}
                          onClick={handleSaveAndSelectQuickKhata}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-amber-700 hover:bg-amber-800 disabled:bg-slate-300 rounded-md whitespace-nowrap transition-colors cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{t.saveSelectCustomerBtn}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {isCreditLimitExceeded ? (
                  <p className="text-xs font-semibold text-rose-700">
                    {t.creditLimitExceededMsg} ({formatCurrency(activeCreditLimit, lang)})
                  </p>
                ) : (
                  <p className="text-xs text-amber-800">
                    {isUdhaarInvalid ? t.udhaarCustomerRequired : t.udhaarBalanceNotice}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={!canCheckout}
              onClick={() => setShowConfirmCheckout(true)}
              className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold rounded-lg transition-colors min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                !canCheckout
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-teal-700 hover:bg-teal-800 text-white cursor-pointer'
              }`}
            >
              <Printer className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t.completeSalePrint}</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Checkout Confirmation Modal (Prevents accidental clicks & duplicate charges) */}
      {showConfirmCheckout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-slate-900">{t.completeSalePrint}</h2>
            <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-600">{t.itemsCol}</span>
                <span className="font-mono font-semibold">{formatQuantity(totalUnitsInCart)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t.grandTotalLabel}</span>
                <span className="font-mono font-bold text-slate-900 text-sm tabular-nums">
                  {formatCurrency(grandTotal, lang)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">{t.methodCol}</span>
                <span className="font-semibold">
                  {isSplitMode ? t.splitPaymentBtn : getPaymentLabel(paymentMethod, t)}
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmCheckout(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                disabled={isSubmittingSale}
                onClick={executeCheckout}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
              >
                {t.completeSalePrint}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Held Bills Drawer Modal */}
      {showHeldModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">
                {t.heldBillsBtn} ({heldBills.length})
              </h2>
              <button
                type="button"
                onClick={() => setShowHeldModal(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5 max-h-[65vh] overflow-y-auto space-y-3">
              {heldBills.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">—</p>
              ) : (
                heldBills.map((hb) => (
                  <div
                    key={hb.id}
                    className="border border-slate-200 rounded-lg p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{hb.label}</p>
                      <p className="text-xs text-slate-500">
                        {hb.cart.length} {t.itemsCount} · {hb.cashierName}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onResumeHeldBill && (
                        <button
                          type="button"
                          onClick={() => {
                            onResumeHeldBill(hb);
                            setShowHeldModal(false);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
                        >
                          {t.resumeBillBtn}
                        </button>
                      )}
                      {onDiscardHeldBill && (
                        <button
                          type="button"
                          onClick={() => onDiscardHeldBill(hb.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer"
                        >
                          {t.discardBillBtn}
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
