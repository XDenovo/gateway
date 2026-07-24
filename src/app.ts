import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requestId } from 'hono/request-id'
import type { Logger } from 'pino'

import type { GatewayAuth } from './auth/runtime.js'
import type { RuntimeConfig } from './config.js'
import type { GatewayEnvironment } from './http-types.js'
import { describeError } from './logging.js'

interface CreateAppInput {
  auth: GatewayAuth
  config: RuntimeConfig
  logger: Logger
}

export function createApp({ auth, config, logger }: CreateAppInput) {
  const app = new Hono<GatewayEnvironment>()
  const authRoute = `${config.auth.basePath}/*`
  const allowedOrigins = new Set([
    config.auth.baseUrl,
    ...config.auth.trustedOrigins
  ])

  app.use('*', requestId({ limitLength: 128 }))
  app.use('*', async (context, next) => {
    const requestLogger = logger.child({
      requestId: context.var.requestId
    })
    const startedAt = performance.now()
    context.set('logger', requestLogger)

    await next()

    if (context.res.status < 500) {
      requestLogger.info(
        {
          event: 'request.completed',
          method: context.req.method,
          path: new URL(context.req.url).pathname,
          status: context.res.status,
          durationMs: Math.round(performance.now() - startedAt)
        },
        'Request completed'
      )
    }
  })

  app.use(authRoute, async (context, next) => {
    context.header('Cache-Control', 'no-store')
    const origin = context.req.header('origin')

    if (origin && !allowedOrigins.has(origin)) {
      return context.json(
        {
          error: {
            code: 'ORIGIN_NOT_ALLOWED',
            message: 'Origin is not allowed'
          }
        },
        403
      )
    }

    await next()
  })
  app.use(
    authRoute,
    cors({
      origin: [...allowedOrigins],
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    })
  )
  app.on(['GET', 'POST'], authRoute, (context) => auth.handler(context.req.raw))

  app.get('/', (context) => context.text('Hello Hono!'))

  app.notFound((context) =>
    context.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Not found'
        }
      },
      404
    )
  )

  app.onError((error, context) => {
    context.var.logger.error(
      {
        event: 'request.failed',
        method: context.req.method,
        path: new URL(context.req.url).pathname,
        ...describeError(error)
      },
      'Request failed'
    )

    return context.json(
      {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Internal server error'
        }
      },
      500
    )
  })

  return app
}
