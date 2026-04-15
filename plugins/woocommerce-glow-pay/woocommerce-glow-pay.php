<?php
/**
 * Plugin Name: Glow Pay for WooCommerce
 * Plugin URI: https://glow-pay.co
 * Description: Accept Bitcoin and Lightning payments on your WooCommerce store via Glow Pay.
 * Version: 0.2.0
 * Author: Breez
 * Author URI: https://breez.technology
 * License: MIT
 * Text Domain: woocommerce-glow-pay
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * WC requires at least: 7.0
 * WC tested up to: 9.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'WC_GLOW_PAY_VERSION', '0.2.0' );
define( 'WC_GLOW_PAY_PLUGIN_FILE', __FILE__ );
define( 'WC_GLOW_PAY_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

add_action( 'plugins_loaded', 'wc_glow_pay_init', 11 );

function wc_glow_pay_init() {
	if ( ! class_exists( 'WC_Payment_Gateway' ) ) {
		add_action( 'admin_notices', function () {
			echo '<div class="notice notice-error"><p>';
			echo esc_html__( 'Glow Pay for WooCommerce requires WooCommerce to be installed and active.', 'woocommerce-glow-pay' );
			echo '</p></div>';
		} );
		return;
	}

	require_once WC_GLOW_PAY_PLUGIN_DIR . 'includes/class-glow-pay-api.php';
	require_once WC_GLOW_PAY_PLUGIN_DIR . 'includes/class-wc-glow-pay-gateway.php';
	require_once WC_GLOW_PAY_PLUGIN_DIR . 'includes/class-glow-pay-endpoints.php';

	add_filter( 'woocommerce_payment_gateways', 'wc_glow_pay_add_gateway' );

	WC_Glow_Pay_Endpoints::register();
}

function wc_glow_pay_add_gateway( $methods ) {
	$methods[] = 'WC_Glow_Pay_Gateway';
	return $methods;
}

/**
 * Register SATS as a WooCommerce currency so merchants can price products
 * directly in satoshis. When selected, Glow Pay skips fiat conversion and
 * uses the order total as sats verbatim.
 */
add_filter( 'woocommerce_currencies', 'wc_glow_pay_add_sats_currency' );
function wc_glow_pay_add_sats_currency( $currencies ) {
	$currencies['SATS'] = __( 'Satoshis (sats)', 'woocommerce-glow-pay' );
	return $currencies;
}

add_filter( 'woocommerce_currency_symbol', 'wc_glow_pay_sats_symbol', 10, 2 );
function wc_glow_pay_sats_symbol( $symbol, $currency ) {
	if ( 'SATS' === $currency ) {
		return 'sats';
	}
	return $symbol;
}

/**
 * Force 0 decimals when store currency is SATS — satoshis are indivisible.
 * Uses a re-entry guard because get_option() triggers this same filter.
 */
add_filter( 'option_woocommerce_price_num_decimals', 'wc_glow_pay_sats_decimals' );
add_filter( 'default_option_woocommerce_price_num_decimals', 'wc_glow_pay_sats_decimals' );
function wc_glow_pay_sats_decimals( $value ) {
	static $checking = false;
	if ( $checking ) {
		return $value;
	}
	$checking = true;
	$currency = get_option( 'woocommerce_currency' );
	$checking = false;
	if ( 'SATS' === $currency ) {
		return 0;
	}
	return $value;
}

// Declare HPOS (High-Performance Order Storage) compatibility.
add_action( 'before_woocommerce_init', function () {
	if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility(
			'custom_order_tables',
			WC_GLOW_PAY_PLUGIN_FILE,
			true
		);
	}
} );
