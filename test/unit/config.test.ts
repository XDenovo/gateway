import { describe, expect, it } from 'vitest'

import {
  ConfigurationError,
  loadLocalConfig,
  loadRuntimeConfig
} from '../../src/config.js'

const validEnvironment = {
  NODE_ENV: 'development',
  BETTER_AUTH_BASE_URL: 'http://localhost:3000',
  BETTER_AUTH_BASE_PATH: '/api/auth',
  BETTER_AUTH_SECRET: 'local-only-secret-with-at-least-32-characters',
  BETTER_AUTH_TRUSTED_ORIGINS: 'http://localhost:3001,http://127.0.0.1:3001',
  DATABASE_MIGRATION_URL:
    'postgresql://gateway_migrator:migrator-password@127.0.0.1:5432/platform',
  DATABASE_RUNTIME_URL:
    'postgresql://gateway_runtime:runtime-password@127.0.0.1:5432/platform',
  SERVER_HOST: '127.0.0.1',
  SERVER_PORT: '3000',
  LOG_LEVEL: 'info',
  LOG_PRETTY: 'false'
} satisfies NodeJS.ProcessEnv

describe('Gateway configuration', () => {
  it('parses a runtime configuration with exact trusted origins', () => {
    const config = loadRuntimeConfig(validEnvironment)

    expect(config.auth.trustedOrigins).toEqual([
      'http://localhost:3001',
      'http://127.0.0.1:3001'
    ])
    expect(config.auth.basePath).toBe('/api/auth')
    expect(config.database.runtimeUrl).toContain('gateway_runtime')
    expect(config.server).toEqual({ host: '127.0.0.1', port: 3000 })
    expect(config.log).toEqual({ level: 'info', pretty: false })
  })

  it('fails closed when a required secret is absent', () => {
    const { BETTER_AUTH_SECRET: _, ...environment } = validEnvironment

    expect(() => loadRuntimeConfig(environment)).toThrow(ConfigurationError)
  })

  it.each([
    '*',
    'http://*.localhost:3001',
    'http://user:password@localhost:3001',
    'http://localhost:3001/path'
  ])('rejects an unsafe trusted origin: %s', (origin) => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        BETTER_AUTH_TRUSTED_ORIGINS: origin
      })
    ).toThrow(ConfigurationError)
  })

  it('requires the runtime database identity', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        DATABASE_RUNTIME_URL:
          'postgresql://gateway_migrator:password@127.0.0.1:5432/platform'
      })
    ).toThrow(ConfigurationError)
  })

  it('requires distinct migration and runtime database identities', () => {
    expect(() =>
      loadLocalConfig({
        ...validEnvironment,
        DATABASE_MIGRATION_URL:
          'postgresql://gateway_runtime:password@127.0.0.1:5432/platform'
      })
    ).toThrow(ConfigurationError)
  })

  it('allows pretty logging only in development', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        NODE_ENV: 'test',
        LOG_PRETTY: 'true'
      })
    ).toThrow(ConfigurationError)
  })

  it('requires HTTPS for a production Better Auth base URL', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        NODE_ENV: 'production'
      })
    ).toThrow(ConfigurationError)
  })

  it('reports a malformed production base URL as a configuration error', () => {
    expect(() =>
      loadRuntimeConfig({
        ...validEnvironment,
        NODE_ENV: 'production',
        BETTER_AUTH_BASE_URL: 'not-a-url'
      })
    ).toThrow(ConfigurationError)
  })
})
