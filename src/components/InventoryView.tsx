import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  CheckSquare,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  exportProductsToCsv,
  parseProductsFromCsv,
  type ImportedProductDraft,
} from '../lib/csvUtils';
import {
  formatCurrency,
  formatDateTime,
  getCategoryLabel,
  type TranslationStrings,
} from '../i18n';
import { uploadProductImage } from '../lib/posRepository';
import {
  SELLING_UNITS,
  formatQuantity,
  formatQuantityWithUnit,
  getUnitLabel,
  getUnitOptionLabel,
  isValidSellingUnit,
  normalizeSellingUnit,
  roundQuantity,
} from '../lib/unitUtils';
import type {
  AdjustmentType,
  CategoryId,
  InventoryAdjustment,
  Language,
  Product,
  SellingUnit,
} from '../types';
import { BarcodeStickerModal } from './BarcodeStickerModal';
import { ProductImage } from './ProductImage';

interface InventoryViewProps {
  userId: string;
  shopName: string;
  products: Product[];
  adjustments: InventoryAdjustment[];
  canDelete?: boolean;
  onAdjustStock: (productId: string, delta: number) => void;
  onRecordAdjustment: (payload: {
    productId: string;
    adjustmentType: AdjustmentType;
    quantityChange: number;
    reason: string;
  }) => void;
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onBulkImportProducts?: (drafts: ImportedProductDraft[]) => void;
  onBulkUpdateProducts?: (ids: string[], patch: Partial<Product>) => void;
  lang: Language;
  t: TranslationStrings;
}

type ProductFormState = {
  nameEn: string;
  nameUr: string;
  category: Exclude<CategoryId, 'all'>;
  brand: string;
  variant: string;
  sellingUnit: SellingUnit | '';
  barcode: string;
  qrCode: string;
  price: string;
  wholesalePrice: string;
  cost: string;
  taxRate: string;
  stock: string;
  minStock: string;
  reorderLevel: string;
  batchNumber: string;
  expiryDate: string;
  image: string;
};

const EMPTY_FORM: ProductFormState = {
  nameEn: '',
  nameUr: '',
  category: 'pantry',
  brand: '',
  variant: '',
  sellingUnit: '',
  barcode: '',
  qrCode: '',
  price: '',
  wholesalePrice: '',
  cost: '',
  taxRate: '0',
  stock: '10',
  minStock: '5',
  reorderLevel: '10',
  batchNumber: '',
  expiryDate: '',
  image: '',
};

function getExpiryStatus(expiryDate?: string): 'expired' | 'expiring_soon' | null {
  if (!expiryDate) return null;
  const parsed = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.ceil((parsed.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'expired';
  if (diffDays <= 30) return 'expiring_soon';
  return null;
}

function generateUnique12DigitBarcode(existingProducts: Product[]): string {
  const used = new Set(existingProducts.map((p) => p.barcode));
  for (let attempt = 0; attempt < 25; attempt++) {
    // 12-digit numeric UPC-style barcode starting with 896
    const suffix = String(Math.floor(100000000 + Math.random() * 900000000));
    const candidate = `896${suffix}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `896${String(Date.now()).slice(-9)}`;
}

export function InventoryView({
  userId,
  shopName,
  products,
  adjustments,
  canDelete = true,
  onAdjustStock,
  onRecordAdjustment,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onBulkImportProducts,
  onBulkUpdateProducts,
  lang,
  t,
}: InventoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'healthy' | 'low'>('all');
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<Product | null>(
    null
  );
  const [stickerProduct, setStickerProduct] = useState<Pick<
    Product,
    'id' | 'nameEn' | 'nameUr' | 'barcode' | 'qrCode' | 'sku' | 'price'
  > | null>(null);

  // Bulk Edit & CSV Import state
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkCategory, setBulkCategory] = useState<'' | Exclude<CategoryId, 'all'>>('');
  const [bulkTaxRate, setBulkTaxRate] = useState('');
  const [bulkMinStock, setBulkMinStock] = useState('');
  const [bulkPriceDeltaPct, setBulkPriceDeltaPct] = useState('');

  const [showImportModal, setShowImportModal] = useState(false);
  const [csvImportText, setCsvImportText] = useState('');
  const [csvImportResult, setCsvImportResult] = useState<{
    valid: ImportedProductDraft[];
    errors: string[];
  } | null>(null);

  // Stock Adjustment Modal state
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustProductId, setAdjustProductId] = useState<string>(
    products[0]?.id ?? ''
  );
  const [adjustType, setAdjustType] = useState<AdjustmentType>('Damaged');
  const [adjustDirection, setAdjustDirection] = useState<'add' | 'remove'>('remove');
  const [adjustQty, setAdjustQty] = useState<string>('1');
  const [adjustReason, setAdjustReason] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const productUnitMap = useMemo(() => {
    const map = new Map<string, SellingUnit>();
    for (const p of products) {
      map.set(p.id, normalizeSellingUnit(p.sellingUnit));
    }
    return map;
  }, [products]);

  const stockStats = useMemo(() => {
    const totalUnits = roundQuantity(products.reduce((sum, p) => sum + p.stock, 0));
    const totalStockValue = products.reduce((sum, p) => sum + p.stock * p.cost, 0);
    const lowStockCount = products.filter((p) => p.stock <= (p.minStock ?? 5)).length;
    return {
      totalProducts: products.length,
      totalUnits,
      totalStockValue,
      lowStockCount,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      const minLevel = p.minStock ?? 5;
      if (stockFilter === 'healthy' && p.stock <= minLevel) return false;
      if (stockFilter === 'low' && p.stock > minLevel) return false;
      if (!q) return true;
      return (
        p.nameEn.toLowerCase().includes(q) ||
        p.nameUr.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q) ||
        (p.brand ?? '').toLowerCase().includes(q) ||
        (p.batchNumber ?? '').toLowerCase().includes(q)
      );
    });
  }, [products, searchQuery, stockFilter]);

  const liveSalePrice = Math.max(0, Number(form.price) || 0);
  const liveCostPrice = Math.max(0, Number(form.cost) || 0);
  const liveProfitAmount = liveSalePrice - liveCostPrice;
  const liveProfitMargin =
    liveSalePrice > 0 ? (liveProfitAmount / liveSalePrice) * 100 : 0;

  const openAddModal = () => {
    setEditingProductId(null);
    setFormError(null);
    setUploadError(null);
    setForm({
      ...EMPTY_FORM,
      barcode: generateUnique12DigitBarcode(products),
    });
    setModalMode('add');
  };

  const openEditModal = (product: Product) => {
    setEditingProductId(product.id);
    setFormError(null);
    setUploadError(null);
    setForm({
      nameEn: product.nameEn,
      nameUr: product.nameUr,
      category: product.category,
      brand: product.brand ?? '',
      variant: product.variant ?? '',
      sellingUnit: normalizeSellingUnit(product.sellingUnit),
      barcode: product.barcode || product.sku,
      qrCode: product.qrCode ?? '',
      price: String(product.price),
      wholesalePrice:
        product.wholesalePrice !== undefined ? String(product.wholesalePrice) : '',
      cost: String(product.cost),
      taxRate: String(product.taxRate ?? 0),
      stock: String(product.stock),
      minStock: String(product.minStock ?? 5),
      reorderLevel: String(product.reorderLevel ?? 10),
      batchNumber: product.batchNumber ?? '',
      expiryDate: product.expiryDate ?? '',
      image: product.image,
    });
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode('closed');
    setEditingProductId(null);
    setFormError(null);
    setUploadError(null);
  };

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadingPhoto(true);
    try {
      const publicUrl = await uploadProductImage(userId, file);
      setForm((prev) => ({ ...prev, image: publicUrl }));
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : 'Failed to upload product photo.'
      );
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadingPhoto) return;
    setFormError(null);

    const cleanNameEn = form.nameEn.trim();
    if (!cleanNameEn) return;

    if (!isValidSellingUnit(form.sellingUnit)) {
      setFormError(t.sellingUnitRequiredError);
      return;
    }

    const cleanNameUr = form.nameUr.trim() || cleanNameEn;
    const priceNum = Math.max(0, Number(form.price) || 0);
    const wholesaleNum =
      form.wholesalePrice.trim() !== ''
        ? Math.max(0, Number(form.wholesalePrice) || 0)
        : undefined;
    const costNum =
      form.cost.trim() === '' ? 0 : Math.max(0, Number(form.cost) || 0);
    const taxNum = Math.max(0, Number(form.taxRate) || 0);
    const stockNum = Math.max(0, roundQuantity(Number(form.stock) || 0));
    const minStockNum = Math.max(0, roundQuantity(Number(form.minStock) || 5));
    const reorderNum = Math.max(0, roundQuantity(Number(form.reorderLevel) || 10));
    const cleanBarcode =
      form.barcode.trim() || generateUnique12DigitBarcode(products);
    const prefix =
      form.category === 'beverages'
        ? 'BEV'
        : form.category === 'bakery'
        ? 'BAK'
        : 'PAN';

    const extraFields = {
      brand: form.brand.trim() || undefined,
      variant: form.variant.trim() || undefined,
      qrCode: form.qrCode.trim() || undefined,
      wholesalePrice: wholesaleNum,
      minStock: minStockNum,
      reorderLevel: reorderNum,
      batchNumber: form.batchNumber.trim() || undefined,
      expiryDate: form.expiryDate.trim() || undefined,
    };

    if (modalMode === 'add') {
      const sku = `${prefix}-${String(101 + products.length)}`;
      onAddProduct({
        sku,
        barcode: cleanBarcode,
        nameEn: cleanNameEn,
        nameUr: cleanNameUr,
        category: form.category,
        sellingUnit: form.sellingUnit,
        price: priceNum,
        cost: costNum,
        taxRate: taxNum,
        stock: stockNum,
        image: form.image,
        ...extraFields,
      });
    } else if (modalMode === 'edit' && editingProductId) {
      const existing = products.find((p) => p.id === editingProductId);
      if (existing) {
        onUpdateProduct({
          ...existing,
          nameEn: cleanNameEn,
          nameUr: cleanNameUr,
          category: form.category,
          sellingUnit: form.sellingUnit,
          barcode: cleanBarcode,
          price: priceNum,
          cost: costNum,
          taxRate: taxNum,
          stock: stockNum,
          image: form.image,
          ...extraFields,
        });
      }
    }

    closeModal();
  };

  const handleExportCsv = () => {
    const csv = exportProductsToCsv(products);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-catalog-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleParseCsvInput = (raw: string) => {
    setCsvImportText(raw);
    if (!raw.trim()) {
      setCsvImportResult(null);
      return;
    }
    setCsvImportResult(parseProductsFromCsv(raw));
  };

  const handleConfirmCsvImport = () => {
    if (!csvImportResult || csvImportResult.valid.length === 0) return;
    if (onBulkImportProducts) {
      onBulkImportProducts(csvImportResult.valid);
    } else {
      for (const item of csvImportResult.valid) {
        onAddProduct({
          sku: item.sku,
          barcode: item.barcode || generateUnique12DigitBarcode(products),
          qrCode: item.qrCode,
          nameEn: item.nameEn,
          nameUr: item.nameUr,
          category: item.category,
          brand: item.brand,
          variant: item.variant,
          sellingUnit: item.sellingUnit,
          cost: item.cost,
          price: item.price,
          wholesalePrice: item.wholesalePrice,
          taxRate: item.taxRate,
          stock: item.stock,
          minStock: item.minStock,
          reorderLevel: item.reorderLevel,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          image: '',
        });
      }
    }
    setShowImportModal(false);
    setCsvImportText('');
    setCsvImportResult(null);
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleApplyBulkEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProductIds.length === 0) return;
    const patch: Partial<Product> = {};
    if (bulkCategory) patch.category = bulkCategory;
    if (bulkTaxRate.trim() !== '') patch.taxRate = Math.max(0, Number(bulkTaxRate) || 0);
    if (bulkMinStock.trim() !== '')
      patch.minStock = Math.max(0, roundQuantity(Number(bulkMinStock) || 0));

    const pctDelta = Number(bulkPriceDeltaPct);
    const hasPriceDelta = bulkPriceDeltaPct.trim() !== '' && Number.isFinite(pctDelta) && pctDelta !== 0;

    if (onBulkUpdateProducts && !hasPriceDelta) {
      onBulkUpdateProducts(selectedProductIds, patch);
    } else {
      const selectedSet = new Set(selectedProductIds);
      for (const p of products) {
        if (!selectedSet.has(p.id)) continue;
        const nextPrice = hasPriceDelta
          ? Math.max(1, Math.round(p.price * (1 + pctDelta / 100)))
          : p.price;
        onUpdateProduct({ ...p, ...patch, price: nextPrice });
      }
    }

    setShowBulkModal(false);
    setSelectedProductIds([]);
    setBulkCategory('');
    setBulkTaxRate('');
    setBulkMinStock('');
    setBulkPriceDeltaPct('');
  };

  const openAdjustModal = (targetProductId?: string) => {
    const fallbackId = targetProductId || products[0]?.id || '';
    setAdjustProductId(fallbackId);
    setAdjustType('Damaged');
    setAdjustDirection('remove');
    setAdjustQty('1');
    setAdjustReason('');
    setShowAdjustModal(true);
  };

  const selectedAdjustProduct = useMemo(
    () =>
      products.find((p) => p.id === adjustProductId) ?? products[0] ?? null,
    [products, adjustProductId]
  );

  const adjustQtyNum = Math.max(0, roundQuantity(Number(adjustQty) || 0));
  const signedAdjustDelta =
    adjustDirection === 'add' ? adjustQtyNum : -adjustQtyNum;
  const previewNewStock = selectedAdjustProduct
    ? Math.max(0, roundQuantity(selectedAdjustProduct.stock + signedAdjustDelta))
    : 0;

  const handleSubmitAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdjustProduct || adjustQtyNum <= 0) return;

    onRecordAdjustment({
      productId: selectedAdjustProduct.id,
      adjustmentType: adjustType,
      quantityChange: signedAdjustDelta,
      reason: adjustReason.trim() || adjustType,
    });

    setShowAdjustModal(false);
    setAdjustQty('1');
    setAdjustReason('');
  };

  const getAdjustmentTypeLabel = (type: AdjustmentType) => {
    switch (type) {
      case 'Damaged':
        return t.adjTypeDamaged;
      case 'Expired':
        return t.adjTypeExpired;
      case 'Lost/Theft':
        return t.adjTypeLost;
      case 'Stock Count Correction':
        return t.adjTypeCorrection;
      default:
        return type;
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {t.inventoryTitle}
          </h1>
          <p className="text-sm text-slate-600 mt-1">{t.inventorySubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {selectedProductIds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBulkModal(true)}
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-teal-900 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg whitespace-nowrap min-h-[44px] transition-colors cursor-pointer"
            >
              <CheckSquare className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {t.bulkEditBtn} ({selectedProductIds.length})
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={products.length === 0}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg whitespace-nowrap min-h-[44px] transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t.exportCsvBtn}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCsvImportText('');
              setCsvImportResult(null);
              setShowImportModal(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg whitespace-nowrap min-h-[44px] transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t.importCsvBtn}</span>
          </button>

          <button
            type="button"
            disabled={products.length === 0}
            onClick={() => openAdjustModal()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-900 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 min-h-[44px] transition-colors cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t.adjustStockBtn}</span>
          </button>

          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs whitespace-nowrap shrink-0 min-h-[44px] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
          >
            <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{t.addProductBtn}</span>
          </button>
        </div>
      </div>

      {/* Stock Summary Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.productCol}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {stockStats.totalProducts}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalUnitsInStockLabel}</p>
          <p className="font-mono text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {formatQuantity(stockStats.totalUnits)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.totalStockValueLabel}</p>
          <p className="font-mono text-2xl font-bold text-teal-800 tabular-nums mt-2">
            {formatCurrency(stockStats.totalStockValue, lang)}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">{t.lowStockCountLabel}</p>
          <p
            className={`font-mono text-2xl font-bold tabular-nums mt-2 ${
              stockStats.lowStockCount > 0 ? 'text-amber-700' : 'text-emerald-700'
            }`}
          >
            {stockStats.lowStockCount}
          </p>
        </div>
      </section>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search
            className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchProductsPlaceholder}
            className="w-full h-10 ps-9 pe-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white transition-colors"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(['all', 'healthy', 'low'] as const).map((status) => {
            const active = stockFilter === status;
            const label =
              status === 'all'
                ? t.filterAllStock
                : status === 'healthy'
                ? t.filterInStock
                : t.filterLowStock;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStockFilter(status)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inventory Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {filteredProducts.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <p className="text-sm text-slate-500">{t.noProductsMatch}</p>
            <button
              type="button"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t.addProductBtn}</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3 ps-4 pe-2 w-8">
                    <input
                      type="checkbox"
                      aria-label={t.bulkEditBtn}
                      checked={
                        filteredProducts.length > 0 &&
                        filteredProducts.every((p) => selectedProductIds.includes(p.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProductIds(filteredProducts.map((p) => p.id));
                        } else {
                          setSelectedProductIds([]);
                        }
                      }}
                      className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                    />
                  </th>
                  <th className="py-3 px-4 text-start font-medium">{t.productCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.barcodeLabel}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.costCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.priceCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.taxRateLabel}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.stockCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.stockValueCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.statusCol}</th>
                  <th className="py-3 px-5 text-end font-medium">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const name = lang === 'ur' ? product.nameUr : product.nameEn;
                  const minLevel = product.minStock ?? 5;
                  const isOut = product.stock === 0;
                  const isLow = product.stock > 0 && product.stock <= minLevel;
                  const stockValue = product.stock * product.cost;
                  const expiryStatus = getExpiryStatus(product.expiryDate);

                  return (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 ps-4 pe-2">
                        <input
                          type="checkbox"
                          checked={selectedProductIds.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          aria-label={name}
                          className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                            <ProductImage
                              src={product.image}
                              alt={name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                              <span>{name}</span>
                              {expiryStatus === 'expired' && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                                  {t.expiredBadge}
                                </span>
                              )}
                              {expiryStatus === 'expiring_soon' && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                  {t.expiringSoonBadge}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              {getCategoryLabel(product.category, t)} ·{' '}
                              <span className="font-mono">{product.sku}</span>
                              {product.brand ? ` · ${product.brand}` : ''}
                              {product.variant ? ` (${product.variant})` : ''}
                            </div>
                            {(product.batchNumber || product.expiryDate) && (
                              <div className="text-[11px] font-mono text-slate-400">
                                {product.batchNumber ? `Batch: ${product.batchNumber}` : ''}
                                {product.batchNumber && product.expiryDate ? ' · ' : ''}
                                {product.expiryDate ? `Exp: ${product.expiryDate}` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {product.barcode}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatCurrency(product.cost, lang)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatCurrency(product.price, lang)}
                        <span className="text-[11px] font-normal text-slate-500">
                          {' '}
                          / {getUnitLabel(product.sellingUnit, lang)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {product.taxRate ?? 0}%
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-bold text-slate-900 tabular-nums whitespace-nowrap">
                        {formatQuantityWithUnit(product.stock, product.sellingUnit, lang)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(stockValue, lang)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700">
                            <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.statusOut}</span>
                          </span>
                        ) : isLow ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.statusLow}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{t.statusHealthy}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-5 text-end whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={product.stock === 0}
                            onClick={() => onAdjustStock(product.id, -1)}
                            className={`px-2 py-1.5 text-xs font-mono font-medium rounded-md border transition-colors ${
                              product.stock === 0
                                ? 'border-slate-100 text-slate-300 cursor-not-allowed'
                                : 'border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer'
                            }`}
                          >
                            {t.reduceBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => onAdjustStock(product.id, 10)}
                            className="px-2.5 py-1.5 text-xs font-mono font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-md transition-colors cursor-pointer"
                          >
                            {t.restockBtn}
                          </button>
                          <button
                            type="button"
                            onClick={() => openAdjustModal(product.id)}
                            title={t.adjustStockBtn}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{t.adjustStockBtn}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setStickerProduct({
                                id: product.id,
                                nameEn: product.nameEn,
                                nameUr: product.nameUr,
                                barcode: product.barcode,
                                qrCode: product.qrCode,
                                sku: product.sku,
                                price: product.price,
                              })
                            }
                            aria-label={`${t.printBarcodeBtn} ${name}`}
                            title={t.printBarcodeBtn}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                          >
                            <Barcode className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditModal(product)}
                            aria-label={`${t.editBtn} ${name}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{t.editBtn}</span>
                          </button>

                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => setPendingDeleteProduct(product)}
                              aria-label={`${t.deleteBtn} ${name}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                              <span>{t.deleteBtn}</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Inventory Adjustments History Log */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <h2 className="text-base font-bold text-slate-900">
            {t.adjustmentHistoryTitle}
          </h2>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {adjustments.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 text-start font-medium">{t.entryDateCol}</th>
                <th className="py-3 px-4 text-start font-medium">{t.productCol}</th>
                <th className="py-3 px-4 text-start font-medium">{t.adjustmentTypeLabel}</th>
                <th className="py-3 px-4 text-end font-medium">{t.qtyChangeLabel}</th>
                <th className="py-3 px-4 text-end font-medium">{t.previousNewCol}</th>
                <th className="py-3 px-4 text-start font-medium">{t.reasonCol}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 px-4 text-center text-xs text-slate-500">
                    {t.noAdjustmentsRecorded}
                  </td>
                </tr>
              ) : (
                adjustments.map((adj) => {
                  const adjUnit =
                    adj.sellingUnit ?? productUnitMap.get(adj.productId) ?? 'piece';
                  return (
                    <tr key={adj.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDateTime(adj.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs font-semibold text-slate-900">
                          {adj.productName}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          {adj.sku}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs font-medium text-slate-700 whitespace-nowrap">
                        {getAdjustmentTypeLabel(adj.adjustmentType)}
                      </td>
                      <td
                        className={`py-3 px-4 text-end font-mono text-xs font-bold tabular-nums whitespace-nowrap ${
                          adj.quantityChange >= 0 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {adj.quantityChange >= 0
                          ? `+${formatQuantity(adj.quantityChange)}`
                          : formatQuantity(adj.quantityChange)}{' '}
                        {getUnitLabel(adjUnit, lang)}
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatQuantity(adj.previousStock)} → {formatQuantity(adj.newStock)}{' '}
                        {getUnitLabel(adjUnit, lang)}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {adj.reason || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add / Edit Product Modal */}
      {modalMode !== 'closed' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl overflow-hidden shadow-xl my-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 id="product-modal-title" className="text-base font-bold text-slate-900">
                {modalMode === 'add' ? t.addProductTitle : t.editProductTitle}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form
              onSubmit={handleSaveProduct}
              className="p-5 space-y-4 max-h-[82vh] overflow-y-auto"
            >
              {formError && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-800 text-xs font-medium rounded-lg px-3.5 py-2.5"
                >
                  {formError}
                </div>
              )}

              {/* Product Photo Upload & Preview */}
              <div className="flex items-center gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-white border border-slate-200 shrink-0">
                  <ProductImage
                    src={form.image}
                    alt={form.nameEn || t.productPhotoLabel}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-xs font-semibold text-slate-800">
                    {t.productPhotoLabel}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoFileChange}
                      className="hidden"
                      id="product-photo-file"
                    />
                    <label
                      htmlFor="product-photo-file"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>
                        {uploadingPhoto ? t.uploadingPhotoLabel : t.uploadPhotoBtn}
                      </span>
                    </label>
                    {form.image && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, image: '' }))}
                        className="px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md cursor-pointer"
                      >
                        {t.removePhotoBtn}
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">{t.photoUploadHint}</p>
                  {uploadError && (
                    <p className="text-xs font-medium text-red-700">{uploadError}</p>
                  )}
                </div>
              </div>

              {/* Names (English & Urdu) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="prod-name-en"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.productNameEnLabel}
                  </label>
                  <input
                    id="prod-name-en"
                    type="text"
                    required
                    value={form.nameEn}
                    onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                    placeholder="e.g., Kashmiri Green Tea"
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prod-name-ur"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.productNameUrLabel}
                  </label>
                  <input
                    id="prod-name-ur"
                    type="text"
                    dir="rtl"
                    value={form.nameUr}
                    onChange={(e) => setForm((f) => ({ ...f, nameUr: e.target.value }))}
                    placeholder="مثلاً کشمیری سبز چائے"
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              {/* Category, Selling Unit, Stock Quantity & Tax % */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label
                    htmlFor="prod-category"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.categoryLabel}
                  </label>
                  <select
                    id="prod-category"
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        category: e.target.value as Exclude<CategoryId, 'all'>,
                      }))
                    }
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  >
                    <option value="beverages">{t.categoryBeverages}</option>
                    <option value="bakery">{t.categoryBakery}</option>
                    <option value="pantry">{t.categoryPantry}</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="prod-selling-unit"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.sellingUnitLabel} *
                  </label>
                  <select
                    id="prod-selling-unit"
                    required
                    value={form.sellingUnit}
                    onChange={(e) => {
                      setFormError(null);
                      setForm((f) => ({
                        ...f,
                        sellingUnit: e.target.value as SellingUnit | '',
                      }));
                    }}
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  >
                    <option value="" disabled>
                      {t.selectUnitPlaceholder}
                    </option>
                    {SELLING_UNITS.map((unit) => (
                      <option key={unit} value={unit}>
                        {getUnitOptionLabel(unit, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="prod-stock"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.stockQtyLabel}
                    {form.sellingUnit
                      ? ` (${getUnitLabel(form.sellingUnit, lang)})`
                      : ''}
                  </label>
                  <input
                    id="prod-stock"
                    type="number"
                    min={0}
                    step="any"
                    required
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="prod-tax"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.taxRateLabel}
                  </label>
                  <input
                    id="prod-tax"
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    value={form.taxRate}
                    onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              {/* Cost Price (Kharid), Sale Price (Farokht) & Live Profit Readout */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="prod-cost"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      {t.costPriceLabel}
                    </label>
                    <input
                      id="prod-cost"
                      type="number"
                      min={0}
                      value={form.cost}
                      onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                      placeholder="0"
                      className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="prod-price"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      {t.retailPriceLabel}
                    </label>
                    <input
                      id="prod-price"
                      type="number"
                      min={1}
                      required
                      value={form.price}
                      onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                      placeholder="0"
                      className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                    />
                  </div>
                </div>

                {/* Real-time Profit Amount & Margin % */}
                <div className="flex items-center justify-between gap-4 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{t.profitAmountLabel}:</span>
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        liveProfitAmount < 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(liveProfitAmount, lang)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{t.profitMarginLabel}:</span>
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        liveProfitMargin < 0 ? 'text-red-700' : 'text-emerald-700'
                      }`}
                    >
                      {liveProfitMargin.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Brand, Variant, Wholesale, Min Stock & Reorder */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.brandLabel}
                  </label>
                  <input
                    type="text"
                    value={form.brand}
                    onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                    placeholder="e.g., Tapal"
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.variantLabel}
                  </label>
                  <input
                    type="text"
                    value={form.variant}
                    onChange={(e) => setForm((f) => ({ ...f, variant: e.target.value }))}
                    placeholder="e.g., Family Pack"
                    className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.wholesalePriceLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.wholesalePrice}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wholesalePrice: e.target.value }))
                    }
                    placeholder="Optional"
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.minStockLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.minStock}
                    onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.reorderLevelLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={form.reorderLevel}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reorderLevel: e.target.value }))
                    }
                    className="w-full h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.batchNumberLabel}
                  </label>
                  <input
                    type="text"
                    value={form.batchNumber}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, batchNumber: e.target.value }))
                    }
                    placeholder="B-2026-01"
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.expiryDateLabel}
                  </label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, expiryDate: e.target.value }))
                    }
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              {/* Barcode / UPC with Generate & Print Label */}
              <div className="space-y-2">
                <label
                  htmlFor="prod-barcode"
                  className="block text-xs font-medium text-slate-700"
                >
                  {t.barcodeInputLabel}
                </label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    id="prod-barcode"
                    type="text"
                    required
                    value={form.barcode}
                    onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                    className="flex-1 h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        barcode: generateUnique12DigitBarcode(products),
                      }))
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t.generateBarcodeBtn}</span>
                  </button>
                  <button
                    type="button"
                    disabled={!form.barcode.trim()}
                    onClick={() =>
                      setStickerProduct({
                        id: editingProductId || 'preview-sticker',
                        nameEn: form.nameEn.trim() || 'Product Label',
                        nameUr: form.nameUr.trim() || form.nameEn.trim() || 'پروڈکٹ',
                        barcode: form.barcode.trim(),
                        qrCode: form.qrCode.trim() || undefined,
                        sku: form.barcode.trim(),
                        price: Math.max(0, Number(form.price) || 0),
                      })
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Barcode className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{t.printBarcodeBtn}</span>
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between gap-2">
                <div>
                  {modalMode === 'edit' &&
                    canDelete &&
                    editingProductId &&
                    (() => {
                      const editingTarget = products.find(
                        (p) => p.id === editingProductId
                      );
                      if (!editingTarget) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => setPendingDeleteProduct(editingTarget)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg min-h-[40px] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                          <span>{t.deleteBtn}</span>
                        </button>
                      );
                    })()}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
                  >
                    {t.cancelBtn}
                  </button>
                  <button
                    type="submit"
                    disabled={uploadingPhoto}
                    className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 rounded-lg min-h-[40px] cursor-pointer"
                  >
                    {t.saveProductBtn}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Adjustment Modal */}
      {showAdjustModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjust-stock-modal-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2
                id="adjust-stock-modal-title"
                className="text-base font-bold text-slate-900"
              >
                {t.adjustModalTitle}
              </h2>
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSubmitAdjustment} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.productCol} *
                </label>
                <select
                  required
                  value={selectedAdjustProduct?.id ?? ''}
                  onChange={(e) => setAdjustProductId(e.target.value)}
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {lang === 'ur' ? p.nameUr : p.nameEn} ({p.sku}) · {t.inStockLabel}:{' '}
                      {formatQuantityWithUnit(p.stock, p.sellingUnit, lang)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.adjustmentTypeLabel}
                </label>
                <select
                  value={adjustType}
                  onChange={(e) => {
                    const nextType = e.target.value as AdjustmentType;
                    setAdjustType(nextType);
                    if (nextType !== 'Stock Count Correction') {
                      setAdjustDirection('remove');
                    }
                  }}
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                >
                  <option value="Damaged">{t.adjTypeDamaged}</option>
                  <option value="Expired">{t.adjTypeExpired}</option>
                  <option value="Lost/Theft">{t.adjTypeLost}</option>
                  <option value="Stock Count Correction">{t.adjTypeCorrection}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.qtyChangeLabel} *
                </label>
                <div className="flex items-center gap-2">
                  <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg shrink-0">
                    <button
                      type="button"
                      onClick={() => setAdjustDirection('remove')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                        adjustDirection === 'remove'
                          ? 'bg-red-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.qtyDirectionRemove}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustDirection('add')}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                        adjustDirection === 'add'
                          ? 'bg-emerald-700 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.qtyDirectionAdd}
                    </button>
                  </div>

                  <input
                    type="number"
                    min="0.001"
                    step="any"
                    required
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    className="flex-1 h-10 px-3 text-sm font-mono tabular-nums bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>
              </div>

              {selectedAdjustProduct && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5 flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    {t.currentStockLabel}:{' '}
                    <strong className="font-mono text-slate-900 tabular-nums">
                      {formatQuantityWithUnit(
                        selectedAdjustProduct.stock,
                        selectedAdjustProduct.sellingUnit,
                        lang
                      )}
                    </strong>
                  </span>
                  <span className="text-slate-600">
                    {t.newStockPreviewLabel}:{' '}
                    <strong
                      className={`font-mono tabular-nums ${
                        previewNewStock <= 5 ? 'text-amber-700' : 'text-teal-800'
                      }`}
                    >
                      {formatQuantityWithUnit(
                        previewNewStock,
                        selectedAdjustProduct.sellingUnit,
                        lang
                      )}
                    </strong>
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.adjustmentReasonLabel}
                </label>
                <input
                  type="text"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder={t.adjustmentReasonPlaceholder}
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700 focus:bg-white"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg min-h-[40px] cursor-pointer"
                >
                  {t.saveAdjustmentBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Barcode Sticker Modal */}
      <BarcodeStickerModal
        product={stickerProduct}
        shopName={shopName}
        onClose={() => setStickerProduct(null)}
        lang={lang}
        t={t}
      />

      {/* Delete Product Confirmation Dialog */}
      {pendingDeleteProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-product-dialog-title"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center shrink-0">
                  <Trash2 className="w-4 h-4 text-red-600" aria-hidden="true" />
                </div>
                <h2
                  id="delete-product-dialog-title"
                  className="text-base font-bold text-slate-900"
                >
                  {t.deleteProductTitle}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPendingDeleteProduct(null)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2.5">
                <div className="text-sm font-semibold text-slate-900">
                  {lang === 'ur'
                    ? pendingDeleteProduct.nameUr
                    : pendingDeleteProduct.nameEn}
                </div>
                <div className="text-xs font-mono text-slate-500 mt-0.5">
                  {pendingDeleteProduct.sku} · {pendingDeleteProduct.barcode}
                </div>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {t.deleteProductConfirmDesc}
              </p>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteProduct(null)}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg min-h-[40px] cursor-pointer"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProduct(pendingDeleteProduct.id);
                  if (editingProductId === pendingDeleteProduct.id) {
                    closeModal();
                  }
                  setPendingDeleteProduct(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg min-h-[40px] cursor-pointer"
              >
                <Trash2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{t.deleteForeverBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Bulk Edit Modal */}
      {showBulkModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-md overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                {t.bulkEditBtn} ({selectedProductIds.length})
              </h2>
              <button
                type="button"
                onClick={() => setShowBulkModal(false)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <form onSubmit={handleApplyBulkEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.categoryLabel}
                </label>
                <select
                  value={bulkCategory}
                  onChange={(e) =>
                    setBulkCategory(e.target.value as '' | Exclude<CategoryId, 'all'>)
                  }
                  className="w-full h-10 px-3 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
                >
                  <option value="">— No Change —</option>
                  <option value="beverages">{t.categoryBeverages}</option>
                  <option value="bakery">{t.categoryBakery}</option>
                  <option value="pantry">{t.categoryPantry}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.taxRateLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    placeholder="No change"
                    value={bulkTaxRate}
                    onChange={(e) => setBulkTaxRate(e.target.value)}
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {t.minStockLabel}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="No change"
                    value={bulkMinStock}
                    onChange={(e) => setBulkMinStock(e.target.value)}
                    className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  {t.priceCol} Adjustment (%)
                </label>
                <input
                  type="number"
                  step="1"
                  placeholder="e.g., 5 or -5"
                  value={bulkPriceDeltaPct}
                  onChange={(e) => setBulkPriceDeltaPct(e.target.value)}
                  className="w-full h-10 px-3 text-sm font-mono bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                >
                  {t.saveProductBtn}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Bulk Import Modal */}
      {showImportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">{t.importCsvBtn}</h2>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                aria-label={t.closeBtn}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  file.text().then((text) => handleParseCsvInput(text));
                }}
                className="block w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-teal-50 file:text-teal-800 hover:file:bg-teal-100"
              />
              <textarea
                rows={5}
                value={csvImportText}
                onChange={(e) => handleParseCsvInput(e.target.value)}
                placeholder="sku,barcode,nameEn,nameUr,category,sellingUnit,cost,price,taxRate,stock"
                className="w-full p-3 text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              />
              {csvImportResult && (
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-semibold">
                    Ready to import: {csvImportResult.valid.length} product(s)
                  </div>
                  {csvImportResult.errors.length > 0 && (
                    <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 space-y-1 max-h-28 overflow-y-auto">
                      {csvImportResult.errors.map((err, i) => (
                        <p key={i}>{err}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg cursor-pointer"
                >
                  {t.cancelBtn}
                </button>
                <button
                  type="button"
                  disabled={!csvImportResult || csvImportResult.valid.length === 0}
                  onClick={handleConfirmCsvImport}
                  className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 rounded-lg cursor-pointer"
                >
                  {t.importCsvBtn} ({csvImportResult?.valid.length ?? 0})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
