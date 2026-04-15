<?php
/**
 * Public endpoints: return URL (customer redirect after paying) and webhook (server-to-server).
 *
 * @package WC_Glow_Pay
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WC_Glow_Pay_Endpoints {

	public static function register() {
		add_action( 'woocommerce_api_glow_pay_return', array( __CLASS__, 'handle_return' ) );
		add_action( 'woocommerce_api_glow_pay_webhook', array( __CLASS__, 'handle_webhook' ) );
	}

	/**
	 * Customer-facing return URL. Glow Pay appends ?payment_id=…&status=paid&amount_sats=….
	 * We look up the WC order by the stored meta, verify with the API, mark paid, and send the
	 * customer to the order-received page.
	 */
	public static function handle_return() {
		$payment_id = isset( $_GET['payment_id'] ) ? sanitize_text_field( wp_unslash( $_GET['payment_id'] ) ) : '';
		if ( ! $payment_id ) {
			wp_die( 'Missing payment_id', '', 400 );
		}

		$order = self::find_order_by_payment_id( $payment_id );
		if ( ! $order ) {
			wp_die( 'Order not found', '', 404 );
		}

		// Authoritatively verify against the API so users can't spoof the redirect.
		$gateway = self::get_gateway();
		if ( ! $gateway ) {
			wp_die( 'Gateway not configured', '', 500 );
		}
		$api  = new WC_Glow_Pay_API( $gateway->get_option( 'api_key' ) );
		$data = $api->get_payment( $payment_id );

		if ( is_wp_error( $data ) ) {
			wc_add_notice( $data->get_error_message(), 'error' );
			wp_safe_redirect( $order->get_checkout_payment_url() );
			exit;
		}

		if ( isset( $data['status'] ) && 'completed' === $data['status'] ) {
			self::mark_order_paid( $order, $payment_id );
			wp_safe_redirect( $order->get_checkout_order_received_url() );
			exit;
		}

		// Still pending or expired — bounce back to the pay page.
		wp_safe_redirect( $order->get_checkout_payment_url() );
		exit;
	}

	/**
	 * Server-to-server webhook. Glow Pay sends:
	 *   POST /?wc-api=glow_pay_webhook
	 *   X-Glow-Signature: hex(hmac_sha256(body, secret))
	 *   body: { event, paymentId, amountSats, status, paidAt, timestamp }
	 */
	public static function handle_webhook() {
		$raw = file_get_contents( 'php://input' );
		if ( ! $raw ) {
			status_header( 400 );
			exit;
		}

		$gateway = self::get_gateway();
		if ( ! $gateway ) {
			status_header( 500 );
			exit;
		}

		$secret    = (string) $gateway->get_option( 'webhook_secret' );
		$signature = isset( $_SERVER['HTTP_X_GLOW_SIGNATURE'] ) ? sanitize_text_field( wp_unslash( $_SERVER['HTTP_X_GLOW_SIGNATURE'] ) ) : '';
		$expected  = hash_hmac( 'sha256', $raw, $secret );

		if ( ! $secret || ! hash_equals( $expected, $signature ) ) {
			status_header( 401 );
			exit;
		}

		$payload = json_decode( $raw, true );
		if ( ! is_array( $payload ) || empty( $payload['paymentId'] ) || empty( $payload['event'] ) ) {
			status_header( 400 );
			exit;
		}

		$order = self::find_order_by_payment_id( $payload['paymentId'] );
		if ( ! $order ) {
			status_header( 200 ); // don't retry — the order isn't ours.
			exit;
		}

		switch ( $payload['event'] ) {
			case 'payment.completed':
				self::mark_order_paid( $order, $payload['paymentId'] );
				break;
			case 'payment.expired':
				if ( 'completed' !== $order->get_status() ) {
					$order->update_status( 'failed', 'Glow Pay payment expired.' );
				}
				break;
		}

		status_header( 200 );
		exit;
	}

	private static function find_order_by_payment_id( $payment_id ) {
		$orders = wc_get_orders( array(
			'limit'        => 1,
			'meta_key'     => '_glow_pay_payment_id',
			'meta_value'   => $payment_id,
			'meta_compare' => '=',
		) );
		return ! empty( $orders ) ? $orders[0] : null;
	}

	private static function mark_order_paid( $order, $payment_id ) {
		if ( 'completed' === $order->get_status() || 'processing' === $order->get_status() ) {
			return;
		}
		$order->payment_complete( $payment_id );
		$order->add_order_note( sprintf( 'Glow Pay payment confirmed (payment ID: %s).', $payment_id ) );
	}

	private static function get_gateway() {
		$gateways = WC()->payment_gateways()->payment_gateways();
		return isset( $gateways['glow_pay'] ) ? $gateways['glow_pay'] : null;
	}
}
