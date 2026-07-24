import { betterAuth } from 'better-auth'

import { type AuthFactoryInput, createAuthOptions } from './options.js'

export function createRuntimeAuth(input: AuthFactoryInput) {
  return betterAuth(createAuthOptions(input))
}

export type GatewayAuth = ReturnType<typeof createRuntimeAuth>
export type GatewaySessionResult = NonNullable<
  Awaited<ReturnType<GatewayAuth['api']['getSession']>>
>
export type GatewayUser = GatewaySessionResult['user']
export type GatewaySession = GatewaySessionResult['session']
