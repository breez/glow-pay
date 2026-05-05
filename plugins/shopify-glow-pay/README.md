# Glow Pay for Shopify

Accept Bitcoin and Lightning payments on your Shopify store via Glow Pay.

Unlike WooCommerce (where we drop a PHP gateway directly into the checkout),
Shopify locks down its checkout to approved payment partners. This integration
works around that with a **manual payment method + companion app**:

1. The customer chooses "Bitcoin / Lightning" at checkout (a manual payment
   method you configure in Shopify).
2. Shopify creates the order in `pending` state.
3. The order confirmation email contains a "Pay now" link → opens the
   Glow Pay checkout (BOLT11 invoice + QR).
4. Once the customer pays, Glow Pay calls Shopify's Admin API and marks
   the order as paid automatically.

## Prerequisites

- A Shopify store (any plan).
- A Glow Pay account at <https://glow-pay.co> with at least one API key.

## Install the app

1. Visit the install URL (your developer will share the App Store listing once
   live; until then, use the direct OAuth URL):

   ```
   https://glow-pay.co/api/shopify/install?shop=YOUR-STORE.myshopify.com
   ```

2. Approve the requested scopes (`read_orders`, `write_orders`).
3. After redirect, paste your Glow Pay API key on the connection page.
   You can find this at <https://glow-pay.co/dashboard/settings> → API keys.

## Configure the manual payment method

1. In Shopify admin: **Settings → Payments → Manual payment methods → Create
   custom payment method**.
2. Name: `Bitcoin / Lightning` (or whatever you prefer).
3. Additional details: leave blank — instructions will arrive via email.
4. Payment instructions: leave blank.
5. Save and **activate** the method.

## Add the "Pay now" link to your order confirmation email

1. **Settings → Notifications → Order confirmation → Edit code**.
2. Find a good location (e.g. above the order summary) and paste:

   ```liquid
   {% if financial_status == 'pending' %}
     <table style="margin: 24px 0;">
       <tr>
         <td style="background: #f59e0b; border-radius: 8px; padding: 14px 28px;">
           <a href="https://glow-pay.co/api/shopify/pay?shop={{ shop.permanent_domain }}&order={{ id }}"
              style="color: #000; font-weight: 600; text-decoration: none;">
             Pay with Bitcoin / Lightning
           </a>
         </td>
       </tr>
     </table>
   {% endif %}
   ```

3. Save the template.

You can use the same snippet in **Settings → Checkout → Order status page →
Additional content** if you'd like the link to also appear on the post-checkout
"Thank you" page.

## How payment flows

```
Customer  ──▶  Shopify checkout  ──▶  Order created (pending)
                                         │
                                         ▼
                                   Confirmation email
                                   "Pay with BTC/LN" link
                                         │
                                         ▼
            glow-pay.co/api/shopify/pay?shop=…&order=…
                                         │
                                         ▼
                            Glow Pay checkout (QR + invoice)
                                         │
                                         ▼
                                Customer pays via Lightning
                                         │
                                         ▼
                          Glow Pay → Shopify Admin API
                          Order marked as paid (financial_status)
```

## Pricing

If your store is priced in fiat (USD, EUR, etc.), Glow Pay converts the order
total to sats at the live BTC rate when the customer clicks "Pay now". Rate
source: Yadio.

If you prefer a fixed-currency-in-sats model, set your store currency to BTC
in Shopify (uncommon, but supported).

## Uninstall

Removing the app from **Settings → Apps and sales channels** revokes the
access token. Glow Pay automatically clears the stored installation when
Shopify fires the `app/uninstalled` webhook. Your Glow Pay account remains
intact.

## Server-side endpoints (for reference)

| Endpoint | Purpose |
|---|---|
| `GET /api/shopify/install` | OAuth entry point. Requires `?shop=` param. |
| `GET /api/shopify/callback` | OAuth callback. Stores access token. |
| `POST /api/shopify/link` | Binds shop ↔ Glow Pay API key. |
| `GET /api/shopify/pay` | Customer-facing. Creates payment, redirects to checkout. |
| `POST /api/shopify/webhooks/uninstalled` | Cleans up on uninstall. |

## Required Vercel environment variables

```
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
```
