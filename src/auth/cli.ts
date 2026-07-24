import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

// The Better Auth CLI needs an Auth instance to inspect. The pool is never
// connected by schema generation and these non-secret values are not used by
// the runtime factory.
const schemaGenerationPool = new Pool()
const schemaGenerationDatabase = drizzle(schemaGenerationPool)

export const auth = betterAuth({
  appName: 'XDeNovo Gateway',
  baseURL: 'http://localhost:3001',
  basePath: '/api/auth',
  secret: 'schema-generation-only'.repeat(2),
  database: drizzleAdapter(schemaGenerationDatabase, {
    provider: 'pg'
  }),
  trustedOrigins: ['http://localhost:3000'],
  advanced: {
    crossSubDomainCookies: {
      enabled: false
    },
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax'
    }
  }
})
