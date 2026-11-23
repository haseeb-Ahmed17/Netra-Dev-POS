import type { Language } from '../types';

export interface CustomerDisplayLine {
  name: string;
  qtyLabel: string;
  lineTotal: number;
}

export interface CustomerDisplayPayload {
  storeName: string;
  lang: Language;
  items: CustomerDisplayLine[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  status: 'idle' | 'billing' | 'completed';
  lastReceiptNumber?: string;
  updatedAt: string;
}

const CHANNEL_NAME = 'khaas_pos_customer_display_v1';
const STORAGE_KEY = 'khaas_pos_customer_display_snapshot';

export function broadcastCustomerDisplay(payload: CustomerDisplayPayload): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    } catch {
      // ignore unsupported channel errors
    }
  }
}

export function subscribeCustomerDisplay(
  onUpdate: (payload: CustomerDisplayPayload) => void
): () => void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      onUpdate(JSON.parse(raw) as CustomerDisplayPayload);
    }
  } catch {
    // ignore
  }

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event) => {
        if (event.data) {
          onUpdate(event.data as CustomerDisplayPayload);
        }
      };
    } catch {
      channel = null;
    }
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        onUpdate(JSON.parse(e.newValue) as CustomerDisplayPayload);
      } catch {
        // ignore
      }
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    channel?.close();
    window.removeEventListener('storage', onStorage);
  };
}

export interface DesktopBridge {
  isElectron?: boolean;
  openCashDrawer?: () => Promise<{ ok: boolean; error?: string }>;
  openCustomerDisplay?: () => Promise<{ opened: boolean }>;
  printReceipt?: () => Promise<{ ok: boolean; error?: string | null }>;
  printSilent?: () => Promise<{ ok: boolean; error?: string }>;
  platform?: string;
}

declare global {
  interface Window {
    smartbitzDesktop?: DesktopBridge;
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }
}

export interface HardwareCapabilities {
  runtime: 'electron' | 'capacitor_ios' | 'capacitor_android' | 'web';
  hasCameraApi: boolean;
  hasWebSerial: boolean;
  hasDesktopDrawerBridge: boolean;
}

export function detectHardwareCapabilities(): HardwareCapabilities {
  if (typeof window === 'undefined') {
    return {
      runtime: 'web',
      hasCameraApi: false,
      hasWebSerial: false,
      hasDesktopDrawerBridge: false,
    };
  }
  const hasElectron = Boolean(window.smartbitzDesktop);
  const capPlatform = window.Capacitor?.getPlatform?.();
  const runtime: HardwareCapabilities['runtime'] = hasElectron
    ? 'electron'
    : capPlatform === 'ios'
    ? 'capacitor_ios'
    : capPlatform === 'android'
    ? 'capacitor_android'
    : 'web';

  return {
    runtime,
    hasCameraApi: Boolean(navigator?.mediaDevices?.getUserMedia),
    hasWebSerial: 'serial' in navigator,
    hasDesktopDrawerBridge: Boolean(window.smartbitzDesktop?.openCashDrawer),
  };
}

/**
 * Triggers cash drawer kick command (ESC p 0 25 250) through Electron desktop bridge
 * when available, or reports honest status when running in standard browser sandbox.
 */
export async function triggerCashDrawerKick(): Promise<{
  ok: boolean;
  mode: 'electron_bridge' | 'browser_print_notice';
  message: string;
}> {
  if (typeof window !== 'undefined' && window.smartbitzDesktop?.openCashDrawer) {
    const res = await window.smartbitzDesktop.openCashDrawer();
    return {
      ok: res.ok,
      mode: 'electron_bridge',
      message: res.ok
        ? 'Cash drawer kick pulse dispatched via desktop bridge.'
        : res.error || 'Desktop drawer bridge returned an error.',
    };
  }
  return {
    ok: false,
    mode: 'browser_print_notice',
    message:
      'Browser mode cannot send raw RJ11 pulses directly; enable auto-open cash drawer on your OS thermal printer driver or run inside the Windows Electron wrapper.',
  };
}
