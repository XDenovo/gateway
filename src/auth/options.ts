import type { BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

import type { RuntimeConfig } from '../config.js'
import * as authSchema from '../db/auth-schema.js'
import type { GatewayDatabaseClient } from '../db/database.js'

export interface AuthFactoryInput {
  database: GatewayDatabaseClient
  config: RuntimeConfig['auth']
}

export function createAuthOptions({ database, config }: AuthFactoryInput) {
  const secureCookies = new URL(config.baseUrl).protocol === 'https:'

  return {
    appName: 'XDeNovo Gateway',
    baseURL: config.baseUrl,
    basePath: config.basePath,
    secret: config.secret,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: authSchema
    }),
    trustedOrigins: [...config.trustedOrigins],
    logger: {
      disabled: true
    },
    advanced: {
      useSecureCookies: secureCookies,
      disableCSRFCheck: false,
      disableOriginCheck: false,
      crossSubDomainCookies: {
        enabled: false
      },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookies
      }
    }
  } satisfies BetterAuthOptions
}
