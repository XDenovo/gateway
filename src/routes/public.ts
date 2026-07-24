import { Hono } from 'hono'
import type { ApplyGlobalResponse } from 'hono/client'

import type { GatewayAuth } from '../auth/runtime.js'
import type { GatewayEnvironment } from '../http-types.js'
import type {
  GatewayInternalServerError,
  GatewayOriginNotAllowedError
} from '../public-api.js'

interface CreatePublicRoutesInput {
  auth: GatewayAuth
}

export function createPublicRoutes({ auth }: CreatePublicRoutesInput) {
  return new Hono<GatewayEnvironment>()
    .get('/health', (context) => context.json({ status: 'ok' } as const, 200))
    .get('/v1/me', async (context) => {
      const result = await auth.api.getSession({
        headers: context.req.raw.headers
      })

      if (!result) {
        return context.json(
          {
            error: {
              code: 'AUTHENTICATION_REQUIRED' as const,
              message: 'Authentication required',
              requestId: context.var.requestId
            }
          },
          401
        )
      }

      return context.json(
        {
          user: {
            id: result.user.id,
            displayName: result.user.name,
            email: result.user.email,
            emailVerified: result.user.emailVerified,
            avatarUrl: result.user.image ?? null
          }
        },
        200
      )
    })
}

export type PublicRoutes = ApplyGlobalResponse<
  ReturnType<typeof createPublicRoutes>,
  {
    403: { json: GatewayOriginNotAllowedError }
    500: { json: GatewayInternalServerError }
  }
>
