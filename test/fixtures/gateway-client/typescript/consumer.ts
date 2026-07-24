import {
  createGatewayClient,
  type GatewayApiError,
  type GatewayHealth,
  type GatewayMe
} from '@xdenovo/gateway-client'

const client = createGatewayClient({
  baseUrl: 'https://api.example.test'
})

async function consumeGateway(): Promise<void> {
  const health = await client.health.$get()
  if (health.status === 200) {
    const body: GatewayHealth = await health.json()
    void body.status
  } else {
    const body: GatewayApiError = await health.json()
    void body.error.requestId
  }

  const me = await client.v1.me.$get(undefined, {
    init: {
      signal: AbortSignal.abort()
    }
  })
  if (me.status === 200) {
    const body: GatewayMe = await me.json()
    void body.user.displayName
  } else {
    const body: GatewayApiError = await me.json()
    void body.error.code
  }

  // @ts-expect-error The selected public tree has no users collection route.
  await client.v1.users.$get()

  // @ts-expect-error Health JSON is not a current-User response.
  const invalid: GatewayMe = await health.json()
  void invalid
}

void consumeGateway
