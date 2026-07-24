# `@xdenovo/gateway-client`

Typed ESM-only Hono RPC client for the XDeNovo Gateway public HTTP API.

```ts
import { createGatewayClient } from '@xdenovo/gateway-client'

const gateway = createGatewayClient({
  baseUrl: 'https://api.xdenovoai.com'
})

const healthResponse = await gateway.health.$get()
```

The factory requires an exact absolute HTTP(S) Origin. Browser requests include credentials by
default. Responses retain normal Fetch semantics: inspect `status`, then call `json()`, `text()`,
or another Fetch response method explicitly. The factory also accepts a Web-compatible `fetch`
implementation and static or asynchronous common headers. Per-request `AbortSignal` remains
available through Hono RPC request options.

The package is ESM-only for modern Browser bundlers and Node.js 24. It deliberately provides no
default or CommonJS export.
