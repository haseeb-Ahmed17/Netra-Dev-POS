import type { CategoryId, Product } from '../types';
import { isValidSellingUnit, normalizeSellingUnit, roundCurrency, roundQuantity } from './unitUtils';

function escapeCsvCell(value: string | number | undefined): string {
  const str = value === undefined || value === null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export const PRODUCT_CSV_HEADERS = [
  'sku',
  'barcode',
  'qrCode',
  'nameEn',
  'nameUr',
  'category',
  'brand',
  'variant',
  'sellingUnit',
  'cost',
  'price',
  'wholesalePrice',
  'taxRate',
  'stock',
  'minStock',
  'reorderLevel',
  'batchNumber',
  'expiryDate',
] as const;

export function exportProductsToCsv(products: Product[]): string {
  const rows = [
    PRODUCT_CSV_HEADERS.join(','),
    ...products.map((p) =>
      [
        escapeCsvCell(p.sku),
        escapeCsvCell(p.barcode),
        escapeCsvCell(p.qrCode ?? ''),
        escapeCsvCell(p.nameEn),
        escapeCsvCell(p.nameUr),
        escapeCsvCell(p.category),
        escapeCsvCell(p.brand ?? ''),
        escapeCsvCell(p.variant ?? ''),
        escapeCsvCell(normalizeSellingUnit(p.sellingUnit)),
        escapeCsvCell(p.cost),
        escapeCsvCell(p.price),
        escapeCsvCell(p.wholesalePrice ?? ''),
        escapeCsvCell(p.taxRate ?? 0),
        escapeCsvCell(roundQuantity(p.stock)),
        escapeCsvCell(p.minStock ?? 5),
        escapeCsvCell(p.reorderLevel ?? 10),
        escapeCsvCell(p.batchNumber ?? ''),
        escapeCsvCell(p.expiryDate ?? ''),
      ].join(',')
    ),
  ];
  return rows.join('\r\n');
}

export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = '';
  let inQuotes = false;
  const text = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(current);
      current = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
    } else {
      current += ch;
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export interface ImportedProductDraft {
  sku: string;
  barcode: string;
  qrCode?: string;
  nameEn: string;
  nameUr: string;
  category: Exclude<CategoryId, 'all'>;
  brand?: string;
  variant?: string;
  sellingUnit: Product['sellingUnit'];
  cost: number;
  price: number;
  wholesalePrice?: number;
  taxRate: number;
  stock: number;
  minStock?: number;
  reorderLevel?: number;
  batchNumber?: string;
  expiryDate?: string;
}

export function parseProductsFromCsv(csvText: string): {
  valid: ImportedProductDraft[];
  errors: string[];
} {
  const matrix = parseCsvRows(csvText);
  if (matrix.length < 2) {
    return { valid: [], errors: ['CSV must contain a header row and at least one product row.'] };
  }

  const headers = matrix[0].map((h) => h.trim().toLowerCase());
  const colIndex = (name: string) => headers.indexOf(name.toLowerCase());

  const valid: ImportedProductDraft[] = [];
  const errors: string[] = [];

  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const get = (name: string): string => {
      const idx = colIndex(name);
      return idx >= 0 && idx < row.length ? row[idx].trim() : '';
    };

    const nameEn = get('nameEn') || get('name');
    if (!nameEn) {
      errors.push(`Row ${r + 1}: missing product name (nameEn).`);
      continue;
    }

    const rawUnit = get('sellingUnit') || get('unit');
    if (rawUnit && !isValidSellingUnit(rawUnit.toLowerCase())) {
      errors.push(`Row ${r + 1} (${nameEn}): invalid sellingUnit "${rawUnit}".`);
      continue;
    }

    const rawCat = (get('category') || 'pantry').toLowerCase();
    const category: Exclude<CategoryId, 'all'> =
      rawCat === 'beverages' || rawCat === 'bakery' || rawCat === 'pantry'
        ? rawCat
        : 'pantry';

    const price = roundCurrency(Number(get('price')) || 0);
    const cost = roundCurrency(Number(get('cost')) || 0);
    const wholesaleRaw = get('wholesalePrice');
    const wholesalePrice = wholesaleRaw ? roundCurrency(Number(wholesaleRaw) || 0) : undefined;
    const stock = Math.max(0, roundQuantity(Number(get('stock')) || 0));
    const minStockRaw = get('minStock');
    const reorderRaw = get('reorderLevel');

    valid.push({
      sku: get('sku') || `IMP-${Date.now().toString().slice(-4)}-${r}`,
      barcode: get('barcode') || '',
      qrCode: get('qrCode') || undefined,
      nameEn,
      nameUr: get('nameUr') || nameEn,
      category,
      brand: get('brand') || undefined,
      variant: get('variant') || undefined,
      sellingUnit: normalizeSellingUnit(rawUnit || 'piece'),
      cost,
      price,
      wholesalePrice,
      taxRate: Math.max(0, Number(get('taxRate')) || 0),
      stock,
      minStock: minStockRaw ? Math.max(0, roundQuantity(Number(minStockRaw) || 0)) : undefined,
      reorderLevel: reorderRaw ? Math.max(0, roundQuantity(Number(reorderRaw) || 0)) : undefined,
      batchNumber: get('batchNumber') || undefined,
      expiryDate: get('expiryDate') || undefined,
    });
  }

  return { valid, errors };
}
