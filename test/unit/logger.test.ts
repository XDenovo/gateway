import { Writable } from 'node:stream'

import { describe, expect, it } from 'vitest'

import { createLogger, describeError } from '../../src/logging.js'

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

describe('structured logging', () => {
  it('redacts credentials, session material, and personal data', () => {
    const sink = new LogSink()
    const logger = createLogger({ level: 'info', pretty: false }, sink)
    const secrets = [
      'Bearer external-access-token',
      'better-auth.session_token=session-token',
      'session-token',
      'better-auth-secret',
      'postgresql://gateway_runtime:database-password@localhost/platform',
      'database-password',
      'person@example.com'
    ]

    logger.info(
      {
        authorization: secrets[0],
        cookie: secrets[1],
        session: { token: secrets[2] },
        betterAuthSecret: secrets[3],
        databaseUrl: secrets[4],
        password: secrets[5],
        email: secrets[6]
      },
      'redaction check'
    )

    const output = sink.lines.join('')
    for (const secret of secrets) {
      expect(output).not.toContain(secret)
    }
    expect(JSON.parse(output)).toMatchObject({
      authorization: '[Redacted]',
      cookie: '[Redacted]',
      session: '[Redacted]',
      betterAuthSecret: '[Redacted]',
      databaseUrl: '[Redacted]',
      password: '[Redacted]',
      email: '[Redacted]'
    })
  })

  it('describes errors without logging their message or stack', () => {
    const secret = 'postgresql://gateway_runtime:password@localhost/platform'
    const fields = describeError(new Error(`connection failed: ${secret}`))

    expect(fields).toEqual({ errorType: 'Error' })
    expect(JSON.stringify(fields)).not.toContain(secret)
  })
})
