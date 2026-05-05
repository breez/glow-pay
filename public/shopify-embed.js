/**
 * Glow Pay — Shopify in-page checkout embed.
 *
 * Drop this on the Shopify Order Status Page via:
 *   <div data-glow-pay-shopify data-shop="…" data-order="…"></div>
 *   <script src="https://glow-pay.co/shopify-embed.js" defer></script>
 *
 * Renders the BOLT11 invoice + QR code directly in the page, polls
 * payment status, and reloads once paid (Glow Pay marks the Shopify
 * order paid via Admin API on the server side).
 */
(function () {
  'use strict'

  var GLOW_PAY_ORIGIN = 'https://glow-pay.co'
  var POLL_MS = 2500

  function init() {
    var mount = document.querySelector('[data-glow-pay-shopify]')
    if (!mount) return
    var shop = mount.getAttribute('data-shop')
    var orderId = mount.getAttribute('data-order')
    if (!shop || !orderId) return

    renderShell(mount)
    loadQrLib(function () {
      fetchPayment(shop, orderId, mount)
    })
  }

  function loadQrLib(cb) {
    if (window.qrcode) return cb()
    var s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js'
    s.onload = cb
    s.onerror = function () {
      console.error('[glow-pay] failed to load QR library')
      cb()
    }
    document.head.appendChild(s)
  }

  function fetchPayment(shop, orderId, mount) {
    var url = GLOW_PAY_ORIGIN + '/api/shopify/order-payment?shop=' + encodeURIComponent(shop) + '&order=' + encodeURIComponent(orderId)
    fetch(url)
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j } }) })
      .then(function (res) {
        if (!res.ok || !res.body || !res.body.success) {
          throw new Error((res.body && res.body.error) || 'Failed to load payment')
        }
        var d = res.body.data
        if (d.paid) {
          renderPaid(mount)
          return
        }
        renderInvoice(mount, d)
        if (d.status === 'completed') {
          renderPaid(mount)
        } else {
          poll(mount, d.paymentId)
        }
      })
      .catch(function (err) {
        renderError(mount, err.message || String(err))
      })
  }

  function poll(mount, paymentId) {
    var stopped = false
    function tick() {
      if (stopped) return
      fetch(GLOW_PAY_ORIGIN + '/api/payments/' + paymentId)
        .then(function (r) { return r.json() })
        .then(function (j) {
          var status = j && j.data && j.data.status
          if (status === 'completed') {
            stopped = true
            renderPaid(mount)
            setTimeout(function () { location.reload() }, 2000)
          } else if (status === 'expired') {
            stopped = true
            renderExpired(mount)
          }
        })
        .catch(function () { /* swallow, keep polling */ })
        .then(function () {
          if (!stopped) setTimeout(tick, POLL_MS)
        })
    }
    setTimeout(tick, POLL_MS)
  }

  // ---------- rendering ----------

  function styles() {
    return [
      '.gp-card{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;border:1px solid #e5e7eb;border-radius:14px;padding:24px;background:#fff;max-width:420px;margin:24px auto;}',
      '.gp-h{margin:0 0 4px;font-size:18px;color:#111827;font-weight:600;}',
      '.gp-amt{color:#6b7280;font-size:14px;margin:0 0 18px;}',
      '.gp-qr{display:flex;justify-content:center;background:#fff;padding:12px;border:1px solid #e5e7eb;border-radius:10px;}',
      '.gp-qr img{width:240px;height:240px;display:block;image-rendering:pixelated;}',
      '.gp-status{text-align:center;color:#6b7280;font-size:14px;margin:18px 0 0;display:flex;align-items:center;justify-content:center;gap:8px;}',
      '.gp-spin{width:14px;height:14px;border:2px solid #e5e7eb;border-top-color:#a855f7;border-radius:50%;animation:gp-spin 1s linear infinite;}',
      '@keyframes gp-spin{to{transform:rotate(360deg);}}',
      '.gp-paid{color:#059669;font-weight:600;}',
      '.gp-err{color:#dc2626;font-weight:500;}',
      '.gp-actions{display:flex;gap:8px;margin-top:14px;}',
      '.gp-btn{flex:1;padding:10px 14px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;color:#111827;font-size:13px;font-weight:500;cursor:pointer;text-align:center;text-decoration:none;display:inline-block;}',
      '.gp-btn:hover{background:#f3f4f6;}',
      '.gp-btn-primary{background:#a855f7;color:#fff;border-color:#a855f7;}',
      '.gp-btn-primary:hover{background:#9333ea;}',
      '.gp-inv{margin-top:12px;}',
      '.gp-inv summary{cursor:pointer;color:#6b7280;font-size:13px;list-style:none;}',
      '.gp-inv summary::-webkit-details-marker{display:none;}',
      '.gp-inv textarea{width:100%;font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;padding:8px;margin-top:8px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;box-sizing:border-box;resize:none;}',
    ].join('\n')
  }

  function renderShell(mount) {
    if (document.getElementById('glow-pay-styles')) return
    var s = document.createElement('style')
    s.id = 'glow-pay-styles'
    s.textContent = styles()
    document.head.appendChild(s)
    mount.innerHTML = '<div class="gp-card"><div class="gp-status"><span class="gp-spin"></span><span>Preparing your invoice…</span></div></div>'
  }

  function renderInvoice(mount, p) {
    var qrSvg = ''
    if (window.qrcode) {
      try {
        var qr = window.qrcode(0, 'L')
        qr.addData((p.invoice || '').toUpperCase())
        qr.make()
        qrSvg = qr.createImgTag(5, 0)
      } catch (e) {
        console.error('[glow-pay] QR render failed', e)
      }
    }
    var sats = (p.amountSats || 0).toLocaleString()
    var lnUri = 'lightning:' + p.invoice
    mount.innerHTML =
      '<div class="gp-card">' +
        '<h2 class="gp-h">Pay with Bitcoin / Lightning</h2>' +
        '<p class="gp-amt">Amount: ' + sats + ' sats</p>' +
        '<a class="gp-qr" href="' + escapeAttr(lnUri) + '">' + (qrSvg || '<div style="padding:40px;color:#9ca3af;">QR unavailable</div>') + '</a>' +
        '<div class="gp-actions">' +
          '<button class="gp-btn" type="button" id="gp-copy">Copy invoice</button>' +
          '<a class="gp-btn gp-btn-primary" href="' + escapeAttr(lnUri) + '">Open wallet</a>' +
        '</div>' +
        '<details class="gp-inv"><summary>Show invoice text</summary>' +
          '<textarea readonly rows="3">' + escapeText(p.invoice || '') + '</textarea>' +
        '</details>' +
        '<div class="gp-status"><span class="gp-spin"></span><span>Waiting for payment…</span></div>' +
      '</div>'

    var copyBtn = document.getElementById('gp-copy')
    if (copyBtn) copyBtn.addEventListener('click', function () {
      try {
        navigator.clipboard.writeText(p.invoice)
        copyBtn.textContent = 'Copied!'
        setTimeout(function () { copyBtn.textContent = 'Copy invoice' }, 1500)
      } catch (e) { /* ignore */ }
    })
  }

  function renderPaid(mount) {
    mount.innerHTML = '<div class="gp-card"><div class="gp-status gp-paid">✓ Payment received! Updating order…</div></div>'
  }

  function renderExpired(mount) {
    mount.innerHTML = '<div class="gp-card"><div class="gp-status gp-err">Invoice expired. Refresh the page to generate a new one.</div></div>'
  }

  function renderError(mount, msg) {
    mount.innerHTML = '<div class="gp-card"><div class="gp-status gp-err">Couldn\'t load payment: ' + escapeText(msg) + '</div></div>'
  }

  function escapeText(s) { return String(s).replace(/[<>&]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] }) }
  function escapeAttr(s) { return String(s).replace(/[<>&"]/g, function (c) { return { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] }) }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
