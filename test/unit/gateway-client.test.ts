import {
  createGatewayClient,
  type GatewayApiError,
  type GatewayHealth,
  type GatewayMe
} from '@xdenovo/gateway-client'
import { describe, expect, it } from 'vitest'

describe('@xdenovo/gateway-client', () => {
  it('uses the explicit Origin with credentials and an injected Fetch', async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = []
    const client = createGatewayClient({
      baseUrl: 'https://api.example.test',
      fetch: async (input, init) => {
        requests.push({ input, init })
        return Response.json({ status: 'ok' } satisfies GatewayHealth)
      },
      headers: async () => ({
        'x-client-header': 'client-value'
      })
    })

    const response = await client.health.$get()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.input).toBe('https://api.example.test/health')
    expect(requests[0]?.init?.credentials).toBe('include')
    expect(new Headers(requests[0]?.init?.headers).get('x-client-header')).toBe(
      'client-value'
    )
  })

  it.each([
    undefined,
    '',
    '*',
    '/relative',
    'ftp://api.example.test',
    'https://user:password@api.example.test',
    'https://api.example.test/path',
    'https://api.example.test?query=yes',
    'https://api.example.test#fragment',
    'https://api.example.test/'
  ])('rejects a non-Origin base URL: %s', (baseUrl) => {
    expect(() =>
      createGatewayClient({
        baseUrl: baseUrl as string
      })
    ).toThrow(TypeError)
  })

  it('preserves per-request cancellation and Fetch failures', async () => {
    const failure = new DOMException('request aborted', 'AbortError')
    const signal = AbortSignal.abort(failure)
    const client = createGatewayClient({
      baseUrl: 'https://api.example.test',
      fetch: async (_input, init) => {
        expect(init?.signal).toBe(signal)
        expect(new Headers(init?.headers).get('x-static')).toBe('yes')
        throw failure
      },
      headers: {
        'x-static': 'yes'
      }
    })

    await expect(
      client.health.$get(undefined, {
        init: {
          signal
        }
      })
    ).rejects.toBe(failure)
  })

  it.each([
    [200, { status: 'ok' } satisfies GatewayHealth],
    [403, error('ORIGIN_NOT_ALLOWED', 'Origin is not allowed')],
    [500, error('INTERNAL_SERVER_ERROR', 'Internal server error')]
  ] as const)('preserves the /health HTTP %i branch', async (status, body) => {
    const client = createGatewayClient({
      baseUrl: 'https://api.example.test',
      fetch: async () => Response.json(body, { status })
    })

    const response = await client.health.$get()

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
  })

  it.each([
    [
      200,
      {
        user: {
          id: 'user-1',
          displayName: 'Test User',
          email: 'test@example.test',
          emailVerified: true,
          avatarUrl: null
        }
      } satisfies GatewayMe
    ],
    [401, error('AUTHENTICATION_REQUIRED', 'Authentication required')],
    [403, error('ORIGIN_NOT_ALLOWED', 'Origin is not allowed')],
    [500, error('INTERNAL_SERVER_ERROR', 'Internal server error')]
  ] as const)('preserves the /v1/me HTTP %i branch', async (status, body) => {
    const client = createGatewayClient({
      baseUrl: 'https://api.example.test',
      fetch: async () => Response.json(body, { status })
    })

    const response = await client.v1.me.$get()

    expect(response.status).toBe(status)
    expect(await response.json()).toEqual(body)
  })
})

function error(
  code: GatewayApiError['error']['code'],
  message: string
): GatewayApiError {
  switch (code) {
    case 'AUTHENTICATION_REQUIRED':
      return {
        error: {
          code: 'AUTHENTICATION_REQUIRED',
          message,
          requestId: 'request-1'
        }
      }
    case 'ORIGIN_NOT_ALLOWED':
      return {
        error: { code: 'ORIGIN_NOT_ALLOWED', message, requestId: 'request-1' }
      }
    case 'INTERNAL_SERVER_ERROR':
      return {
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message,
          requestId: 'request-1'
        }
      }
  }
}
