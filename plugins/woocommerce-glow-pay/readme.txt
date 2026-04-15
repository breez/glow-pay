=== Glow Pay for WooCommerce ===
Contributors: breez
Tags: bitcoin, lightning, payments, woocommerce, cryptocurrency
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 0.2.0
License: MIT

Accept Bitcoin and Lightning payments on your WooCommerce store via Glow Pay.

== Description ==

Glow Pay for WooCommerce adds a "Bitcoin / Lightning" payment method to your
WooCommerce checkout, powered by Glow Pay (glow-pay.co). Customers pay with any
Lightning wallet. Orders are marked paid automatically via webhook.

Features:

* Self-custodial — the merchant's keys never leave their device
* Price in sats OR fiat — pick "Satoshis (sats)" as your store currency to list products directly in sats, or keep your usual fiat currency and let Glow Pay convert at checkout
* Live fiat-to-sats conversion at checkout time (when priced in fiat)
* Hosted checkout page with QR code + invoice
* Webhook-driven order confirmation
* Per-order metadata tagging

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate through the 'Plugins' menu in WordPress
3. Go to WooCommerce → Settings → Payments → Bitcoin / Lightning (Glow Pay)
4. Enter your Glow Pay API key and webhook secret
5. In your Glow Pay dashboard, set the Redirect URL and Webhook URL shown in the plugin settings

== Pricing in sats ==

Activating this plugin adds "Satoshis (sats)" to WooCommerce's currency list.
To list your prices in sats, go to WooCommerce → Settings → General and set
**Currency** to "Satoshis (sats)". The plugin automatically forces 0 decimals
while SATS is the active currency, so product prices are whole satoshis.

When SATS is the store currency, Glow Pay uses the order total as sats
directly — no exchange rate lookup, no rounding surprises.

== Changelog ==

= 0.2.0 =
* Add SATS as a selectable WooCommerce store currency for native sats-denominated pricing
* Skip fiat conversion when store currency is SATS

= 0.1.0 =
* Initial release
