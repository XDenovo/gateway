import { createMiddleware } from 'hono/factory'

import type { GatewayAuth } from '../auth/runtime.js'
import type { GatewayEnvironment } from '../http-types.js'

export function createSessionMiddleware(auth: GatewayAuth) {
  return createMiddleware<GatewayEnvironment>(async (context, next) => {
    context.header('Cache-Control', 'no-store')
    const result = await auth.api.getSession({
      headers: context.req.raw.headers
    })

    if (!result) {
      return context.json(
        {
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        },
        401
      )
    }

    context.set('user', result.user)
    context.set('session', result.session)
    await next()
  })
}
