import { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { formatCurrency, getCategoryLabel, type TranslationStrings } from '../i18n';
import { uploadProductImage } from '../lib/posRepository';
import type { CategoryId, Language, Product } from '../types';
import { BarcodeStickerModal } from './BarcodeStickerModal';
import { ProductImage } from './ProductImage';

interface InventoryViewProps {
  userId: string;
  shopName: string;
  products: Product[];
  onAdjustStock: (productId: string, delta: number) => void;
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  lang: Language;
  t: TranslationStrings;
}

type ProductFormState = {
  nameEn: string;
  nameUr: string;
  category: Exclude<CategoryId, 'all'>;
  barcode: string;
  price: string;
  cost: string;
  taxRate: string;
  stock: string;
  image: string;
};

const EMPTY_FORM: ProductFormState = {
  nameEn: '',
  nameUr: '',
  category: 'pantry',
  barcode: '',
  price: '',
  cost: '',
  taxRate: '0',
  stock: '10',
  image: '',
};

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
  onAdjustStock,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  lang,
  t,
}: InventoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'healthy' | 'low'>('all');
  const [modalMode, setModalMode] = useState<'closed' | 'add' | 'edit'>('closed');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [stickerProduct, setStickerProduct] = useState<Pick<
    Product,
    'nameEn' | 'nameUr' | 'barcode' | 'sku' | 'price'
  > | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (stockFilter === 'healthy' && p.stock <= 5) return false;
      if (stockFilter === 'low' && p.stock > 5) return false;
      if (!q) return true;
      return (
        p.nameEn.toLowerCase().includes(q) ||
        p.nameUr.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.toLowerCase().includes(q)
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
    setUploadError(null);
    setForm({
      ...EMPTY_FORM,
      barcode: generateUnique12DigitBarcode(products),
    });
    setModalMode('add');
  };

  const openEditModal = (product: Product) => {
    setEditingProductId(product.id);
    setUploadError(null);
    setForm({
      nameEn: product.nameEn,
      nameUr: product.nameUr,
      category: product.category,
      barcode: product.barcode || product.sku,
      price: String(product.price),
      cost: String(product.cost),
      taxRate: String(product.taxRate ?? 0),
      stock: String(product.stock),
      image: product.image,
    });
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode('closed');
    setEditingProductId(null);
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

    const cleanNameEn = form.nameEn.trim();
    if (!cleanNameEn) return;

    const cleanNameUr = form.nameUr.trim() || cleanNameEn;
    const priceNum = Math.max(0, Number(form.price) || 0);
    const costNum =
      form.cost.trim() === '' ? 0 : Math.max(0, Number(form.cost) || 0);
    const taxNum = Math.max(0, Number(form.taxRate) || 0);
    const stockNum = Math.max(0, Math.floor(Number(form.stock) || 0));
    const cleanBarcode =
      form.barcode.trim() || generateUnique12DigitBarcode(products);
    const prefix =
      form.category === 'beverages'
        ? 'BEV'
        : form.category === 'bakery'
        ? 'BAK'
        : 'PAN';

    if (modalMode === 'add') {
      const sku = `${prefix}-${String(101 + products.length)}`;
      onAddProduct({
        sku,
        barcode: cleanBarcode,
        nameEn: cleanNameEn,
        nameUr: cleanNameUr,
        category: form.category,
        price: priceNum,
        cost: costNum,
        taxRate: taxNum,
        stock: stockNum,
        image: form.image,
      });
    } else if (modalMode === 'edit' && editingProductId) {
      const existing = products.find((p) => p.id === editingProductId);
      if (existing) {
        onUpdateProduct({
          ...existing,
          nameEn: cleanNameEn,
          nameUr: cleanNameUr,
          category: form.category,
          barcode: cleanBarcode,
          price: priceNum,
          cost: costNum,
          taxRate: taxNum,
          stock: stockNum,
          image: form.image,
        });
      }
    }

    closeModal();
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

        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-xs whitespace-nowrap shrink-0 min-h-[44px] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
        >
          <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{t.addProductBtn}</span>
        </button>
      </div>

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
                  <th className="py-3 px-5 text-start font-medium">{t.productCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.barcodeLabel}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.costCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.priceCol}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.taxRateLabel}</th>
                  <th className="py-3 px-4 text-end font-medium">{t.stockCol}</th>
                  <th className="py-3 px-4 text-start font-medium">{t.statusCol}</th>
                  <th className="py-3 px-5 text-end font-medium">{t.actionCol}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product) => {
                  const name = lang === 'ur' ? product.nameUr : product.nameEn;
                  const isOut = product.stock === 0;
                  const isLow = product.stock > 0 && product.stock <= 5;
                  const isConfirmingDelete = confirmDeleteId === product.id;

                  return (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                            <ProductImage
                              src={product.image}
                              alt={name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{name}</div>
                            <div className="text-xs text-slate-500">
                              {getCategoryLabel(product.category, t)} ·{' '}
                              <span className="font-mono">{product.sku}</span>
                            </div>
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
                      </td>
                      <td className="py-3 px-4 text-end font-mono text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {product.taxRate ?? 0}%
                      </td>
                      <td className="py-3 px-4 text-end font-mono font-bold text-slate-900 tabular-nums">
                        {product.stock}
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
                            onClick={() =>
                              setStickerProduct({
                                nameEn: product.nameEn,
                                nameUr: product.nameUr,
                                barcode: product.barcode,
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

                          {isConfirmingDelete ? (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteProduct(product.id);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors cursor-pointer"
                              >
                                {t.confirmDeleteBtn}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-md cursor-pointer"
                              >
                                {t.cancelBtn}
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(product.id)}
                              aria-label={`${t.deleteBtn} ${name}`}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
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

              {/* Category, Stock Quantity & Tax % */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    htmlFor="prod-stock"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {t.stockQtyLabel}
                  </label>
                  <input
                    id="prod-stock"
                    type="number"
                    min={0}
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
                        nameEn: form.nameEn.trim() || 'Product Label',
                        nameUr: form.nameUr.trim() || form.nameEn.trim() || 'پروڈکٹ',
                        barcode: form.barcode.trim(),
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

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
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
    </div>
  );
}
