import { hc } from 'hono/client'

import type {
  GatewayApiError,
  GatewayAuthenticationRequiredError,
  GatewayCurrentUser,
  GatewayHealth,
  GatewayInternalServerError,
  GatewayMe,
  GatewayOriginNotAllowedError
} from '../../../src/public-api.js'
import type { PublicRoutes } from '../../../src/routes/public.js'

export type {
  GatewayApiError,
  GatewayAuthenticationRequiredError,
  GatewayCurrentUser,
  GatewayHealth,
  GatewayInternalServerError,
  GatewayMe,
  GatewayOriginNotAllowedError
}

export interface GatewayClientOptions {
  baseUrl: string
  fetch?: typeof fetch
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
}

export type GatewayClient = ReturnType<typeof hc<PublicRoutes>>

export function createGatewayClient(
  options: GatewayClientOptions
): GatewayClient {
  assertExactHttpOrigin(options.baseUrl)

  return hc<PublicRoutes>(options.baseUrl, {
    fetch: options.fetch,
    headers: options.headers,
    init: {
      credentials: 'include'
    }
  })
}

function assertExactHttpOrigin(value: string): void {
  if (typeof value !== 'string' || value.includes('*')) {
    throw new TypeError('baseUrl must be an exact absolute HTTP(S) Origin')
  }

  try {
    const url = new URL(value)
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname !== '/' ||
      url.search.length > 0 ||
      url.hash.length > 0 ||
      url.origin !== value
    ) {
      throw new TypeError('baseUrl must be an exact absolute HTTP(S) Origin')
    }
  } catch (error) {
    if (error instanceof TypeError) {
      throw error
    }
    throw new TypeError('baseUrl must be an exact absolute HTTP(S) Origin')
  }
}
