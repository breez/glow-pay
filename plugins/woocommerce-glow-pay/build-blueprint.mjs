// Builds a WordPress Playground blueprint with all plugin files inlined.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('.', import.meta.url).pathname;
const PLUGIN_SLUG = 'woocommerce-glow-pay';

const FILES = [
  'woocommerce-glow-pay.php',
  'readme.txt',
  'includes/class-glow-pay-api.php',
  'includes/class-wc-glow-pay-gateway.php',
  'includes/class-glow-pay-endpoints.php',
];

const mkdirSteps = [
  { step: 'mkdir', path: `/wordpress/wp-content/plugins/${PLUGIN_SLUG}` },
  { step: 'mkdir', path: `/wordpress/wp-content/plugins/${PLUGIN_SLUG}/includes` },
];

const writeFileSteps = FILES.map((rel) => ({
  step: 'writeFile',
  path: `/wordpress/wp-content/plugins/${PLUGIN_SLUG}/${rel}`,
  data: readFileSync(join(ROOT, rel), 'utf8'),
}));

const forceClassicCheckoutPhp = `<?php
require_once '/wordpress/wp-load.php';

// Force classic shortcode-based checkout + cart pages so the Playwright test
// (and anyone used to classic WC fields) can interact with them normally.
$pairs = array(
  'checkout' => '[woocommerce_checkout]',
  'cart'     => '[woocommerce_cart]',
  'shop'     => '',
);
foreach ( $pairs as $slug => $content ) {
  $page_id = (int) wc_get_page_id( $slug );
  if ( $page_id > 0 ) {
    wp_update_post( array(
      'ID'           => $page_id,
      'post_content' => $content,
    ) );
  }
}

// Dismiss the WC onboarding/setup wizard so /wp-admin/ doesn't redirect into it.
update_option( 'woocommerce_onboarding_profile', array( 'completed' => true ) );
update_option( 'woocommerce_task_list_hidden', 'yes' );
update_option( 'woocommerce_task_list_welcome_modal_dismissed', 'yes' );
delete_transient( '_wc_activation_redirect' );

// Disable WC 9's "Coming Soon" mode — its sticky banner intercepts clicks.
update_option( 'woocommerce_coming_soon', 'no' );
update_option( 'woocommerce_store_pages_only', 'no' );
`;

const blueprint = {
  landingPage: '/wp-admin/admin.php?page=wc-settings&tab=checkout&section=glow_pay',
  preferredVersions: { php: '8.2', wp: 'latest' },
  phpExtensionBundles: ['kitchen-sink'],
  steps: [
    { step: 'login', username: 'admin', password: 'password' },
    {
      step: 'installPlugin',
      pluginData: { resource: 'wordpress.org/plugins', slug: 'woocommerce' },
      options: { activate: true },
    },
    ...mkdirSteps,
    ...writeFileSteps,
    { step: 'activatePlugin', pluginPath: `${PLUGIN_SLUG}/${PLUGIN_SLUG}.php` },
    { step: 'runPHP', code: forceClassicCheckoutPhp },
  ],
};

writeFileSync(join(ROOT, 'blueprint.json'), JSON.stringify(blueprint, null, 2));
console.log(`Wrote blueprint.json — ${Object.keys(blueprint.steps).length} steps, ${JSON.stringify(blueprint).length} bytes`);
