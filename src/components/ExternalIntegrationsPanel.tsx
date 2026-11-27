import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  Link2Off,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
} from 'lucide-react';
import {
  connectWooCommerceApi,
  disconnectExternalIntegrationApi,
  fetchExternalIntegrationsApi,
  fetchIntegrationAuditLogsApi,
  generateCustomWebsiteCredentialsApi,
  requestShopifyOAuthUrlApi,
  syncExternalIntegrationApi,
  type ExternalIntegrationsOverview,
} from '../lib/posRepository';
import type {
  CustomWebsiteCredentialsResult,
  ExternalIntegrationSummary,
  IntegrationAuditLogEntry,
  IntegrationConnectionStatus,
  IntegrationProvider,
} from '../types';
import { formatDateTime } from '../i18n';

const DEV_SHOPIFY_CALLBACK =
  'https://ais-dev-hbpplwtzvqex64432xldip-339931245125.asia-east1.run.app/api/integrations/shopify/oauth/callback';
const SHARED_SHOPIFY_CALLBACK =
  'https://ais-pre-hbpplwtzvqex64432xldip-339931245125.asia-east1.run.app/api/integrations/shopify/oauth/callback';

function statusBadge(status: IntegrationConnectionStatus): { label: string; className: string } {
  switch (status) {
    case 'connected':
      return {
        label: 'Connected',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      };
    case 'pending_authorization':
      return {
        label: 'Pending Authorization',
        className: 'bg-amber-50 text-amber-800 border-amber-200',
      };
    case 'error':
      return {
        label: 'Attention Needed',
        className: 'bg-rose-50 text-rose-800 border-rose-200',
      };
    case 'disconnected':
      return {
        label: 'Disconnected',
        className: 'bg-slate-100 text-slate-700 border-slate-200',
      };
    default:
      return {
        label: 'Not Connected',
        className: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
}

export function ExternalIntegrationsPanel() {
  const [overview, setOverview] = useState<ExternalIntegrationsOverview | null>(null);
  const [auditLogs, setAuditLogs] = useState<IntegrationAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState('');
  const [feedbackSuccess, setFeedbackSuccess] = useState('');

  // Shopify form state
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [shopifyFallbackAuthUrl, setShopifyFallbackAuthUrl] = useState('');

  // WooCommerce form state
  const [wooUrl, setWooUrl] = useState('');
  const [wooKey, setWooKey] = useState('');
  const [wooSecret, setWooSecret] = useState('');
  const [wooWebhookSecret, setWooWebhookSecret] = useState('');

  // Custom Website form & one-time credential display
  const [customDomain, setCustomDomain] = useState('');
  const [customDisplayName, setCustomDisplayName] = useState('Custom Storefront');
  const [issuedCustomCreds, setIssuedCustomCreds] = useState<CustomWebsiteCredentialsResult | null>(
    null
  );
  const [copiedText, setCopiedText] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [ovRes, logRes] = await Promise.all([
      fetchExternalIntegrationsApi(),
      fetchIntegrationAuditLogsApi(),
    ]);
    if (ovRes.ok) {
      setOverview(ovRes.data);
    } else if (ovRes.ok === false) {
      setFeedbackError(ovRes.error);
    }
    if (logRes.ok) {
      setAuditLogs(logRes.logs);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Listen for Shopify OAuth popup postMessage completion
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; shop?: string; error?: string } | null;
      if (!data || typeof data.type !== 'string') return;
      if (data.type === 'SHOPIFY_OAUTH_SUCCESS') {
        setFeedbackError('');
        setShopifyFallbackAuthUrl('');
        setFeedbackSuccess(`Shopify store ${data.shop || ''} connected successfully.`);
        void loadAll();
      } else if (data.type === 'SHOPIFY_OAUTH_ERROR') {
        setFeedbackError(data.error || 'Shopify authorization did not complete.');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [loadAll]);

  const getProvider = (provider: IntegrationProvider): ExternalIntegrationSummary => {
    return (
      overview?.integrations.find((i) => i.provider === provider) || {
        provider,
        status: 'not_connected',
        displayName: provider,
        storeDomain: '',
        apiKeyMasked: '',
        scopes: [],
        lastSyncStatus: 'never',
      }
    );
  };

  const handleCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      setCopiedText(label);
      setTimeout(() => setCopiedText(''), 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const handleConnectShopify = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError('');
    setFeedbackSuccess('');
    setShopifyFallbackAuthUrl('');
    setBusyProvider('shopify');
    const res = await requestShopifyOAuthUrlApi(shopifyDomain.trim());
    setBusyProvider(null);
    if (res.ok === false) {
      setFeedbackError(res.error);
      return;
    }

    const openerFn = typeof window !== 'undefined' ? window['open'] : undefined;
    const popup =
      typeof openerFn === 'function'
        ? openerFn.call(
            window,
            res.authUrl,
            'smartbitz_shopify_oauth',
            'width=620,height=720,resizable=yes,scrollbars=yes'
          )
        : null;
    if (!popup) {
      setShopifyFallbackAuthUrl(res.authUrl);
      setFeedbackError(
        'Browser blocked the Shopify OAuth popup window. Use the direct authorization link below.'
      );
    }
  };

  const handleConnectWoo = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError('');
    setFeedbackSuccess('');
    setBusyProvider('woocommerce');
    const res = await connectWooCommerceApi({
      storeUrl: wooUrl.trim(),
      consumerKey: wooKey.trim(),
      consumerSecret: wooSecret.trim(),
      webhookSecret: wooWebhookSecret.trim() || undefined,
    });
    setBusyProvider(null);
    if (res.ok === false) {
      setFeedbackError(res.error);
      return;
    }
    setWooKey('');
    setWooSecret('');
    setWooWebhookSecret('');
    setFeedbackSuccess(`WooCommerce store ${res.integration.storeDomain} verified and connected.`);
    await loadAll();
  };

  const handleGenerateCustomCreds = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedbackError('');
    setFeedbackSuccess('');
    setBusyProvider('custom_website');
    const res = await generateCustomWebsiteCredentialsApi({
      storeDomain: customDomain.trim(),
      displayName: customDisplayName.trim(),
    });
    setBusyProvider(null);
    if (res.ok === false) {
      setFeedbackError(res.error);
      return;
    }
    setIssuedCustomCreds(res.result);
    setFeedbackSuccess(
      'Generated custom website API key & HMAC signing secret. Copy the secret now—it will not be shown again.'
    );
    await loadAll();
  };

  const handleDisconnect = async (provider: IntegrationProvider) => {
    setFeedbackError('');
    setFeedbackSuccess('');
    setBusyProvider(provider);
    const res = await disconnectExternalIntegrationApi(provider);
    setBusyProvider(null);
    if (res.ok === false) {
      setFeedbackError(res.error);
      return;
    }
    if (provider === 'custom_website') {
      setIssuedCustomCreds(null);
    }
    setFeedbackSuccess(`Disconnected ${provider.replace('_', ' ')} integration.`);
    await loadAll();
  };

  const handleSync = async (provider: 'shopify' | 'woocommerce') => {
    setFeedbackError('');
    setFeedbackSuccess('');
    setBusyProvider(`sync:${provider}`);
    const res = await syncExternalIntegrationApi(provider);
    setBusyProvider(null);
    if (res.ok === false) {
      setFeedbackError(res.error);
      return;
    }
    setFeedbackSuccess(
      `Synced ${provider === 'shopify' ? 'Shopify' : 'WooCommerce'}: ${res.mappedProductsCount} SKU mapping(s), ${res.importedOrders} new order(s) imported.`
    );
    await loadAll();
  };

  const shopify = getProvider('shopify');
  const woo = getProvider('woocommerce');
  const custom = getProvider('custom_website');
  const waBusiness = getProvider('whatsapp_business');

  const shopifyBadge = statusBadge(shopify.status);
  const wooBadge = statusBadge(woo.status);
  const customBadge = statusBadge(custom.status);
  const waBadge = statusBadge(waBusiness.status);

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
            <h2 className="text-lg font-bold text-slate-900">
              External E-Commerce Integrations
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Connect an external storefront to import placed checkout orders into SmartBitz Omnichannel Order Management. Cart additions and draft checkouts are never imported.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Status
        </button>
      </div>

      {feedbackError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-xs font-medium flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{feedbackError}</span>
        </div>
      )}

      {feedbackSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 rounded-xl text-xs font-medium flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-700" />
          <span>{feedbackSuccess}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 1. SHOPIFY */}
        <div className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 bg-slate-50/40">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-lime-100 border border-lime-200 flex items-center justify-center text-lime-800">
                  <ShoppingBag className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Shopify Store</h3>
                  <p className="text-[11px] text-slate-500">
                    OAuth 2.0 + GraphQL Admin API + HMAC Webhooks
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold ${shopifyBadge.className}`}
              >
                {shopifyBadge.label}
              </span>
            </div>

            {shopify.status === 'connected' ? (
              <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                <p>
                  <span className="text-slate-500">Store:</span>{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {shopify.storeDomain}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Scopes:</span>{' '}
                  <span className="font-mono text-[11px] text-slate-700">
                    {shopify.scopes.join(', ') || 'read_orders, read_products, write_inventory'}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Mapped SKUs:</span>{' '}
                  <span className="font-semibold tabular-nums">
                    {shopify.mappedProductsCount ?? 0}
                  </span>
                  {shopify.lastSyncAt && (
                    <span className="text-slate-400">
                      {' '}
                      · Last sync {formatDateTime(shopify.lastSyncAt)}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <form onSubmit={handleConnectShopify} className="space-y-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Shopify Store Domain
                  </label>
                  <input
                    type="text"
                    required
                    value={shopifyDomain}
                    onChange={(e) => setShopifyDomain(e.target.value)}
                    placeholder="your-store.myshopify.com"
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                {!overview?.capabilities.shopifyOAuthAppConfigured && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    Shopify Partner App keys are not configured on the server yet. Status remains <strong>Not Connected</strong> until a shop owner authorizes a live Shopify store.
                  </p>
                )}
                {shopifyFallbackAuthUrl && (
                  <a
                    href={shopifyFallbackAuthUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:underline"
                  >
                    Authorize in Shopify <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={busyProvider === 'shopify'}
                    className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold"
                  >
                    {busyProvider === 'shopify' ? 'Preparing OAuth...' : 'Connect Shopify'}
                  </button>
                </div>
              </form>
            )}

            <details className="text-[11px] text-slate-600 bg-white border border-slate-200 rounded-lg p-2.5">
              <summary className="cursor-pointer font-semibold text-slate-700">
                Shopify Partner OAuth Callback URLs
              </summary>
              <div className="mt-2 space-y-1 font-mono text-[10px] break-all">
                <p>Dev: {DEV_SHOPIFY_CALLBACK}</p>
                <p>Prod/Shared: {SHARED_SHOPIFY_CALLBACK}</p>
              </div>
            </details>
          </div>

          {shopify.status === 'connected' && (
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => void handleSync('shopify')}
                disabled={busyProvider === 'sync:shopify'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${busyProvider === 'sync:shopify' ? 'animate-spin' : ''}`}
                />
                Sync Products & Orders
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect('shopify')}
                disabled={busyProvider === 'shopify'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold"
              >
                <Link2Off className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* 2. WOOCOMMERCE */}
        <div className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 bg-slate-50/40">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-800">
                  <Store className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">WooCommerce</h3>
                  <p className="text-[11px] text-slate-500">
                    REST API v3 + Encrypted Server Keys + Webhooks
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold ${wooBadge.className}`}
              >
                {wooBadge.label}
              </span>
            </div>

            {woo.status === 'connected' ? (
              <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1.5">
                <p>
                  <span className="text-slate-500">Store URL:</span>{' '}
                  <span className="font-mono font-semibold text-slate-900">{woo.storeDomain}</span>
                </p>
                <p>
                  <span className="text-slate-500">Consumer Key:</span>{' '}
                  <span className="font-mono text-slate-700">{woo.apiKeyMasked}</span>
                </p>
                <p>
                  <span className="text-slate-500">Mapped SKUs:</span>{' '}
                  <span className="font-semibold tabular-nums">{woo.mappedProductsCount ?? 0}</span>
                  {woo.lastSyncAt && (
                    <span className="text-slate-400">
                      {' '}
                      · Last sync {formatDateTime(woo.lastSyncAt)}
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <form onSubmit={handleConnectWoo} className="space-y-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    WooCommerce Store HTTPS URL
                  </label>
                  <input
                    type="url"
                    required
                    value={wooUrl}
                    onChange={(e) => setWooUrl(e.target.value)}
                    placeholder="https://yourstore.com"
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={wooKey}
                    onChange={(e) => setWooKey(e.target.value)}
                    placeholder="Consumer Key (ck_...)"
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                  />
                  <input
                    type="password"
                    required
                    value={wooSecret}
                    onChange={(e) => setWooSecret(e.target.value)}
                    placeholder="Consumer Secret (cs_...)"
                    className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                  />
                </div>
                <input
                  type="password"
                  value={wooWebhookSecret}
                  onChange={(e) => setWooWebhookSecret(e.target.value)}
                  placeholder="Optional Webhook Secret"
                  className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={busyProvider === 'woocommerce'}
                  className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {busyProvider === 'woocommerce' ? 'Verifying Store...' : 'Verify & Connect WooCommerce'}
                </button>
              </form>
            )}
          </div>

          {woo.status === 'connected' && (
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => void handleSync('woocommerce')}
                disabled={busyProvider === 'sync:woocommerce'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${busyProvider === 'sync:woocommerce' ? 'animate-spin' : ''}`}
                />
                Sync Products & Orders
              </button>
              <button
                type="button"
                onClick={() => void handleDisconnect('woocommerce')}
                disabled={busyProvider === 'woocommerce'}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold"
              >
                <Link2Off className="w-3.5 h-3.5" />
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* 3. CUSTOM WEBSITE API / WEBHOOK */}
        <div className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 bg-slate-50/40">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-800">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Custom Website Webhook</h3>
                  <p className="text-[11px] text-slate-500">
                    Per-shop API Key + HMAC-SHA256 Signed Checkout Ingest
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold ${customBadge.className}`}
              >
                {customBadge.label}
              </span>
            </div>

            {issuedCustomCreds && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 space-y-2 text-[11px]">
                <p className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5" />
                  Save These Credentials Now (Shown Once)
                </p>
                <div className="space-y-1 font-mono">
                  <div className="flex items-center justify-between gap-2 bg-white px-2 py-1 rounded border border-emerald-200">
                    <span className="truncate">API Key: {issuedCustomCreds.apiKey}</span>
                    <button
                      type="button"
                      onClick={() => void handleCopy('apiKey', issuedCustomCreds.apiKey)}
                      className="text-teal-700 font-sans font-semibold shrink-0 inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedText === 'apiKey' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 bg-white px-2 py-1 rounded border border-emerald-200">
                    <span className="truncate">Secret: {issuedCustomCreds.webhookSecret}</span>
                    <button
                      type="button"
                      onClick={() => void handleCopy('secret', issuedCustomCreds.webhookSecret)}
                      className="text-teal-700 font-sans font-semibold shrink-0 inline-flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedText === 'secret' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {custom.status === 'connected' && (
              <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                <p>
                  <span className="text-slate-500">Active Key:</span>{' '}
                  <span className="font-mono font-semibold text-slate-900">
                    {custom.apiKeyMasked}
                  </span>
                </p>
                {overview?.capabilities.customWebhookUrl && (
                  <p className="text-[11px] font-mono text-slate-600 break-all">
                    POST {overview.capabilities.customWebhookUrl}
                  </p>
                )}
                <p className="text-[11px] text-slate-500">
                  Headers: <code className="font-mono">X-SmartBitz-Key</code> &{' '}
                  <code className="font-mono">X-SmartBitz-Signature: sha256=...</code>
                </p>
              </div>
            )}

            <form onSubmit={handleGenerateCustomCreds} className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={customDisplayName}
                  onChange={(e) => setCustomDisplayName(e.target.value)}
                  placeholder="Website label"
                  className="w-full h-9 px-3 text-xs bg-white border border-slate-200 rounded-lg"
                />
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="Domain (optional, e.g. shop.pk)"
                  className="w-full h-9 px-3 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="submit"
                  disabled={busyProvider === 'custom_website'}
                  className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  {custom.status === 'connected' ? 'Rotate API Key & Secret' : 'Generate API Key & Secret'}
                </button>
                {custom.status === 'connected' && (
                  <button
                    type="button"
                    onClick={() => void handleDisconnect('custom_website')}
                    disabled={busyProvider === 'custom_website'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 text-rose-700 hover:bg-rose-50 text-xs font-semibold"
                  >
                    <Link2Off className="w-3.5 h-3.5" />
                    Revoke
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>

        {/* 4. OFFICIAL WHATSAPP BUSINESS CLOUD API STATUS */}
        <div className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4 bg-slate-50/40">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    WhatsApp Business Cloud API
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Official Meta Cloud API Connector (Personal WhatsApp Unsupported)
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold ${waBadge.className}`}
              >
                {waBadge.label}
              </span>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3.5 text-xs space-y-2 text-slate-700">
              <div className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                <p>
                  Personal WhatsApp accounts are <strong>not</strong> automated or linked via QR scraping. Automated inbound/outbound messaging requires an approved <strong>Meta Business / WhatsApp Business Cloud API</strong> account.
                </p>
              </div>
              <p className="text-[11px] text-slate-600">
                • Manual <code className="font-mono">wa.me</code> customer order links & receipts remain active with zero setup required.
              </p>
              <p className="text-[11px] text-slate-600">
                • Server Cloud API status:{' '}
                <strong>
                  {overview?.capabilities.whatsappCloudConfigured
                    ? 'Meta Access Token Configured'
                    : 'Not Configured (Meta Cloud API server credentials unset)'}
                </strong>
              </p>
              {waBusiness.storeDomain && (
                <p className="text-[11px] text-slate-600">
                  • Shop Phone Number ID:{' '}
                  <span className="font-mono font-semibold">{waBusiness.storeDomain}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Integration Audit Trail */}
      {auditLogs.length > 0 && (
        <div className="pt-3 border-t border-slate-200 space-y-2">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
            Recent Integration Activity
          </h3>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white max-h-48 overflow-y-auto text-xs">
            {auditLogs.slice(0, 8).map((log) => (
              <div key={log.id} className="px-3.5 py-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 capitalize">
                    {log.provider.replace('_', ' ')}
                  </span>{' '}
                  <span className="text-slate-600">· {log.details}</span>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">
                  {formatDateTime(log.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
