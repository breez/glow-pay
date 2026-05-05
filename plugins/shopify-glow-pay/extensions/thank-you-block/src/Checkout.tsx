import {
  reactExtension,
  BlockStack,
  InlineStack,
  Heading,
  Text,
  Image,
  Banner,
  Spinner,
  Link,
  View,
  useApi,
  useShop,
} from '@shopify/ui-extensions-react/checkout'
import { useEffect, useState } from 'react'

export default reactExtension('purchase.thank-you.block.render', () => <Extension />)

const ORIGIN = 'https://glow-pay.co'
const POLL_MS = 2500

interface PaymentData {
  paymentId: string
  invoice: string
  amountSats: number
  status: 'pending' | 'completed' | 'expired'
  expiresAt: string
  paid?: boolean
}

function Extension() {
  const api = useApi<'purchase.thank-you.block.render'>()
  const shop = useShop()

  const orderGid = api.orderConfirmation?.current?.order?.id
  const numericOrderId = typeof orderGid === 'string' ? orderGid.split('/').pop() ?? null : null
  const shopDomain = shop?.myshopifyDomain ?? null

  const [data, setData] = useState<PaymentData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    if (!shopDomain || !numericOrderId) {
      setError('Missing shop or order info — please refresh.')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const url = `${ORIGIN}/api/shopify/order-payment?shop=${encodeURIComponent(shopDomain)}&order=${encodeURIComponent(numericOrderId)}`
        const r = await fetch(url)
        const j: { success?: boolean; error?: string; data?: PaymentData & { paid?: boolean } } = await r.json()
        if (cancelled) return
        if (!r.ok || !j.success || !j.data) throw new Error(j.error || 'Failed to load payment')
        if (j.data.paid) {
          setPaid(true)
          return
        }
        setData(j.data)
        if (j.data.status === 'completed') setPaid(true)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [shopDomain, numericOrderId])

  useEffect(() => {
    if (!data?.paymentId || paid) return
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      if (cancelled) return
      try {
        const r = await fetch(`${ORIGIN}/api/payments/${data.paymentId}`)
        const j: { data?: { status?: string } } = await r.json()
        if (j?.data?.status === 'completed') {
          if (!cancelled) setPaid(true)
          return
        }
        if (j?.data?.status === 'expired') {
          if (!cancelled) setError('Invoice expired. Refresh the page to generate a new one.')
          return
        }
      } catch {
        // swallow and retry
      }
      if (!cancelled) timeoutId = setTimeout(tick, POLL_MS)
    }
    timeoutId = setTimeout(tick, POLL_MS)
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [data?.paymentId, paid])

  if (error) {
    return (
      <Banner status="critical" title="Bitcoin / Lightning unavailable">
        {error}
      </Banner>
    )
  }

  if (paid) {
    return (
      <Banner status="success" title="Payment received">
        Thanks — your order is being marked as paid.
      </Banner>
    )
  }

  if (!data) {
    return (
      <InlineStack inlineAlignment="center" spacing="base">
        <Spinner />
        <Text>Preparing your Bitcoin invoice…</Text>
      </InlineStack>
    )
  }

  const qrUrl = `${ORIGIN}/api/qr?data=${encodeURIComponent(data.invoice)}&size=320`
  const lnUri = `lightning:${data.invoice}`

  return (
    <View border="base" cornerRadius="base" padding="base">
      <BlockStack spacing="base">
        <Heading level={2}>Pay with Bitcoin / Lightning</Heading>
        <Text appearance="subdued">{data.amountSats.toLocaleString()} sats</Text>
        <BlockStack inlineAlignment="center">
          <Image source={qrUrl} accessibilityDescription="Lightning invoice QR code" />
        </BlockStack>
        <Link to={lnUri} external>
          Open in Lightning wallet →
        </Link>
        <InlineStack inlineAlignment="center" spacing="tight">
          <Spinner size="small" />
          <Text appearance="subdued">Waiting for payment…</Text>
        </InlineStack>
      </BlockStack>
    </View>
  )
}
