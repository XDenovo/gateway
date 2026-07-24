import assert from 'node:assert/strict'

import { createGatewayClient } from '@xdenovo/gateway-client'

let observedRequest
const client = createGatewayClient({
  baseUrl: 'https://api.example.test',
  fetch: async (input, init) => {
    observedRequest = { input, init }
    return Response.json({ status: 'ok' })
  }
})

const response = await client.health.$get()

assert.equal(response.status, 200)
assert.deepEqual(await response.json(), { status: 'ok' })
assert.equal(observedRequest.input, 'https://api.example.test/health')
assert.equal(observedRequest.init.credentials, 'include')
