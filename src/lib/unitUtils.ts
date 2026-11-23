export const SELLING_UNITS = [
  'kg',
  'g',
  'litre',
  'ml',
  'metre',
  'cm',
  'piece',
  'packet',
  'box',
  'bottle',
] as const;

export type SellingUnit = (typeof SELLING_UNITS)[number];

const SELLING_UNIT_SET = new Set<string>(SELLING_UNITS);

export function isValidSellingUnit(value?: string | null): value is SellingUnit {
  return typeof value === 'string' && SELLING_UNIT_SET.has(value);
}

export function normalizeSellingUnit(value?: string | null): SellingUnit {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (SELLING_UNIT_SET.has(trimmed)) {
      return trimmed as SellingUnit;
    }
  }
  return 'piece';
}

export function roundQuantity(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function parsePositiveQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  const rounded = roundQuantity(parsed);
  return rounded > 0 ? rounded : null;
}

export function formatQuantity(qty: number): string {
  const safe = roundQuantity(qty);
  if (safe <= 0 && qty === 0) return '0';
  return Number(safe.toFixed(3)).toString();
}

const UNIT_SHORT_EN: Record<SellingUnit, string> = {
  kg: 'kg',
  g: 'g',
  litre: 'litre',
  ml: 'ml',
  metre: 'metre',
  cm: 'cm',
  piece: 'piece',
  packet: 'packet',
  box: 'box',
  bottle: 'bottle',
};

const UNIT_SHORT_UR: Record<SellingUnit, string> = {
  kg: 'کلو',
  g: 'گرام',
  litre: 'لیٹر',
  ml: 'ملی لیٹر',
  metre: 'میٹر',
  cm: 'سینٹی میٹر',
  piece: 'پیس',
  packet: 'پیکٹ',
  box: 'ڈبہ',
  bottle: 'بوتل',
};

const UNIT_OPTION_EN: Record<SellingUnit, string> = {
  kg: 'Kilogram (kg)',
  g: 'Gram (g)',
  litre: 'Litre (litre)',
  ml: 'Millilitre (ml)',
  metre: 'Metre (metre)',
  cm: 'Centimetre (cm)',
  piece: 'Piece (piece)',
  packet: 'Packet (packet)',
  box: 'Box (box)',
  bottle: 'Bottle (bottle)',
};

const UNIT_OPTION_UR: Record<SellingUnit, string> = {
  kg: 'کلوگرام (kg)',
  g: 'گرام (g)',
  litre: 'لیٹر (litre)',
  ml: 'ملی لیٹر (ml)',
  metre: 'میٹر (metre)',
  cm: 'سینٹی میٹر (cm)',
  piece: 'پیس (piece)',
  packet: 'پیکٹ (packet)',
  box: 'ڈبہ (box)',
  bottle: 'بوتل (bottle)',
};

export function getUnitLabel(unit: SellingUnit | string | undefined | null, lang: 'en' | 'ur' = 'en'): string {
  const normalized = normalizeSellingUnit(unit);
  return lang === 'ur' ? UNIT_SHORT_UR[normalized] : UNIT_SHORT_EN[normalized];
}

export function getUnitOptionLabel(unit: SellingUnit, lang: 'en' | 'ur' = 'en'): string {
  return lang === 'ur' ? UNIT_OPTION_UR[unit] : UNIT_OPTION_EN[unit];
}

export function formatQuantityWithUnit(
  qty: number,
  unit: SellingUnit | string | undefined | null,
  lang: 'en' | 'ur' = 'en'
): string {
  return `${formatQuantity(qty)} ${getUnitLabel(unit, lang)}`;
}

// Compatible Unit Conversions (Phase 4)
// Supports kg <-> g, litre <-> ml, metre <-> cm cleanly without guessing unrelated units.

const UNIT_FAMILY: Record<SellingUnit, { family: string; factorToBase: number }> = {
  kg: { family: 'mass', factorToBase: 1000 },
  g: { family: 'mass', factorToBase: 1 },
  litre: { family: 'volume', factorToBase: 1000 },
  ml: { family: 'volume', factorToBase: 1 },
  metre: { family: 'length', factorToBase: 100 },
  cm: { family: 'length', factorToBase: 1 },
  piece: { family: 'count_piece', factorToBase: 1 },
  packet: { family: 'count_packet', factorToBase: 1 },
  box: { family: 'count_box', factorToBase: 1 },
  bottle: { family: 'count_bottle', factorToBase: 1 },
};

export function getCompatibleUnits(unit: SellingUnit): SellingUnit[] {
  switch (unit) {
    case 'kg':
    case 'g':
      return ['kg', 'g'];
    case 'litre':
    case 'ml':
      return ['litre', 'ml'];
    case 'metre':
    case 'cm':
      return ['metre', 'cm'];
    default:
      return [unit];
  }
}

export function areUnitsCompatible(a: SellingUnit, b: SellingUnit): boolean {
  return UNIT_FAMILY[a].family === UNIT_FAMILY[b].family;
}

export function convertCompatibleQuantity(
  quantity: number,
  fromUnit: SellingUnit,
  toUnit: SellingUnit
): number {
  if (!Number.isFinite(quantity) || quantity === 0) return 0;
  if (fromUnit === toUnit) return roundQuantity(quantity);
  if (!areUnitsCompatible(fromUnit, toUnit)) {
    throw new Error(`Incompatible units: cannot convert ${fromUnit} to ${toUnit}`);
  }
  const baseQty = quantity * UNIT_FAMILY[fromUnit].factorToBase;
  const converted = baseQty / UNIT_FAMILY[toUnit].factorToBase;
  // Preserve up to 6 decimals internally if converting small grams to kg (e.g., 50g = 0.05kg), then round to 3dp for display/stock
  return Math.round((converted + Number.EPSILON) * 1000000) / 1000000;
}

export function calculateUnitAwarePrice(
  productUnitPrice: number,
  productBaseUnit: SellingUnit,
  enteredQty: number,
  enteredUnit: SellingUnit = productBaseUnit
): { baseQuantity: number; lineAmount: number } {
  const safeBaseQty = convertCompatibleQuantity(
    enteredQty,
    enteredUnit,
    productBaseUnit
  );
  return {
    baseQuantity: roundQuantity(safeBaseQty),
    lineAmount: roundCurrency(productUnitPrice * safeBaseQty),
  };
}

export interface UnitQuickShortcut {
  label: string;
  quantity: number;
  unit: SellingUnit;
}

/** Optional non-forced convenience chips for fractional billing (cashier can always enter any decimal directly). */
export function getOptionalUnitShortcuts(productUnit: SellingUnit): UnitQuickShortcut[] {
  switch (productUnit) {
    case 'kg':
      return [
        { label: '50g', quantity: 50, unit: 'g' },
        { label: '80g', quantity: 80, unit: 'g' },
        { label: '125g', quantity: 125, unit: 'g' },
        { label: '0.25kg', quantity: 0.25, unit: 'kg' },
        { label: '0.5kg', quantity: 0.5, unit: 'kg' },
        { label: '1kg', quantity: 1, unit: 'kg' },
      ];
    case 'g':
      return [
        { label: '50g', quantity: 50, unit: 'g' },
        { label: '80g', quantity: 80, unit: 'g' },
        { label: '125g', quantity: 125, unit: 'g' },
        { label: '250g', quantity: 250, unit: 'g' },
      ];
    case 'litre':
      return [
        { label: '250ml', quantity: 250, unit: 'ml' },
        { label: '500ml', quantity: 500, unit: 'ml' },
        { label: '0.75L', quantity: 0.75, unit: 'litre' },
        { label: '1.5L', quantity: 1.5, unit: 'litre' },
      ];
    case 'ml':
      return [
        { label: '100ml', quantity: 100, unit: 'ml' },
        { label: '250ml', quantity: 250, unit: 'ml' },
        { label: '500ml', quantity: 500, unit: 'ml' },
      ];
    case 'metre':
      return [
        { label: '0.5m', quantity: 0.5, unit: 'metre' },
        { label: '1.5m', quantity: 1.5, unit: 'metre' },
        { label: '2m', quantity: 2, unit: 'metre' },
      ];
    case 'cm':
      return [
        { label: '25cm', quantity: 25, unit: 'cm' },
        { label: '50cm', quantity: 50, unit: 'cm' },
        { label: '100cm', quantity: 100, unit: 'cm' },
      ];
    default:
      return [];
  }
}
