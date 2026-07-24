import { z } from 'zod'

const environmentSchema = z.enum(['development', 'test', 'production'])
const logLevelSchema = z.enum([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent'
])
const booleanStringSchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')

const httpOriginSchema = z.string().refine(isExactHttpOrigin, {
  message: 'must be an exact HTTP or HTTPS origin'
})

const trustedOriginsSchema = z
  .string()
  .min(1)
  .transform((value) => value.split(',').map((origin) => origin.trim()))
  .pipe(z.array(httpOriginSchema).min(1))
  .refine((origins) => new Set(origins).size === origins.length, {
    message: 'must not contain duplicate origins'
  })

const authBasePathSchema = z
  .string()
  .regex(/^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/, {
    message: 'must be an absolute path without a trailing slash'
  })

const commonEnvironmentSchema = z
  .object({
    NODE_ENV: environmentSchema,
    BETTER_AUTH_BASE_URL: httpOriginSchema,
    BETTER_AUTH_BASE_PATH: authBasePathSchema,
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_TRUSTED_ORIGINS: trustedOriginsSchema,
    SERVER_HOST: z.string().trim().min(1),
    SERVER_PORT: z.coerce.number().int().min(1).max(65_535),
    LOG_LEVEL: logLevelSchema,
    LOG_PRETTY: booleanStringSchema
  })
  .superRefine((environment, context) => {
    if (environment.LOG_PRETTY && environment.NODE_ENV !== 'development') {
      context.addIssue({
        code: 'custom',
        path: ['LOG_PRETTY'],
        message: 'may be enabled only in development'
      })
    }

    if (
      environment.NODE_ENV === 'production' &&
      !environment.BETTER_AUTH_BASE_URL.startsWith('https://')
    ) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_BASE_URL'],
        message: 'must use HTTPS in production'
      })
    }
  })

const runtimeEnvironmentSchema = commonEnvironmentSchema.extend({
  DATABASE_RUNTIME_URL: databaseUrlSchema('gateway_runtime')
})

const migrationEnvironmentSchema = z.object({
  DATABASE_MIGRATION_URL: databaseUrlSchema('gateway_migrator')
})

const localEnvironmentSchema = runtimeEnvironmentSchema
  .extend(migrationEnvironmentSchema.shape)
  .superRefine((environment, context) => {
    const migrationIdentity = new URL(environment.DATABASE_MIGRATION_URL)
      .username
    const runtimeIdentity = new URL(environment.DATABASE_RUNTIME_URL).username

    if (migrationIdentity === runtimeIdentity) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_MIGRATION_URL'],
        message: 'must use a distinct identity from DATABASE_RUNTIME_URL'
      })
    }
  })

export class ConfigurationError extends Error {
  constructor(fields: readonly string[]) {
    super(
      `Invalid Gateway configuration: ${fields.length > 0 ? fields.join(', ') : 'unknown field'}`
    )
    this.name = 'ConfigurationError'
  }
}

export type RuntimeConfig = ReturnType<typeof mapRuntimeConfig>
export type MigrationConfig = ReturnType<typeof loadMigrationConfig>
export type LocalConfig = RuntimeConfig & {
  database: RuntimeConfig['database'] & {
    migrationUrl: string
  }
}

export function loadRuntimeConfig(
  environment: NodeJS.ProcessEnv = process.env
): RuntimeConfig {
  return mapRuntimeConfig(
    parseEnvironment(runtimeEnvironmentSchema, environment)
  )
}

export function loadMigrationConfig(
  environment: NodeJS.ProcessEnv = process.env
): {
  database: {
    migrationUrl: string
  }
} {
  const parsed = parseEnvironment(migrationEnvironmentSchema, environment)
  return {
    database: {
      migrationUrl: parsed.DATABASE_MIGRATION_URL
    }
  }
}

export function loadLocalConfig(
  environment: NodeJS.ProcessEnv = process.env
): LocalConfig {
  const parsed = parseEnvironment(localEnvironmentSchema, environment)
  const runtime = mapRuntimeConfig(parsed)

  return {
    ...runtime,
    database: {
      ...runtime.database,
      migrationUrl: parsed.DATABASE_MIGRATION_URL
    }
  }
}

function mapRuntimeConfig(
  environment: z.infer<typeof runtimeEnvironmentSchema>
) {
  return {
    environment: environment.NODE_ENV,
    auth: {
      baseUrl: environment.BETTER_AUTH_BASE_URL,
      basePath: environment.BETTER_AUTH_BASE_PATH,
      secret: environment.BETTER_AUTH_SECRET,
      trustedOrigins: environment.BETTER_AUTH_TRUSTED_ORIGINS
    },
    database: {
      runtimeUrl: environment.DATABASE_RUNTIME_URL
    },
    server: {
      host: environment.SERVER_HOST,
      port: environment.SERVER_PORT
    },
    log: {
      level: environment.LOG_LEVEL,
      pretty: environment.LOG_PRETTY
    }
  } as const
}

function databaseUrlSchema(expectedIdentity: string) {
  return z.string().refine(
    (value) => {
      try {
        const url = new URL(value)
        return (
          (url.protocol === 'postgresql:' || url.protocol === 'postgres:') &&
          decodeURIComponent(url.username) === expectedIdentity &&
          url.password.length > 0 &&
          url.pathname.length > 1 &&
          url.search.length === 0 &&
          url.hash.length === 0
        )
      } catch {
        return false
      }
    },
    {
      message: `must be a PostgreSQL URL for ${expectedIdentity}`
    }
  )
}

function isExactHttpOrigin(value: string): boolean {
  if (value.includes('*')) {
    return false
  }

  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username.length === 0 &&
      url.password.length === 0 &&
      url.pathname === '/' &&
      url.search.length === 0 &&
      url.hash.length === 0 &&
      url.origin === value
    )
  } catch {
    return false
  }
}

function parseEnvironment<Schema extends z.ZodType>(
  schema: Schema,
  environment: NodeJS.ProcessEnv
): z.output<Schema> {
  const result = schema.safeParse(environment)
  if (result.success) {
    return result.data
  }

  const fields = [
    ...new Set(
      result.error.issues.map((issue) =>
        issue.path.length > 0 ? String(issue.path[0]) : 'environment'
      )
    )
  ]
  throw new ConfigurationError(fields)
}
