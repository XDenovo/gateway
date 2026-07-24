# XDeNovo Gateway

## Repository Role

- This repository owns the XDeNovo platform Gateway: authentication and authorization, the
  Dashboard Web API, invocation and billing events, and the unified public MCP endpoint.
- The production public endpoint is `https://api.xdenovoai.com/`.
- This is an independent Git repository with its own small pnpm workspace. It is not a package in
  the parent checkout's workspace and is not a deployable part of that parent checkout.
- Use the canonical
  [Platform architecture](https://github.com/XDenovo/platform/blob/main/docs/architecture.md) and
  [approved technology stack](https://github.com/XDenovo/platform/blob/main/docs/techstack.md) as
  supplemental platform-wide context. Keep this repository's documentation understandable when
  it is checked out by itself.

## Architecture and Security Guardrails

- Caddy is the only component directly exposed to the public network. Run Gateway behind Caddy in
  production; do not give the application process its own public listener.
- Gateway is the platform authentication and authorization boundary. It acts as the external
  OAuth Authorization Server and Resource Server and owns the policy used by the Website and MCP
  clients.
- Never forward an external access token to a Compute MCP Service. Issue a short-lived internal
  credential restricted to the target service's audience and required scopes.
- Treat internal credential lifetime, audience, scope, signing, verification, and rotation as
  security controls, not transport details.
- Gateway owns authentication data and its invocation, usage, pricing, and billing-event data. It
  must not read a Compute MCP Service's business schema or Artifact namespace.
- Gateway must not submit or query Workflows directly or use Workflow history as product state.
  Long-running execution remains encapsulated by each Compute MCP Service.
- Usage and billing events originate in Gateway. Do not reconstruct them from downstream Job
  tables.
- Compute MCP Services are private downstreams. Do not expose their addresses or implementation
  details through public errors, metadata, or logs.
- Never log access tokens, internal credentials, secrets, session cookies, authorization headers,
  or unnecessary personal data.
- Keep user-level authorization, rate limits, invocation policy, and billing decisions in Gateway;
  do not move them to Caddy.

## Stack and Project Layout

- Node.js ESM application using Hono and `@hono/node-server`.
- Strict TypeScript with `NodeNext` module semantics.
- pnpm is the repository package manager. Exact package and dependency versions are owned by
  `package.json` and `pnpm-lock.yaml`.
- `src/index.ts`: current application and process entry point.
- `src/app.ts`: Hono application construction without binding a listener.
- `src/auth/`: runtime Better Auth factory and its schema-generation-only CLI configuration.
- `src/db/`: generated Better Auth schema, runtime database construction, and explicit migrator.
- `test/`: unit tests, PostgreSQL 18.4 integration tests, and the static test-only Auth factory.
- `drizzle/`: committed SQL migrations and Drizzle metadata.
- `docs/`: Gateway-specific technical design.
- `packages/gateway-client/`: independently publishable, ESM-only typed Hono RPC client.
- `pnpm-workspace.yaml`: workspace membership plus pnpm supply-chain and dependency-build policy.

A library mentioned in a design document is not installed or adopted until the manifest,
lockfile, and required configuration exist.

## Setup

Node.js `24.18.0` is pinned in `.node-version` and `package.json`. pnpm `11.15.1` is pinned through
the `packageManager` field. Docker is required only for Testcontainers integration tests.

```bash
pnpm install --frozen-lockfile
```

When intentionally changing dependencies, use pnpm and commit both `package.json` and
`pnpm-lock.yaml`:

```bash
pnpm add <package>
pnpm add --save-dev <package>
pnpm remove <package>
```

Do not introduce another package-manager lockfile.

Review any dependency build script before adding a narrowly scoped approval to `allowBuilds` in
`pnpm-workspace.yaml`. Never enable all present and future dependency build scripts globally.

Runtime and migration credentials must stay in separate process environments. Copy
`.env.runtime.example` to `.env.runtime` and `.env.migration.example` to `.env.migration`, then
replace the non-secret placeholders. The sibling `platform-deploy` repository owns PostgreSQL
startup, bootstrap, persistence, and reset; this repository owns only Gateway migrations.

Never commit credentials or secret-bearing environment files.

## Development Workflow

```bash
pnpm dev
pnpm build
pnpm start
```

- `pnpm dev` runs Node watch mode with the `tsx` loader and restarts on source changes.
- The Local Website is `http://localhost:3000`; the example Gateway listens on
  `http://127.0.0.1:3001` with Better Auth based at `http://localhost:3001`.
- `pnpm build` compiles `src/` into `dist/`.
- `pnpm start` runs `dist/index.js` and therefore requires a successful build first.
- `pnpm db:migrate` loads only `.env.migration`; normal runtime commands load only `.env.runtime`.
- Route and middleware tests call the app returned by `createApp()` without starting a server.

## Implementation Conventions

- Keep HTTP and MCP handlers thin. Separate transport, authentication, domain logic, persistence,
  downstream MCP clients, and event recording.
- Validate public inputs, token claims, configuration, and downstream responses at their trust
  boundaries. Do not use unchecked type assertions to bypass validation.
- Preserve Hono's inferred types across middleware and route composition.
- Use ESM-compatible imports and explicit relative file extensions where required by emitted
  `NodeNext` modules.
- Centralize error handling. Public errors must be stable and useful without exposing stack
  traces, database details, private service addresses, token-validation internals, or secrets.
- Preserve cancellation, streaming, and backpressure behavior for MCP Streamable HTTP. Gateway
  MCP routes must not be cached.
- Keep public tool names and routing stable. Downstream discovery wrappers are responsible for
  selecting the target service, issuing the restricted internal credential, forwarding the call,
  and recording the resulting usage event.
- Make invocation and billing-event recording safe under retries. Define idempotency and failure
  semantics before introducing chargeable behavior.
- Keep authentication and authorization checks explicit at every public entry point; successful
  authentication alone does not imply permission for a tool or resource.

Pino writes structured NDJSON by default. Hono request IDs create request-scoped child loggers.
Use stable `event` field names. Never log exception messages or stacks at public trust boundaries;
use `describeError()` and the configured Pino redaction paths. Pretty logging is development-only.

Biome commands are `pnpm check` and `pnpm check:fix`. Focus a check or safe fix with
`pnpm exec biome check <paths...>` or `pnpm exec biome check --write <paths...>`.

## Testing and Validation

The complete repository validation is:

```bash
pnpm validate
```

Focused validation commands are:

```bash
pnpm typecheck
pnpm test:unit
pnpm test:unit -- test/unit/config.test.ts
pnpm test:integration
pnpm test:integration -- test/integration/auth.integration.test.ts
pnpm test:coverage
pnpm build
pnpm client:package:check
pnpm db:check
```

Unit tests live in `test/unit/**/*.test.ts`. Integration tests live in
`test/integration/**/*.test.ts`, start `postgres:18.4` through Testcontainers, bootstrap isolated
test roles, apply the committed migrations, and require Docker. No coverage threshold is currently
enforced.

CI runs a frozen install, regenerates and checks the Better Auth schema and Drizzle migrations,
then runs `pnpm validate`. Validation includes the packed Gateway client and its clean Node,
Browser, and TypeScript 5 consumers. Reproduce generated-artifact validation on a clean worktree
with `pnpm check:generated`.

Security- and protocol-sensitive tests should cover, as applicable:

- OAuth and PKCE success and rejection paths;
- token signature, issuer, audience, scope, expiry, and rotation behavior;
- proof that external access tokens are never forwarded downstream;
- cross-service and cross-user authorization failures;
- tool discovery, stable routing, downstream timeout, cancellation, and error mapping;
- invocation and billing-event idempotency across success, failure, retry, and cancellation;
- database role and schema ownership boundaries once persistence exists.

## Build and Deployment

- Production container composition, Caddy routing, systemd supervision, secrets delivery, and
  operational runbooks belong to `XDenovo/platform-deploy`.
- Preserve MCP streaming semantics through the application and reverse proxy. Do not enable
  response caching on MCP, OAuth, authentication, or Dashboard API routes.
- Health endpoints must not expose internal state or expand the public attack surface. Public and
  trusted-network probes should follow the platform deployment design.
- Do not introduce Kubernetes or Slurm without an approved platform architecture decision.

TODO: When a repository-owned Dockerfile or image workflow is added, document the image build,
smoke-test, and handoff commands here.

## Git and Pull Requests

- Treat the Issue as the implementation specification and the PR as the result report.
- Follow Conventional Commits.
- Use the XDenovo organization-default Issue and PR templates.
- Preserve unrelated working-tree changes, and stage only the explicit paths intended for a
  commit.
- Update this file when the real setup, validation, build, or deployment workflow changes. Keep
  transient implementation progress in Issues and PRs rather than agent instructions.
