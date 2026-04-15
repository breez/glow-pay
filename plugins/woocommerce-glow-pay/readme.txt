=== Glow Pay for WooCommerce ===
Contributors: breez
Tags: bitcoin, lightning, payments, woocommerce, cryptocurrency
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 0.1.0
License: MIT

Accept Bitcoin and Lightning payments on your WooCommerce store via Glow Pay.

== Description ==

Glow Pay for WooCommerce adds a "Bitcoin / Lightning" payment method to your
WooCommerce checkout, powered by Glow Pay (glow-pay.co). Customers pay with any
Lightning wallet. Orders are marked paid automatically via webhook.

Features:

* Self-custodial — the merchant's keys never leave their device
* Live fiat-to-sats conversion at checkout time
* Hosted checkout page with QR code + invoice
* Webhook-driven order confirmation
* Per-order metadata tagging

== Installation ==

1. Upload the plugin folder to `/wp-content/plugins/`
2. Activate through the 'Plugins' menu in WordPress
3. Go to WooCommerce → Settings → Payments → Bitcoin / Lightning (Glow Pay)
4. Enter your Glow Pay API key and webhook secret
5. In your Glow Pay dashboard, set the Redirect URL and Webhook URL shown in the plugin settings

== Changelog ==

= 0.1.0 =
* Initial release
