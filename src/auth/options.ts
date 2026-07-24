import type { BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'

import type { RuntimeConfig } from '../config.js'
import * as authSchema from '../db/auth-schema.js'
import type { GatewayDatabaseClient } from '../db/database.js'

export interface AuthFactoryInput {
  database: GatewayDatabaseClient
  config: Pick<RuntimeConfig, 'auth' | 'browser'>
}

export function createAuthOptions({ database, config }: AuthFactoryInput) {
  const secureCookies = new URL(config.auth.baseUrl).protocol === 'https:'

  return {
    appName: 'XDeNovo Gateway',
    baseURL: config.auth.baseUrl,
    basePath: config.auth.basePath,
    secret: config.auth.secret,
    database: drizzleAdapter(database, {
      provider: 'pg',
      schema: authSchema
    }),
    trustedOrigins: [...config.browser.allowedOrigins],
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
