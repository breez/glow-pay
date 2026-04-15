<?php
/**
 * Thin HTTP client for the glow-pay API.
 *
 * @package WC_Glow_Pay
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WC_Glow_Pay_API {

	const API_BASE = 'https://glow-pay.co/api';
	const RATE_URL = 'https://api.yadio.io/exrates/BTC';
	const RATE_TRANSIENT = 'wc_glow_pay_btc_rates';
	const RATE_TTL = 60; // seconds

	private $api_key;

	public function __construct( $api_key ) {
		$this->api_key = $api_key;
	}

	/**
	 * Create a payment on glow-pay.
	 *
	 * @param int    $amount_sats Positive integer sats.
	 * @param string $description
	 * @param array  $metadata
	 * @return array|WP_Error { payment_id, payment_url, invoice, expires_at, verify_url, amount_sats }
	 */
	public function create_payment( $amount_sats, $description, $metadata = array() ) {
		$body = wp_json_encode( array(
			'amountSats'  => (int) $amount_sats,
			'description' => $description,
			'metadata'    => $metadata,
		) );

		$response = wp_remote_post( self::API_BASE . '/payments', array(
			'headers' => array(
				'Content-Type' => 'application/json',
				'X-API-Key'    => $this->api_key,
			),
			'body'    => $body,
			'timeout' => 15,
		) );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code >= 400 || empty( $data['success'] ) ) {
			$msg = isset( $data['error'] ) ? $data['error'] : 'glow-pay API error (' . $code . ')';
			return new WP_Error( 'glow_pay_api_error', $msg );
		}

		return $data['data'];
	}

	/**
	 * Fetch current payment state (status + paidAt). No auth required.
	 *
	 * @param string $payment_id
	 * @return array|WP_Error
	 */
	public function get_payment( $payment_id ) {
		$response = wp_remote_get( self::API_BASE . '/payments/' . rawurlencode( $payment_id ), array(
			'timeout' => 15,
		) );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( empty( $data['success'] ) ) {
			return new WP_Error( 'glow_pay_api_error', 'Failed to fetch payment' );
		}

		return $data['data'];
	}

	/**
	 * Convert fiat amount to sats using Yadio live rate, cached for 60s.
	 * Returns sats as integer (rounded), or WP_Error.
	 *
	 * @param float  $fiat_amount
	 * @param string $currency ISO code (USD, EUR, …)
	 * @return int|WP_Error
	 */
	public static function fiat_to_sats( $fiat_amount, $currency ) {
		$currency = strtoupper( $currency );
		$rates    = get_transient( self::RATE_TRANSIENT );

		if ( ! is_array( $rates ) ) {
			$response = wp_remote_get( self::RATE_URL, array( 'timeout' => 10 ) );
			if ( is_wp_error( $response ) ) {
				return $response;
			}
			$json = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( empty( $json['BTC'] ) || ! is_array( $json['BTC'] ) ) {
				return new WP_Error( 'glow_pay_rate_error', 'Invalid exchange rate response' );
			}
			$rates = $json['BTC'];
			set_transient( self::RATE_TRANSIENT, $rates, self::RATE_TTL );
		}

		if ( empty( $rates[ $currency ] ) || ! is_numeric( $rates[ $currency ] ) ) {
			return new WP_Error( 'glow_pay_rate_error', sprintf( 'Unsupported currency: %s', $currency ) );
		}

		$btc_price = (float) $rates[ $currency ];
		if ( $btc_price <= 0 ) {
			return new WP_Error( 'glow_pay_rate_error', 'Invalid BTC price' );
		}

		$sats = (int) round( ( (float) $fiat_amount / $btc_price ) * 100000000 );
		return max( 1, $sats );
	}
}
