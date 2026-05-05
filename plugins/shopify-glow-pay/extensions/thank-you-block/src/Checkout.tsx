import {
  reactExtension,
  BlockStack,
  InlineStack,
  Image,
  Link,
  View,
  Text,
  useApi,
  useShop,
  useTotalAmount,
} from '@shopify/ui-extensions-react/checkout'
import { useEffect, useState } from 'react'

export default reactExtension('purchase.thank-you.block.render', () => <Extension />)

const ORIGIN = 'https://glow-pay.co'
const REFRESH_MS = 3000

/**
 * Image-only Bitcoin/Lightning checkout block. The entire UI (QR code,
 * amount, status indicator, paid/expired states) is rendered server-
 * side as an SVG and delivered via <Image>. No fetch() is used, so the
 * extension does not need the `network_access` capability — which lets
 * us deploy to merchants without going through Shopify's approval queue.
 *
 * To keep the SVG fresh as the payment status changes, we bump a
 * cache-buster every few seconds and React re-renders the Image with
 * a new src — the browser fetches the SVG anew.
 */
function Extension() {
  const api = useApi<'purchase.thank-you.block.render'>()
  const shop = useShop()
  const total = useTotalAmount()

  const orderGid = api.orderConfirmation?.current?.order?.id
  const numericOrderId = typeof orderGid === 'string' ? orderGid.split('/').pop() ?? null : null
  const shopDomain = shop?.myshopifyDomain ?? null

  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), REFRESH_MS)
    return () => clearInterval(id)
  }, [])

  if (!shopDomain || !numericOrderId || !total?.amount || !total?.currencyCode) {
    return (
      <Text>Bitcoin / Lightning is not available for this order.</Text>
    )
  }

  const baseQs =
    `shop=${encodeURIComponent(shopDomain)}` +
    `&order=${encodeURIComponent(numericOrderId)}`
  const qs =
    baseQs +
    `&amount=${encodeURIComponent(String(total.amount))}` +
    `&currency=${encodeURIComponent(total.currencyCode)}`
  const imageSrc = `${ORIGIN}/api/shopify/invoice?${qs}&t=${tick}`
  const walletUrl = `${ORIGIN}/api/shopify/wallet-redirect?${baseQs}`

  return (
    <View padding="base">
      <BlockStack spacing="base" inlineAlignment="center">
        <Image source={imageSrc} accessibilityDescription="Bitcoin Lightning invoice" />
        <InlineStack inlineAlignment="center">
          <Link to={walletUrl} external>
            Open in Lightning wallet →
          </Link>
        </InlineStack>
      </BlockStack>
    </View>
  )
}
