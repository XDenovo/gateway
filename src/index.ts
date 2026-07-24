import { serve } from '@hono/node-server'

import { createApp } from './app.js'
import { createRuntimeAuth } from './auth/runtime.js'
import { loadRuntimeConfig } from './config.js'
import { createDatabase } from './db/database.js'
import { createLogger, describeError } from './logging.js'

async function startGateway(): Promise<void> {
  const config = loadRuntimeConfig()
  const logger = createLogger(config.log)
  const database = createDatabase(config.database.runtimeUrl)

  try {
    await database.verifyConnection()
    const auth = createRuntimeAuth({
      database: database.client,
      config
    })
    const app = createApp({ auth, config, logger })
    const server = serve(
      {
        fetch: app.fetch,
        hostname: config.server.host,
        port: config.server.port
      },
      (info) => {
        logger.info(
          {
            event: 'server.started',
            host: config.server.host,
            port: info.port
          },
          'Gateway started'
        )
      }
    )

    const shutdown = (signal: NodeJS.Signals) => {
      logger.info({ event: 'server.stopping', signal }, 'Gateway stopping')
      server.close((serverError) => {
        database
          .close()
          .then(() => {
            if (serverError) {
              logger.error(
                {
                  event: 'server.stop_failed',
                  ...describeError(serverError)
                },
                'Gateway stop failed'
              )
              process.exitCode = 1
            }
          })
          .catch((databaseError: unknown) => {
            logger.error(
              {
                event: 'database.close_failed',
                ...describeError(databaseError)
              },
              'Database close failed'
            )
            process.exitCode = 1
          })
      })
    }

    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  } catch (error) {
    await database.close()
    logger.fatal(
      {
        event: 'server.start_failed',
        ...describeError(error)
      },
      'Gateway failed to start'
    )
    process.exitCode = 1
  }
}

await startGateway()
