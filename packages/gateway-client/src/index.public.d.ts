import type { Hono } from 'hono'
import type { hc } from 'hono/client'

export interface GatewayAuthenticationRequiredError {
  error: {
    code: 'AUTHENTICATION_REQUIRED'
    message: string
    requestId: string
  }
}

export interface GatewayOriginNotAllowedError {
  error: {
    code: 'ORIGIN_NOT_ALLOWED'
    message: string
    requestId: string
  }
}

export interface GatewayInternalServerError {
  error: {
    code: 'INTERNAL_SERVER_ERROR'
    message: string
    requestId: string
  }
}

export type GatewayApiError =
  | GatewayAuthenticationRequiredError
  | GatewayOriginNotAllowedError
  | GatewayInternalServerError

export interface GatewayHealth {
  status: 'ok'
}

export interface GatewayCurrentUser {
  id: string
  displayName: string
  email: string
  emailVerified: boolean
  avatarUrl: string | null
}

export interface GatewayMe {
  user: GatewayCurrentUser
}

export interface GatewayClientOptions {
  baseUrl: string
  fetch?: typeof fetch
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
}

type Endpoint<Output, Status extends number> = {
  input: Record<never, never>
  output: Output
  outputFormat: 'json'
  status: Status
}

type GatewayPublicRoutes = Hono<
  Record<string, never>,
  {
    '/health': {
      $get:
        | Endpoint<GatewayHealth, 200>
        | Endpoint<GatewayOriginNotAllowedError, 403>
        | Endpoint<GatewayInternalServerError, 500>
    }
    '/v1/me': {
      $get:
        | Endpoint<GatewayMe, 200>
        | Endpoint<GatewayAuthenticationRequiredError, 401>
        | Endpoint<GatewayOriginNotAllowedError, 403>
        | Endpoint<GatewayInternalServerError, 500>
    }
  },
  '/'
>

export type GatewayClient = ReturnType<typeof hc<GatewayPublicRoutes>>

export declare function createGatewayClient(
  options: GatewayClientOptions
): GatewayClient
