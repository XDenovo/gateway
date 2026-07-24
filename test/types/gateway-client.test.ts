// @ts-expect-error The raw Hono application type is intentionally private.
import type { AppType } from '@xdenovo/gateway-client'
import {
  createGatewayClient,
  type GatewayApiError,
  type GatewayClient,
  type GatewayHealth,
  type GatewayInternalServerError,
  type GatewayMe,
  type GatewayOriginNotAllowedError
} from '@xdenovo/gateway-client'
import type { hc } from 'hono/client'
import { expectTypeOf } from 'vitest'

import type { PublicRoutes } from '../../src/routes/public.js'

type DerivedGatewayClient = ReturnType<typeof hc<PublicRoutes>>
type HealthApiError = GatewayOriginNotAllowedError | GatewayInternalServerError
type PackageExportNames = keyof typeof import('@xdenovo/gateway-client')

expectTypeOf<GatewayClient>().toExtend<DerivedGatewayClient>()
expectTypeOf<DerivedGatewayClient>().toExtend<GatewayClient>()
expectTypeOf<Extract<'AppType', PackageExportNames>>().toBeNever()
expectTypeOf<Extract<'default', PackageExportNames>>().toBeNever()

declare const client: GatewayClient
declare const forbiddenAppType: AppType
void forbiddenAppType

type HealthResponse = Awaited<ReturnType<typeof client.health.$get>>
type MeResponse = Awaited<ReturnType<typeof client.v1.me.$get>>

expectTypeOf<HealthResponse['status']>().toEqualTypeOf<200 | 403 | 500>()
expectTypeOf<MeResponse['status']>().toEqualTypeOf<200 | 401 | 403 | 500>()
expectTypeOf<Awaited<ReturnType<HealthResponse['json']>>>().toEqualTypeOf<
  GatewayHealth | HealthApiError
>()
expectTypeOf<Awaited<ReturnType<MeResponse['json']>>>().toEqualTypeOf<
  GatewayMe | GatewayApiError
>()

client.health.$get(undefined, {
  init: {
    signal: AbortSignal.abort()
  }
})

// @ts-expect-error A base URL is always required.
createGatewayClient()
// @ts-expect-error A base URL is always required.
createGatewayClient({})
// @ts-expect-error The selected route tree contains no other v1 routes.
client.v1.users.$get()
async function narrowResponses(): Promise<void> {
  const health = await client.health.$get()
  if (health.status === 200) {
    expectTypeOf(await health.json()).toEqualTypeOf<GatewayHealth>()
  } else {
    expectTypeOf(await health.json()).toEqualTypeOf<HealthApiError>()
  }

  const me = await client.v1.me.$get()
  if (me.status === 200) {
    expectTypeOf(await me.json()).toEqualTypeOf<GatewayMe>()
  } else {
    expectTypeOf(await me.json()).toEqualTypeOf<GatewayApiError>()
  }
}

void narrowResponses
