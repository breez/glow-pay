<?php
/**
 * WooCommerce payment gateway for Glow Pay.
 *
 * @package WC_Glow_Pay
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class WC_Glow_Pay_Gateway extends WC_Payment_Gateway {

	/** @var string */
	public $api_key;

	public function __construct() {
		$this->id                 = 'glow_pay';
		$this->icon               = '';
		$this->has_fields         = false;
		$this->method_title       = __( 'Bitcoin / Lightning (Glow Pay)', 'woocommerce-glow-pay' );
		$this->method_description = __( 'Accept Bitcoin payments instantly via the Lightning Network, powered by Glow Pay.', 'woocommerce-glow-pay' );
		$this->supports           = array( 'products' );

		$this->init_form_fields();
		$this->init_settings();

		$this->title       = $this->get_option( 'title' );
		$this->description = $this->get_option( 'description' );
		$this->enabled     = $this->get_option( 'enabled' );
		$this->api_key     = $this->get_option( 'api_key' );

		add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
	}

	public function init_form_fields() {
		$this->form_fields = array(
			'enabled'     => array(
				'title'   => __( 'Enable/Disable', 'woocommerce-glow-pay' ),
				'type'    => 'checkbox',
				'label'   => __( 'Enable Glow Pay', 'woocommerce-glow-pay' ),
				'default' => 'no',
			),
			'title'       => array(
				'title'       => __( 'Title', 'woocommerce-glow-pay' ),
				'type'        => 'text',
				'description' => __( 'Shown to customers at checkout.', 'woocommerce-glow-pay' ),
				'default'     => __( 'Bitcoin / Lightning', 'woocommerce-glow-pay' ),
				'desc_tip'    => true,
			),
			'description' => array(
				'title'       => __( 'Description', 'woocommerce-glow-pay' ),
				'type'        => 'textarea',
				'description' => __( 'Shown to customers at checkout.', 'woocommerce-glow-pay' ),
				'default'     => __( 'Pay instantly with Bitcoin over the Lightning Network. No wallet? Scan the QR code with any Lightning wallet app.', 'woocommerce-glow-pay' ),
			),
			'api_key'     => array(
				'title'       => __( 'Glow Pay API Key', 'woocommerce-glow-pay' ),
				'type'        => 'password',
				'description' => __( 'Create one in your Glow Pay dashboard → Integration.', 'woocommerce-glow-pay' ),
			),
			'webhook_secret' => array(
				'title'       => __( 'Webhook Secret', 'woocommerce-glow-pay' ),
				'type'        => 'password',
				'description' => __( 'Shared secret used to verify webhooks from Glow Pay. Set the same value in your Glow Pay dashboard.', 'woocommerce-glow-pay' ),
			),
			'instructions' => array(
				'title' => __( 'Setup', 'woocommerce-glow-pay' ),
				'type'  => 'title',
				'description' => sprintf(
					/* translators: %1$s = return URL, %2$s = webhook URL */
					__( '<p>In your Glow Pay dashboard → Integration, set:</p><ul><li><strong>Redirect URL:</strong> <code>%1$s</code></li><li><strong>Webhook URL:</strong> <code>%2$s</code></li></ul>', 'woocommerce-glow-pay' ),
					esc_url( home_url( '/?wc-api=glow_pay_return' ) ),
					esc_url( home_url( '/?wc-api=glow_pay_webhook' ) )
				),
			),
		);
	}

	public function process_payment( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order ) {
			return array( 'result' => 'failure' );
		}

		$currency = $order->get_currency();
		$total    = (float) $order->get_total();

		$sats = WC_Glow_Pay_API::fiat_to_sats( $total, $currency );
		if ( is_wp_error( $sats ) ) {
			wc_add_notice( $sats->get_error_message(), 'error' );
			$order->add_order_note( 'Glow Pay: exchange rate lookup failed: ' . $sats->get_error_message() );
			return array( 'result' => 'failure' );
		}

		$api  = new WC_Glow_Pay_API( $this->api_key );
		$data = $api->create_payment(
			$sats,
			sprintf( 'Order #%s', $order->get_order_number() ),
			array(
				'source'         => 'woocommerce',
				'wc_order_id'    => $order_id,
				'wc_order_key'   => $order->get_order_key(),
				'wc_currency'    => $currency,
				'wc_fiat_amount' => $total,
			)
		);

		if ( is_wp_error( $data ) ) {
			wc_add_notice( $data->get_error_message(), 'error' );
			$order->add_order_note( 'Glow Pay: payment creation failed: ' . $data->get_error_message() );
			return array( 'result' => 'failure' );
		}

		$order->update_meta_data( '_glow_pay_payment_id', $data['paymentId'] );
		$order->update_meta_data( '_glow_pay_amount_sats', $sats );
		$order->update_status( 'pending', sprintf( 'Awaiting Glow Pay payment (%s sats).', number_format( $sats ) ) );
		$order->save();

		return array(
			'result'   => 'success',
			'redirect' => $data['paymentUrl'],
		);
	}
}
