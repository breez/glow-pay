# Glow Pay

The simplest way to accept bitcoin payments on your website. No server is required. Non-custodial Lightning payments powered by Breez SDK.

## Features

- **Non-Custodial**: Funds go directly to your wallet, you control your keys
- **Integrated Wallet**: Create a Lightning wallet with a 12-word recovery phrase
- **Lightning Fast**: Instant settlement via Lightning
- **REST API**: Create and verify payments programmatically
- **Webhooks**: Get notified on payment events with HMAC-SHA256 signed payloads
- **Checkout Branding**: Custom logo, colors, and background on payment pages
- **Sweep Funds**: Send your full balance to any Lightning address
- **Point of Sale**: Mobile-first POS page for in-person payments, installable as a PWA

## How It Works

1. **Setup**: Create a Lightning wallet with a `@breez.cash` Lightning address
2. **Create Payment**: Generate a payment link from the dashboard or via the API
3. **Customer Pays**: Customer scans the QR code with any Lightning wallet
4. **Verification**: Payment is confirmed automatically via LNURL-verify
5. **Webhook + Redirect**: Your server is notified and the customer is redirected

## Tech Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- Breez SDK (WASM) — full Lightning wallet in the browser
- Vercel serverless functions + Upstash Redis
- LNURL-pay / LNURL-verify protocols
- BIP-39 mnemonic generation

## Development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Project Structure

```
src/
  pages/
    LandingPage.tsx          # Public landing page
    SetupWizard.tsx          # Account creation / restore flow
    CheckoutPage.tsx         # Customer-facing payment page
    pos/
      POSPage.tsx            # POS state machine (idle → charging → paid)
      components/            # Keypad, Items, Cart, Charging, Receipt
    dashboard/
      DashboardLayout.tsx    # Sidebar + mobile nav shell
      DashboardHome.tsx      # Balance overview + recent activity
      DashboardPayments.tsx  # Payment list + management
      DashboardCreatePayment.tsx
      DashboardIntegration.tsx   # API keys, webhooks, API docs
      DashboardSettings.tsx      # Branding + wallet (sweep funds)
  lib/
    store.ts                 # localStorage persistence
    auth.ts                  # Mnemonic-derived merchant ID + auth token
    api-client.ts            # Client-side API helpers
    lnurl.ts                 # LNURL utilities
    types.ts                 # Shared types
    pos-store.ts             # POS item catalog (localStorage)
    pos-csv.ts               # CSV import/export for items
    use-exchange-rate.ts     # BTC/USD rate hook (Yadio API)
    wallet/
      walletService.ts       # SDK connection, balance, sweep funds
      WalletContext.tsx       # React context, event handling, reconnection

api/                         # Vercel serverless functions
  payments.ts                # POST /api/payments, GET /api/payments/:id
  merchants.ts               # POST /api/merchants, GET /api/merchants
  pos/[merchantId].ts        # GET/POST /api/pos/:merchantId (POS charges)
  _lib/
    auth.ts                  # Server-side auth verification
    redis.ts                 # Upstash Redis client
    webhook.ts               # Webhook delivery + signing
```

## API

### Create a Payment

```bash
curl -X POST https://your-domain.vercel.app/api/payments \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"amountSats": 5000, "description": "Invoice #1042"}'
```

Returns `paymentId`, `paymentUrl`, `invoice` (BOLT-11), and `expiresAt`.

### Check Payment Status

```bash
curl https://your-domain.vercel.app/api/payments/PAYMENT_ID
```

No authentication required.

### Webhooks

Configure a webhook URL in the Integration tab. Events:

- `payment.created` — new payment request
- `payment.completed` — payment settled
- `payment.expired` — invoice expired

All webhooks are signed with HMAC-SHA256 via the `X-Glow-Signature` header.

## Point of Sale (POS)

A mobile-first POS interface for accepting in-person Lightning payments. Enable it from **Settings > Point of Sale** in the dashboard.

### How it works

1. **Enable POS** in Settings — a public URL is generated: `glow-pay.co/pos/:merchantId`
2. **Open on any device** — phone, tablet, or counter display. Install as a PWA via "Add to Home Screen"
3. **Charge customers** using the keypad (manual amount) or items catalog (pre-configured menu)
4. **Customer scans** the QR code with any Lightning wallet
5. **Receipt** is shown on confirmation — printable via the browser's print dialog

### Features

- **Keypad + Items tabs** — manual amount entry or tap-to-add from a catalog
- **Item catalog** — name, price, emoji, SKU. Stored locally on the device
- **CSV import/export** — bulk manage items via the overflow menu
- **Cart** — quantity controls, running total, clear all
- **SAT/USD toggle** — live exchange rate from Yadio API (same source as Breez SDK)
- **No authentication required** — the POS page is public. Only the "Enable POS" toggle in Settings requires merchant access
- **Printable receipts** — optimized for thermal printers (80mm width)

### POS API

Create a charge without authentication (POS must be enabled for the merchant):

```bash
curl -X POST https://glow-pay.co/api/pos/MERCHANT_ID \
  -H "Content-Type: application/json" \
  -d '{"amountSats": 5000, "description": "Coffee", "items": [{"name": "Espresso", "quantity": 2, "priceSats": 2500}]}'
```

POS payments appear in the dashboard with `source: "pos"` in their metadata.

## Security

- Recovery phrase stored in localStorage (browser-only)
- Merchant ID and auth token are derived deterministically from the mnemonic (HMAC-SHA256)
- Auth token is never stored on the server — only its SHA-256 hash
- API keys can be created and revoked individually from the dashboard
- Never share your 12-word recovery phrase

## Based On

Integrates wallet functionality from [breez/glow-web](https://github.com/breez/glow-web), a demo app showing Breez SDK WebAssembly integration.

## License

MIT
