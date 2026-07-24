import { Writable } from 'node:stream'

import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { eq } from 'drizzle-orm'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createApp } from '../../src/app.js'
import { createRuntimeAuth } from '../../src/auth/runtime.js'
import { type LocalConfig, loadLocalConfig } from '../../src/config.js'
import { session } from '../../src/db/auth-schema.js'
import { createDatabase, type GatewayDatabase } from '../../src/db/database.js'
import { runMigrations } from '../../src/db/migrate.js'
import { createLogger } from '../../src/logging.js'
import { createSessionMiddleware } from '../../src/middleware/session.js'
import { createTestAuth } from '../support/test-auth.js'

const migratorPassword = 'integration-migrator-password'
const runtimePassword = 'integration-runtime-password'
const authSecret = 'integration-only-auth-secret-with-32-characters'

class LogSink extends Writable {
  readonly lines: string[] = []

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ): void {
    this.lines.push(chunk.toString())
    callback()
  }
}

describe.sequential('persistent Better Auth integration', () => {
  let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined
  let bootstrapPool: Pool | undefined
  let database: GatewayDatabase | undefined
  let config: LocalConfig
  let app: ReturnType<typeof createApp>
  let testAuth: ReturnType<typeof createTestAuth>
  let logSink: LogSink

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4')
      .withDatabase('platform')
      .withUsername('bootstrap_admin')
      .withPassword('integration-bootstrap-password')
      .start()

    bootstrapPool = new Pool({
      connectionString: container.getConnectionUri()
    })
    await bootstrapPool.query(`
      CREATE ROLE gateway_migrator LOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
        PASSWORD '${migratorPassword}';
      CREATE ROLE gateway_runtime LOGIN
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT
        PASSWORD '${runtimePassword}';
      GRANT CONNECT, CREATE ON DATABASE platform TO gateway_migrator;
      GRANT CONNECT ON DATABASE platform TO gateway_runtime;
    `)

    const migrationUrl = connectionUrl(
      container.getConnectionUri(),
      'gateway_migrator',
      migratorPassword
    )
    const runtimeUrl = connectionUrl(
      container.getConnectionUri(),
      'gateway_runtime',
      runtimePassword
    )
    config = loadLocalConfig({
      NODE_ENV: 'test',
      BETTER_AUTH_BASE_URL: 'http://localhost:3000',
      BETTER_AUTH_BASE_PATH: '/api/auth',
      BETTER_AUTH_SECRET: authSecret,
      BETTER_AUTH_TRUSTED_ORIGINS:
        'http://localhost:3001,http://127.0.0.1:3001',
      DATABASE_MIGRATION_URL: migrationUrl,
      DATABASE_RUNTIME_URL: runtimeUrl,
      SERVER_HOST: '127.0.0.1',
      SERVER_PORT: '3000',
      LOG_LEVEL: 'info',
      LOG_PRETTY: 'false'
    })

    await runMigrations(config.database.migrationUrl)

    database = createDatabase(config.database.runtimeUrl)
    const runtimeAuth = createRuntimeAuth({
      database: database.client,
      config: config.auth
    })
    testAuth = createTestAuth({
      database: database.client,
      config: config.auth
    })
    logSink = new LogSink()
    const logger = createLogger(config.log, logSink)
    app = createApp({ auth: runtimeAuth, config, logger })

    app.get(
      '/test/protected',
      createSessionMiddleware(runtimeAuth),
      (context) =>
        context.json({
          userId: context.var.user.id,
          sessionId: context.var.session.id
        })
    )
    app.get('/test/fail', () => {
      throw new Error(
        `connection failed for ${config.database.runtimeUrl} using ${authSecret}`
      )
    })
  })

  afterAll(async () => {
    await database?.close()
    await bootstrapPool?.end()
    await container?.stop()
  })

  it('applies the committed migration repeatedly without changing the schema', async () => {
    await runMigrations(config.database.migrationUrl)

    const result = await bootstrapPool?.query<{
      table_name: string
    }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'auth'
      ORDER BY table_name
    `)

    expect(result?.rows.map((row) => row.table_name)).toEqual([
      'account',
      'session',
      'user',
      'verification'
    ])
  })

  it('denies runtime DDL while retaining Better Auth data access', async () => {
    await expect(
      database?.pool.query('CREATE TABLE auth.runtime_ddl_denied (id integer)')
    ).rejects.toMatchObject({ code: '42501' })

    const login = await createPersistedLogin('runtime-access')
    const response = await app.request(
      `${config.auth.baseUrl}${config.auth.basePath}/get-session`,
      { headers: login.headers }
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({
      user: { id: login.userId },
      session: { id: login.sessionId }
    })
  })

  it('rejects applying migrations with the runtime identity', async () => {
    await expect(
      runMigrations(config.database.runtimeUrl)
    ).rejects.toBeDefined()
  })

  it('propagates a persisted identity into an ordinary Hono handler', async () => {
    const login = await createPersistedLogin('protected-handler')
    const response = await app.request(
      `${config.auth.baseUrl}/test/protected`,
      { headers: login.headers }
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      userId: login.userId,
      sessionId: login.sessionId
    })
  })

  it.each([
    ['missing', undefined],
    ['invalid', 'better-auth.session_token=invalid-session-token']
  ])('rejects a %s Session with a stable response', async (_kind, cookie) => {
    const headers = cookie ? { cookie } : undefined
    const response = await app.request(
      `${config.auth.baseUrl}/test/protected`,
      { headers }
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    })
  })

  it('rejects an expired persisted Session', async () => {
    const login = await createPersistedLogin('expired-session')
    await database?.client
      .update(session)
      .set({ expiresAt: new Date(0) })
      .where(eq(session.token, login.token))

    const response = await app.request(
      `${config.auth.baseUrl}/test/protected`,
      { headers: login.headers }
    )

    expect(response.status).toBe(401)
  })

  it('rejects a Session after its User is deleted', async () => {
    const login = await createPersistedLogin('deleted-user')
    const helpers = (await testAuth.$context).test
    await helpers.deleteUser(login.userId)

    const response = await app.request(
      `${config.auth.baseUrl}/test/protected`,
      { headers: login.headers }
    )

    expect(response.status).toBe(401)
  })

  it('rejects untrusted origins and allows credentialed exact origins', async () => {
    const rejected = await app.request(
      `${config.auth.baseUrl}${config.auth.basePath}/sign-out`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'http://attacker.example'
        }
      }
    )
    expect(rejected.status).toBe(403)
    expect(await rejected.json()).toEqual({
      error: {
        code: 'ORIGIN_NOT_ALLOWED',
        message: 'Origin is not allowed'
      }
    })

    const preflight = await app.request(
      `${config.auth.baseUrl}${config.auth.basePath}/sign-out`,
      {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:3001',
          'access-control-request-method': 'POST'
        }
      }
    )
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(
      'http://localhost:3001'
    )
    expect(preflight.headers.get('access-control-allow-credentials')).toBe(
      'true'
    )
  })

  it('uses a host-only Session Cookie', async () => {
    const login = await createPersistedLogin('host-only-cookie')
    const response = await app.request(
      `${config.auth.baseUrl}${config.auth.basePath}/sign-out`,
      {
        method: 'POST',
        headers: mergeHeaders(login.headers, {
          origin: 'http://localhost:3001'
        })
      }
    )
    const setCookies = response.headers.getSetCookie()

    expect(response.status).toBe(200)
    expect(setCookies.length).toBeGreaterThan(0)
    for (const cookie of setCookies) {
      expect(cookie.toLowerCase()).not.toContain('domain=')
    }
  })

  it('correlates request logs and redacts errors and credentials', async () => {
    const authorization = 'Bearer external-access-token'
    const cookie = 'better-auth.session_token=sensitive-session-cookie'
    const response = await app.request(`${config.auth.baseUrl}/test/fail`, {
      headers: {
        authorization,
        cookie,
        'x-request-id': 'integration-request-id'
      }
    })
    const output = logSink.lines.join('')

    expect(response.status).toBe(500)
    expect(response.headers.get('x-request-id')).toBe('integration-request-id')
    expect(await response.json()).toEqual({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      }
    })
    for (const secret of [
      authorization,
      cookie,
      'external-access-token',
      'sensitive-session-cookie',
      authSecret,
      config.database.runtimeUrl,
      runtimePassword
    ]) {
      expect(output).not.toContain(secret)
    }

    const parsedLines = logSink.lines.map((line) => JSON.parse(line))
    expect(parsedLines).toContainEqual(
      expect.objectContaining({
        requestId: 'integration-request-id',
        event: 'request.failed',
        errorType: 'Error'
      })
    )
  })

  async function createPersistedLogin(label: string) {
    const helpers = (await testAuth.$context).test
    const draft = helpers.createUser({
      email: `${label}@example.test`,
      name: `Test ${label}`
    })
    const user = await helpers.saveUser(draft)
    const login = await helpers.login({ userId: user.id })

    return {
      headers: login.headers,
      sessionId: login.session.id,
      token: login.token,
      userId: user.id
    }
  }
})

function connectionUrl(
  sourceUrl: string,
  username: string,
  password: string
): string {
  const url = new URL(sourceUrl)
  url.username = username
  url.password = password
  return url.toString()
}

function mergeHeaders(
  base: Headers,
  additional: Record<string, string>
): Headers {
  const merged = new Headers(base)
  for (const [name, value] of Object.entries(additional)) {
    merged.set(name, value)
  }
  return merged
}
