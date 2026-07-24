export interface GatewayAuthenticationRequiredError {
  error: {
    code: 'AUTHENTICATION_REQUIRED'
    message: string
    requestId: string
  }
}

export interface GatewayOriginNotAllowedError {
  error: {
    code: 'ORIGIN_NOT_ALLOWED'
    message: string
    requestId: string
  }
}

export interface GatewayInternalServerError {
  error: {
    code: 'INTERNAL_SERVER_ERROR'
    message: string
    requestId: string
  }
}

export type GatewayApiError =
  | GatewayAuthenticationRequiredError
  | GatewayOriginNotAllowedError
  | GatewayInternalServerError

export interface GatewayHealth {
  status: 'ok'
}

export interface GatewayCurrentUser {
  id: string
  displayName: string
  email: string
  emailVerified: boolean
  avatarUrl: string | null
}

export interface GatewayMe {
  user: GatewayCurrentUser
}
