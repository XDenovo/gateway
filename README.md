# XDeNovo Gateway

The Gateway is the XDeNovo platform authentication and authorization boundary. This repository
currently provides the first Local persistence slice: PostgreSQL-backed Better Auth Sessions,
Hono integration, least-privilege Drizzle migrations, and redacted structured logging.

External login providers, MCP OAuth, Dashboard product routes, and Production deployment remain
out of scope for this slice.

## Prerequisites

- Node.js `24.18.0` (pinned in `.node-version` and `package.json`)
- pnpm `11.15.1` (pinned in `package.json`)
- Docker for the PostgreSQL 18.4 integration tests
- A Local PostgreSQL service and roles from
  [XDenovo/platform-deploy#1](https://github.com/XDenovo/platform-deploy/issues/1) when running the
  Gateway outside tests

Install the exact locked dependencies:

```bash
pnpm install --frozen-lockfile
```

## Local PostgreSQL and configuration

The canonical role contract is in the
[Platform architecture](https://github.com/XDenovo/platform/blob/main/docs/architecture.md#gateway-数据库角色与迁移所有权).
The deployment repository creates the `platform` database plus the `gateway_migrator` and
`gateway_runtime` login roles. It does not create Gateway schemas or tables.

Follow the Local start, readiness, and bootstrap workflow owned by `platform-deploy`. The Gateway
expects PostgreSQL 18.4 on `127.0.0.1:5432`, database `platform`, with these separate connections:

```text
postgresql://gateway_migrator:<local-password>@127.0.0.1:5432/platform
postgresql://gateway_runtime:<different-local-password>@127.0.0.1:5432/platform
```

Keep migration and runtime credentials in different process environments:

```bash
cp .env.migration.example .env.migration
cp .env.runtime.example .env.runtime
```

Replace every placeholder locally. Use an independently generated Better Auth secret of at least
32 characters. The `.env.migration` and `.env.runtime` files are ignored by Git.

Runtime configuration rejects missing values, non-exact origins, wildcard origins, an unexpected
database identity, an insecure Production Auth base URL, or pretty logging outside development.
`BETTER_AUTH_TRUSTED_ORIGINS` is a comma-separated exact allowlist. Do not add a wildcard when
credentialed CORS is enabled.

## Migrations and development

Generate the Better Auth Drizzle schema with the repository-pinned CLI:

```bash
pnpm auth:schema:generate
```

Generate a reviewable Drizzle migration after an intentional schema change:

```bash
pnpm db:generate
```

Apply committed migrations explicitly with only the migration environment:

```bash
pnpm db:migrate
```

The command is safe to rerun. Normal Gateway startup never applies migrations and reads only
`.env.runtime`:

```bash
pnpm dev
```

The default example listens on `http://127.0.0.1:3000`. In Production, Caddy remains the only
public listener; the Gateway application must stay behind it.

To run compiled output:

```bash
pnpm build
pnpm start
```

## Validation

Run all repository checks:

```bash
pnpm validate
```

Individual and focused commands are:

```bash
pnpm check
pnpm check:fix
pnpm exec biome check src/app.ts
pnpm exec biome check --write src/app.ts
pnpm check:boundaries
pnpm typecheck
pnpm test:unit
pnpm test:unit -- test/unit/config.test.ts
pnpm test:integration
pnpm test:integration -- test/integration/auth.integration.test.ts
pnpm test:coverage
pnpm build
pnpm db:check
```

Integration tests start their own `postgres:18.4` Testcontainer, bootstrap distinct migration and
runtime roles, apply the committed migrations, and stop the container. They do not use Local
credentials or require the sibling deployment checkout.

CI installs with `--frozen-lockfile`, verifies regenerated Better Auth and Drizzle artifacts, and
runs `pnpm validate`.

## Logging and security notes

Normal runtime logs are Pino NDJSON on stdout/stderr. Development can opt into `pino-pretty` only
with `NODE_ENV=development` and `LOG_PRETTY=true`. Hono request IDs are attached to request-scoped
child loggers.

Do not log request headers, Cookies, access tokens, Session data, database URLs, secrets, or
personal data. The central error boundary emits stable public errors and records only a safe error
type, never an exception message or stack.
