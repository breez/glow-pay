# Glow Pay

Bitcoin/Lightning payment SaaS — React + TypeScript + Vite, Tailwind v4, Breez Spark SDK.

## Development

```bash
source /home/roys/.nvm/nvm.sh   # nvm required
npm run dev                      # Vite dev server (frontend only)
npm run build                    # tsc -b && vite build (strict — catches unused imports)
```

For API testing, run both servers:
```bash
npx vercel dev --yes --listen 3000   # API (serverless functions)
# Add proxy to vite.config.ts: proxy: { '/api': 'http://localhost:3000' }
npm run dev                          # Frontend on :5173, proxies /api to :3000
# Remove proxy before committing
```

## Architecture

- **Frontend**: SPA with React Router. Pages in `src/pages/`, libs in `src/lib/`
- **API**: Vercel serverless functions in `api/`. Upstash Redis for storage
- **Auth**: BIP-39 mnemonic → HMAC-SHA256 → merchant ID + auth token. No server sessions
- **Payments**: LNURL-pay protocol. Invoice via breez.cash, verification via LNURL-verify
- **POS**: Public page at `/pos/:merchantId`. No auth needed (checks `posEnabled` flag)

## Key patterns

- `getMerchant()` from `src/lib/store.ts` — localStorage-based merchant config
- `createPaymentViaApi()` / `getPaymentFromApi()` in `src/lib/api-client.ts`
- Payment polling: `setInterval(checkPayment, 2000)` pattern (see CheckoutPage, POSCharging)
- Tailwind theme: `glow-400` (purple), `surface-900/800/700` (dark), `bitcoin` (orange)

## COEP/COOP headers

`vercel.json` sets `Cross-Origin-Embedder-Policy: require-corp` on most routes (needed for Breez SDK WASM). Excluded: `/api/`, `/og-image.png`, `/pos/` (POS doesn't use WASM and needs cross-origin merchant logos).

## POS specifics

- Exchange rate: Yadio API `/exrates/BTC` → `.BTC.USD`. NOT `/rate/USD` (that returns VES/USD)
- Items stored in localStorage (`glow_pos_items`). Each item has `priceSats` and optional `priceUsd`
- USD-priced items convert to sats at charge time using live rate, not the rate from save time
- PWA manifest is dynamic (blob URL in POSPage.tsx) so `start_url` includes the merchant ID
- Receipt line items show original currency per item

## Test merchant

- Mnemonic: `cheese lazy clever cherry impulse hazard net acquire island survey gospel oil`
- Merchant ID: `m_e2477a6a7962beba`
- API Key: `glow_za6ZyeHA2R3eypRk33RaQGXhpNQECsIr`
