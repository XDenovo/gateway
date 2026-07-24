import type { Logger } from 'pino'

import type { GatewaySession, GatewayUser } from './auth/runtime.js'

export interface GatewayEnvironment {
  Variables: {
    logger: Logger
    requestId: string
    session: GatewaySession
    user: GatewayUser
  }
}
