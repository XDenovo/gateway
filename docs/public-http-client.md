# Public HTTP and Gateway client

This document defines the first Website-facing Gateway HTTP contract and the release boundary for
`@xdenovo/gateway-client`. HTTP `/v1` compatibility and package SemVer are related but independent:
a package `0.x` release does not permit a breaking change to an existing `/v1` response.

## Local topology

Local integration uses these exact Origins:

| Component | Origin |
|---|---|
| Website | `http://localhost:3000` |
| Gateway | `http://localhost:3001` |

`BETTER_AUTH_BASE_URL`, `SERVER_PORT`, and the examples in this repository use the Gateway value.
`GATEWAY_BROWSER_ALLOWED_ORIGINS` includes the Website value.

## Public routes

The client contract contains exactly two routes:

| Route | Authentication | Typed statuses | Success JSON |
|---|---|---|---|
| `GET /health` | None | `200 \| 403 \| 500` | `{ "status": "ok" }` |
| `GET /v1/me` | Persisted Better Auth Session | `200 \| 401 \| 403 \| 500` | See below |

`/health` is a shallow liveness response. It does not query PostgreSQL or another dependency and
does not report versions, uptime, configuration, hostnames, private addresses, or dependency
state.

`/v1/me` maps the authenticated User to:

```json
{
  "user": {
    "id": "user-id",
    "displayName": "Display Name",
    "email": "person@example.com",
    "emailVerified": true,
    "avatarUrl": null
  }
}
```

It does not expose Session data, Accounts, providers, tokens, timestamps, persistence fields, or
Better Auth terminology. Missing, unknown, invalid, expired, and deleted-User Sessions return
`401`. A database or other Session-resolution failure remains `500`.

Every typed error has this shape:

```json
{
  "error": {
    "code": "AUTHENTICATION_REQUIRED",
    "message": "Authentication required",
    "requestId": "request-id"
  }
}
```

The status/code pairs are:

| Status | Code | Safe default message |
|---|---|---|
| `401` | `AUTHENTICATION_REQUIRED` | `Authentication required` |
| `403` | `ORIGIN_NOT_ALLOWED` | `Origin is not allowed` |
| `500` | `INTERNAL_SERVER_ERROR` | `Internal server error` |

All `/health` and `/v1/me` responses use `Cache-Control: no-store`. The Gateway does not add ETags
or response caching to these routes.

## Browser Origin policy

`GATEWAY_BROWSER_ALLOWED_ORIGINS` is a required comma-separated list of unique, exact HTTP(S)
Origins. Wildcards, user information, paths, query strings, fragments, trailing slashes, empty
entries, and duplicates are rejected at startup.

The list has one scope: it configures Better Auth `trustedOrigins` and credentialed Hono
CORS/Origin rejection for:

- `/api/auth/*` (or the configured Better Auth base path);
- `/v1/*`;
- `/health`.

It does not define authorization, Host/DNS/TLS trust, Cookie Domain, OAuth redirect registration,
MCP access, server-to-server identity, JWKS, issuer, audience, or scope.

An `Origin` outside the list is rejected before route business logic. A request without `Origin`
remains eligible for the route and still goes through that route's authentication and
authorization rules. Allowed Browser requests receive their exact Origin, never `*`, with
credentials enabled and `Vary: Origin`.

## Client package

The private GitHub Package is ESM-only and supports modern Browser bundlers and Node.js 24. It has
no CommonJS, `require()`, legacy Node.js, Deno, or script-tag bundle compatibility contract.

Its named public API is:

- `createGatewayClient`;
- `GatewayClient`;
- `GatewayClientOptions`;
- `GatewayHealth`, `GatewayMe`, and `GatewayCurrentUser`;
- `GatewayApiError` and the status-specific public error DTOs.

It does not export the raw Hono App type, Gateway server code, Better Auth or persistence types,
server configuration, `hc`, or a default export. Hono `4.12.31` is an exact normal runtime
dependency of the package, so Website does not add a direct Hono dependency.

```ts
import { createGatewayClient } from '@xdenovo/gateway-client'

const gateway = createGatewayClient({
  baseUrl: 'https://api.xdenovoai.com',
  headers: async () => ({
    'x-client-context': 'website'
  })
})

const response = await gateway.v1.me.$get(undefined, {
  init: {
    signal: AbortSignal.timeout(5_000)
  }
})

if (response.status === 200) {
  const { user } = await response.json()
  console.log(user.displayName)
}
```

`baseUrl` is required and must be one exact absolute HTTP(S) Origin. The factory never reads an
environment variable and has no Local, Staging, or Production default. It accepts only `baseUrl`,
an optional Web-compatible `fetch`, and optional static or asynchronous common headers.

Requests default to `credentials: "include"`. The client preserves Hono RPC and Fetch behavior: it
does not parse JSON automatically, throw for non-2xx responses, retry, redirect to login, display
messages, read Cookies or tokens, or convert network/abort failures into HTTP API errors. Inspect
`status` before parsing. Per-request cancellation remains available through `AbortSignal`.

## Installing the private package

Repository workflows use their own `GITHUB_TOKEN`; no maintainer or organization publishing PAT is
used. After `XDenovo/website` is added with read access under the package's **Manage Actions
access**, Website workflows can install the package with `packages: read` and their own
`GITHUB_TOKEN`.

Local installation from GitHub Packages requires a read-only classic PAT with `read:packages`.
Keep it outside the repository:

```ini
@xdenovo:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_READ_ONLY_CLASSIC_PAT
```

Never commit the token or a secret-bearing npm configuration.

## Changesets and release

Every public client contract change carries a Changeset. The initial minor Changeset turns the
placeholder `0.0.0` manifest into the first publishable version, `0.1.0`.

On `main`, the pinned release workflow:

1. installs the pinned Node.js and pnpm toolchain;
2. regenerates and checks Better Auth schema and Drizzle migrations;
3. runs complete repository validation;
4. maintains a reviewed Changesets Version PR while Changesets remain;
5. after that Version PR is merged, builds one tarball and audits its files and dependencies;
6. runs publint, Are The Types Wrong, Node ESM, Browser bundler, and TypeScript 5 consumers;
7. publishes that same tarball to `https://npm.pkg.github.com` with `GITHUB_TOKEN`;
8. creates the matching `@xdenovo/gateway-client@<version>` tag and GitHub Release.

The package `repository` metadata associates it with `XDenovo/gateway`. GitHub Packages creates
the first package as private; do not change it to public. After the first publish, verify all of
the following before closing the implementation Issue:

- package, tag, GitHub Release, changelog, source repository, version, and commit agree;
- package visibility is still private;
- `XDenovo/website` has read access under **Manage Actions access**;
- a Website workflow can download the exact version with its `GITHUB_TOKEN` and no PAT Secret.

Published versions are immutable. If publication partially succeeds or a post-publish smoke test
fails, inspect which package/tag/release records exist, fix forward, add a new Changeset, and
publish a new version. Never overwrite, delete-and-republish, or reuse an existing version.
