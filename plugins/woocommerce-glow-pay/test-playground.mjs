// End-to-end smoke test of the WooCommerce plugin against WordPress Playground.
// Boots Playground, configures the gateway, creates a product, places an order,
// captures the Lightning invoice, then waits for the user to pay it (polling
// the glow-pay API), finally hits the plugin's return URL and verifies the WC
// order is marked paid.
//
// Usage: DISPLAY=:0 node test-playground.mjs           (headful, fiat mode)
//        HEADLESS=1 node test-playground.mjs           (headless)
//        MODE=sats node test-playground.mjs            (price product in sats)
//        SKIP_PAY=1 node test-playground.mjs           (stop after payment created — no manual invoice payment needed)

import { chromium } from '/home/roys/ksp-deals/node_modules/playwright/index.mjs';

const BLUEPRINT_URL =
  'https://gist.githubusercontent.com/kingonly/adcb18a8a48950a299448071e2425057/raw/e43ab37ebdf5e213a355e6556a634a78442a9d78/blueprint.json';
const PLAYGROUND_URL =
  'https://playground.wordpress.net/?blueprint-url=' + encodeURIComponent(BLUEPRINT_URL);

const GLOW_API_KEY = 'glow_MrG3ysRCQoRrlUkVLsQzS6wJbtdAT6p8';
const WEBHOOK_SECRET = 'test-secret-not-used-in-playground';

function log(msg) {
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function waitForWpFrame(page, timeoutMs = 180000) {
  // The Playground mounts a nested iframe named "wp" that starts at about:blank
  // and then navigates to /scope:<slug>/wp-admin/... once ready.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const wp = page.frames().find((f) => f.name() === 'wp' && f.url().includes('/scope:'));
    if (wp) return wp;
    await page.waitForTimeout(1000);
  }
  throw new Error('Timed out waiting for wp frame to load');
}

// Build a scoped URL from the wp frame's current URL. Playground paths are
// prefixed with /scope:<slug> — pass a WP path like /wp-admin/… and this
// returns the full origin + scoped path.
function scopedUrl(wpFrame, wpPath) {
  const current = new URL(wpFrame.url());
  const scopeMatch = current.pathname.match(/^\/(scope:[^/]+)/);
  const scope = scopeMatch ? scopeMatch[1] : '';
  return `${current.origin}/${scope}${wpPath}`;
}

async function gotoWp(wpFrame, wpPath) {
  const url = scopedUrl(wpFrame, wpPath);
  await wpFrame.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
}

async function waitForPayment(paymentId, timeoutMs = 10 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = '';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`https://glow-pay.co/api/payments/${paymentId}`);
      const json = await res.json();
      const status = json?.data?.status;
      if (status && status !== lastStatus) {
        log(`  payment status: ${status}`);
        lastStatus = status;
      }
      if (status === 'completed') return true;
      if (status === 'expired' || status === 'failed') return false;
    } catch (e) {
      log(`  poll error: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function main() {
  const headless = process.env.HEADLESS === '1';
  const mode = (process.env.MODE || 'fiat').toLowerCase();
  const skipPay = process.env.SKIP_PAY === '1';
  if (mode !== 'fiat' && mode !== 'sats') {
    throw new Error(`Unknown MODE=${mode} (expected 'fiat' or 'sats')`);
  }
  log(`Mode: ${mode}  skipPay: ${skipPay}`);
  log(`Launching Chromium (headless=${headless})…`);
  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 50 });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();

  page.on('pageerror', (err) => log(`  [pageerror] ${err.message}`));

  log('Opening Playground…');
  await page.goto(PLAYGROUND_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  log('Waiting for wp frame to load (blueprint takes ~30s)…');
  let wpFrame = await waitForWpFrame(page);
  log(`  wp frame loaded: ${wpFrame.url().slice(0, 100)}`);

  log('Navigating to Glow Pay settings (bypassing WC setup wizard)…');
  await gotoWp(wpFrame, '/wp-admin/admin.php?page=wc-settings&tab=checkout&section=glow_pay');
  // WC may redirect back to setup wizard; if so, disable that and retry.
  await wpFrame.waitForTimeout(2000);
  if (!wpFrame.url().includes('section=glow_pay')) {
    log('  WC setup wizard interception; dismissing and retrying…');
    await gotoWp(wpFrame, '/wp-admin/admin.php?page=wc-admin&path=/setup-wizard');
    // Click "Skip setup" if present, otherwise navigate again.
    await wpFrame.waitForTimeout(2000);
    await gotoWp(wpFrame, '/wp-admin/admin.php?page=wc-settings&tab=checkout&section=glow_pay');
  }

  log('Waiting for plugin settings form…');
  await wpFrame.waitForSelector('input[name="woocommerce_glow_pay_enabled"]', { timeout: 60000 });
  log('  ✓ Settings page open');

  log('Filling plugin settings…');
  const enabledCheckbox = wpFrame.locator('input[name="woocommerce_glow_pay_enabled"]');
  if (!(await enabledCheckbox.isChecked())) {
    await enabledCheckbox.check();
  }
  await wpFrame.fill('input[name="woocommerce_glow_pay_api_key"]', GLOW_API_KEY);
  await wpFrame.fill('input[name="woocommerce_glow_pay_webhook_secret"]', WEBHOOK_SECRET);
  await wpFrame.click('button[name="save"]');
  await wpFrame.waitForSelector('#message.updated, .notice-success, .updated.notice', { timeout: 30000 });
  log('  ✓ Settings saved');

  if (mode === 'sats') {
    log('Switching store currency to SATS (WC → General)…');
    await gotoWp(wpFrame, '/wp-admin/admin.php?page=wc-settings&tab=general');
    await wpFrame.waitForSelector('select[name="woocommerce_currency"]', { timeout: 30000 });
    // Verify the currency option is actually registered by our plugin.
    const hasSats = await wpFrame.$eval(
      'select[name="woocommerce_currency"]',
      (sel) => Array.from(sel.options).some((o) => o.value === 'SATS'),
    );
    if (!hasSats) {
      throw new Error('SATS not present in WC currency dropdown — plugin filter failed');
    }
    await wpFrame.selectOption('select[name="woocommerce_currency"]', 'SATS');
    await wpFrame.click('button[name="save"]');
    await wpFrame.waitForSelector('#message.updated, .notice-success, .updated.notice', { timeout: 30000 });
    log('  ✓ Store currency set to SATS');
  }

  log('Creating a test product…');
  await gotoWp(wpFrame, '/wp-admin/post-new.php?post_type=product');
  await wpFrame.waitForSelector('#title', { timeout: 30000 });
  await wpFrame.fill('#title', mode === 'sats' ? 'Test Product (sats)' : 'Test Product');
  await wpFrame.waitForSelector('#_regular_price', { timeout: 30000 });
  const productPrice = mode === 'sats' ? '1000' : '1.00';
  await wpFrame.fill('#_regular_price', productPrice);
  await wpFrame.click('#publish');
  await wpFrame.waitForSelector('#message.updated, .updated.notice', { timeout: 30000 });
  const editUrl = wpFrame.url();
  const productId = new URL(editUrl).searchParams.get('post');
  log(`  ✓ Product id: ${productId}`);

  log('Adding product to cart…');
  await gotoWp(wpFrame, `/?add-to-cart=${productId}`);
  await wpFrame.waitForLoadState('domcontentloaded');

  log('Navigating to checkout…');
  await gotoWp(wpFrame, '/checkout/');
  await wpFrame.waitForSelector('#billing_first_name', { timeout: 30000 });

  log('Filling billing fields…');
  await wpFrame.fill('#billing_first_name', 'Test');
  await wpFrame.fill('#billing_last_name', 'User');
  await wpFrame.fill('#billing_address_1', '1 Test St');
  await wpFrame.fill('#billing_city', 'Testville');
  await wpFrame.fill('#billing_postcode', '12345');
  await wpFrame.fill('#billing_phone', '5550000000');
  await wpFrame.fill('#billing_email', 'test@example.com');

  log('Selecting Glow Pay method…');
  await wpFrame.check('input[value="glow_pay"]');

  // Monkey-patch jQuery.ajax BEFORE clicking Place Order so we can capture
  // WC's glow-pay redirect and rewrite it to a scoped URL. Otherwise WC's JS
  // would `window.location = "https://glow-pay.co/..."` and the Playground
  // iframe would navigate cross-origin and die.
  log('Installing AJAX interceptor in wp frame…');
  await wpFrame.evaluate(() => {
    const $ = window.jQuery || window.$;
    if (!$ || !$.ajax) return;
    const origAjax = $.ajax;
    $.ajax = function (opts) {
      if (opts && typeof opts === 'object') {
        const origSuccess = opts.success;
        opts.success = function (data, ...rest) {
          if (
            data &&
            data.result === 'success' &&
            typeof data.redirect === 'string' &&
            data.redirect.includes('glow-pay.co')
          ) {
            window.__capturedGlowRedirect = data.redirect;
            // Stay inside the scoped Playground origin so the iframe stays alive.
            data.redirect = '/wp-admin/admin.php?page=wc-orders';
          }
          return origSuccess ? origSuccess.call(this, data, ...rest) : undefined;
        };
      }
      return origAjax.call(this, opts);
    };
  });

  log('Placing order…');
  await wpFrame.click('#place_order');

  log('Waiting for captured glow-pay redirect…');
  await wpFrame.waitForFunction(
    () => typeof window.__capturedGlowRedirect === 'string',
    null,
    { timeout: 60000 },
  );
  const glowUrl = await wpFrame.evaluate(() => window.__capturedGlowRedirect);
  log(`  captured: ${glowUrl}`);

  if (!glowUrl || !glowUrl.includes('glow-pay.co/pay/')) {
    throw new Error(`No glow-pay redirect from WC. Got: ${glowUrl || '(none)'}`);
  }

  const paymentId = glowUrl.match(/\/pay\/[^/]+\/([^/?#]+)/)?.[1];
  if (!paymentId) throw new Error(`Could not parse paymentId from ${glowUrl}`);
  log(`  ✓ Payment created: ${paymentId}`);

  log('Fetching invoice from glow-pay API…');
  const res = await fetch(`https://glow-pay.co/api/payments/${paymentId}`);
  const json = await res.json();
  const invoice = json?.data?.invoice;
  const amountSats = json?.data?.amountSats;
  if (!invoice) throw new Error('No invoice returned');

  console.log('\n========================================================================');
  console.log('  INVOICE TO PAY:');
  console.log('  Amount: ' + amountSats + ' sats');
  console.log('  BOLT11: ' + invoice);
  console.log('  Hosted checkout: ' + glowUrl);
  console.log('========================================================================\n');

  if (mode === 'sats') {
    if (amountSats !== 1000) {
      throw new Error(`SATS mode: expected amountSats=1000 (no conversion), got ${amountSats}`);
    }
    log('  ✓ SATS mode: amountSats matches product price verbatim (no Yadio conversion)');
  } else {
    if (!Number.isInteger(amountSats) || amountSats < 1) {
      throw new Error(`Fiat mode: expected positive integer amountSats, got ${amountSats}`);
    }
    log(`  ✓ Fiat mode: amountSats=${amountSats} (converted from $1.00)`);
  }

  if (skipPay) {
    log('SKIP_PAY=1 — stopping here, payment creation verified.');
    await browser.close();
    return;
  }

  // Open the glow-pay checkout in the system browser so the user can scan the QR.
  try {
    const { spawn } = await import('node:child_process');
    spawn('xdg-open', [glowUrl], { detached: true, stdio: 'ignore' }).unref();
    log('  opened glow-pay checkout in system browser');
  } catch {
    // best-effort
  }

  log('Waiting for you to pay the invoice (10 min timeout)…');
  const paid = await waitForPayment(paymentId);
  if (!paid) {
    log('❌ Payment not completed in time');
    await browser.close();
    process.exit(1);
  }
  log('  ✓ Payment confirmed on glow-pay side');

  log('Triggering WC return URL to finalize order…');
  await gotoWp(wpFrame, `/?wc-api=glow_pay_return&payment_id=${paymentId}`);
  await wpFrame.waitForLoadState('domcontentloaded');
  log(`  landed on: ${wpFrame.url()}`);

  log('Checking WC orders page…');
  await gotoWp(wpFrame, '/wp-admin/admin.php?page=wc-orders');
  await wpFrame.waitForSelector('.wp-list-table', { timeout: 30000 });
  const rowText = (await wpFrame.locator('.wp-list-table tbody tr').first().textContent()) || '';
  log(`  first order row: ${rowText.trim().replace(/\s+/g, ' ').slice(0, 200)}`);

  const lower = rowText.toLowerCase();
  if (lower.includes('processing') || lower.includes('completed')) {
    log('✅ Order is marked paid — end-to-end flow works');
  } else {
    log('⚠️  Order does not appear paid in admin');
  }

  await page.screenshot({ path: '/tmp/glow-pay-wc-orders.png', fullPage: true });
  log('Screenshot: /tmp/glow-pay-wc-orders.png');

  await browser.close();
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
