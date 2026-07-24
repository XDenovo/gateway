import { betterAuth } from 'better-auth'
import { testUtils } from 'better-auth/plugins'

import {
  type AuthFactoryInput,
  createAuthOptions
} from '../../src/auth/options.js'

export function createTestAuth(input: AuthFactoryInput) {
  return betterAuth({
    ...createAuthOptions(input),
    plugins: [testUtils()]
  })
}
