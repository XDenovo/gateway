import pino, {
  type DestinationStream,
  type LevelWithSilent,
  type Logger
} from 'pino'

const redactedPaths = [
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'headers.authorization',
  'headers.Authorization',
  'headers.cookie',
  'headers.Cookie',
  'req.headers.authorization',
  'req.headers.Authorization',
  'req.headers.cookie',
  'req.headers.Cookie',
  'request.headers.authorization',
  'request.headers.Authorization',
  'request.headers.cookie',
  'request.headers.Cookie',
  'session',
  '*.session',
  'sessionToken',
  '*.sessionToken',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'betterAuthSecret',
  '*.betterAuthSecret',
  'databaseUrl',
  '*.databaseUrl',
  'password',
  '*.password',
  'user',
  '*.user',
  'email',
  '*.email',
  'name',
  '*.name',
  'ip',
  '*.ip',
  'remoteAddress',
  '*.remoteAddress'
] as const

export interface LogConfig {
  level: LevelWithSilent
  pretty: boolean
}

export function createLogger(
  config: LogConfig,
  destination?: DestinationStream
): Logger {
  const options: pino.LoggerOptions = {
    level: config.level,
    base: { service: 'gateway' },
    redact: {
      paths: [...redactedPaths],
      censor: '[Redacted]'
    }
  }

  if (destination) {
    return pino(options, destination)
  }

  if (config.pretty) {
    return pino(
      options,
      pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          singleLine: true
        }
      })
    )
  }

  return pino(options)
}

export function describeError(error: unknown): { errorType: string } {
  if (!(error instanceof Error)) {
    return { errorType: 'UnknownError' }
  }

  const candidate = error.constructor.name
  const errorType = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate)
    ? candidate
    : 'Error'

  return { errorType }
}
