# Gateway 技术栈

本文记录 XDenovo Gateway 当前采用的仓库级技术选择。平台边界、安全约束和跨仓库基线分别由
[Platform architecture](https://github.com/XDenovo/platform/blob/main/docs/architecture.md) 和
[approved technology stack](https://github.com/XDenovo/platform/blob/main/docs/techstack.md) 定义。

技术出现在本文中即表示 Gateway 应采用该选择；明确不采用的方案会单独说明。本文不表达安装或实施进度。
精确依赖版本和实际安装状态以 `package.json`、`pnpm-lock.yaml` 和 Runtime 版本文件为准。

## 1. 技术栈总览

| 能力 | 选择 |
|---|---|
| Runtime | Node.js 24 LTS、TypeScript ESM、Hono、`@hono/node-server` |
| Package Manager | pnpm 11.x；本仓库拥有独立 Manifest 和 Lockfile |
| Persistence | Drizzle ORM、`pg`（node-postgres）、drizzle-kit |
| Authentication | Better Auth、Drizzle Adapter、OAuth 2.1 Provider、JWT/JWKS |
| Internal Credential | `jose`；与外部 Access Token 使用独立的 issuer、签名密钥和 JWKS |
| Public MCP Server | `@prefecthq/fastmcp-ts/server` |
| Downstream MCP Client | `@prefecthq/fastmcp-ts/client`；通过 Streamable HTTP 调用 Compute MCP Services |
| Dashboard Web API | Hono RPC；Gateway 发布版本化、预编译的 `@xdenovo/gateway-client` 供 Website 使用 |
| Rate Limiting | Better Auth 内置 Rate Limiter、`rate-limiter-flexible`；当前使用进程内存 Backend |
| Validation | Zod；Hono Route 边界使用 `@hono/zod-validator` |
| Observability | Pino 结构化日志、Hono Request ID、OpenTelemetry Traces/Metrics、OTLP/HTTP Protobuf |
| Testing | Vitest、`@vitest/coverage-v8`、Testcontainers PostgreSQL |
| Formatter and Linter | Biome（`@biomejs/biome`） |
| Type Check and Build | TypeScript 7 原生 `tsc`；当前不使用 Bundler |
| Development Runner | `tsx watch` |
| Gateway Client Distribution | 私有 GitHub Packages、Changesets、GitHub Actions、publint、Are the Types Wrong |
| Configuration | Node.js 原生 Env File + Zod；不使用 dotenv 或 `@t3-oss/env-core` |

## 2. Better Auth 组件组合

### 2.1 登录与 OAuth

| 能力 | 选择 |
|---|---|
| Dashboard Session | Better Auth Cookie Session |
| Social Login | Google、GitHub |
| Email + Password | 不启用 |
| MCP Authorization Server | `@better-auth/oauth-provider` |
| External Access Token | `jwt()`、JWT/JWKS |
| MCP Client Registration | 当前使用 DCR；CIMD 稳定后优先使用 CIMD，DCR 作为兼容性 fallback |

旧 `mcp()` 插件不采用；MCP OAuth 由 OAuth 2.1 Provider 提供。Email + Password 未启用，因此当前不选择
Captcha 和 Have I Been Pwned 插件。

### 2.2 环境配置

| 配置 | 插件 | 约束 |
|---|---|---|
| Production | `jwt()`、`oauthProvider()` | 只包含产品运行所需插件 |
| Development | Production 插件 + `openAPI()` | Auth Reference 不进入生产配置 |
| Test | Production 插件 + `testUtils()` | 使用独立 Test Auth Factory，不进入生产配置 |

三个配置复用基础 Better Auth Options，但分别使用静态插件数组，以保留插件 API 的 TypeScript 类型推断。

### 2.3 DCR 与 CIMD

当前稳定版使用 Dynamic Client Registration，并支持未预注册的 Public MCP Client。精确 DCR 配置、限流和
兼容测试属于认证设计与实施，不在本文展开。

> **TODO — CIMD：** 等 Better Auth 1.7 完整稳定版以及匹配的 `@better-auth/cimd` 稳定版发布后，将整个
> Better Auth 包族统一升级并启用 Client ID Metadata Documents。不得在生产中混用 Better Auth 1.6 stable
> 与 1.7 beta/RC 包。

### 2.4 版本来源

所有 Better Auth 核心包、Drizzle Adapter 和独立插件保持在同一稳定版本线。精确版本由 `package.json` 和
`pnpm-lock.yaml` 固定，不在本文维护补丁版本。

具体 Route、issuer、audience、scope、Consent、Token 验证、账户关联、安全控制和 Migration 流程不属于
技术栈文档；这些内容在认证设计或 ADR 中记录。

## 3. 内部凭证

| 能力 | 选择 |
|---|---|
| Signing and Verification | `jose` |
| Trust Domain | 内部凭证与 Better Auth 外部 Access Token 使用独立的 issuer、签名密钥和 JWKS |
| Downstream Verification | Compute MCP Services 只信任 Gateway 的内部 issuer 和 JWKS |

Better Auth 的 `jwt()` 负责外部 OAuth Access Token；`jose` 负责 Gateway 为单次下游调用签发短期内部凭证。
Compute MCP Service 不接受 Better Auth 外部 Access Token，Gateway 也不向下游转发该 Token。

内部凭证 Claims、audience、scope、有效期、密钥轮换和 JWKS 分发属于跨服务安全契约，在认证设计或 ADR 中记录。

## 4. MCP Server 与 Client

Gateway 在一次调用链中同时承担 MCP Server 和 MCP Client 两种角色：

```text
外部 MCP Client → Gateway Public MCP Server → Gateway Downstream MCP Client → Compute MCP Service
```

| 角色 | 选择 | 用途 |
|---|---|---|
| Public MCP Server | `@prefecthq/fastmcp-ts/server` | 接收外部 MCP Client 的工具发现与调用 |
| Downstream MCP Client | `@prefecthq/fastmcp-ts/client` | 携带短期内部凭证，通过 Streamable HTTP 调用目标 Compute MCP Service |

`@prefecthq/fastmcp-ts` 建立在官方 MCP TypeScript SDK 之上，并同时提供 Server 和 Client API。Gateway 当前
直接使用 FastMCP 的 Client API，因此不把 `@modelcontextprotocol/sdk` 作为独立的直接依赖；只有在实现中
确实需要 FastMCP 未暴露的底层协议能力时才重新评估。

具体工具路由、下游连接生命周期、取消与流式传播、错误映射和使用事件记录属于 Gateway MCP 设计，不在本文
展开。

## 5. 限流

| 边界 | 组件 | Backend |
|---|---|---|
| Better Auth Endpoints | Better Auth 内置 Rate Limiter | Memory |
| Dashboard API 与 Public MCP | `rate-limiter-flexible` | `RateLimiterMemory` |

当前部署保持单个 Gateway Node.js 进程，因此采用进程内存 Backend，不引入 Redis、Valkey，也不使用
PostgreSQL 承担请求热路径上的限流计数。限流实现通过仓库内接口封装；开始运行多个 Gateway 进程时，将
Backend 迁移到 Redis 或 Valkey。

内存计数会在进程重启时清空，因此只用于流量控制和防滥用。套餐额度、授权、调用配额和计费状态以 PostgreSQL
中的持久业务数据为准，不能由内存 Rate Limiter 代替。

具体 Key、Window、Limit、响应 Header、可信代理 IP 解析和故障策略属于安全与 API 设计，不在本文展开。

## 6. 可观测性组件组合

| 能力 | 选择 |
|---|---|
| Production Logging | Pino 10.x；NDJSON 输出到 stdout/stderr |
| Development Logging | `pino-pretty`，仅作为开发依赖 |
| Request Correlation | Hono `requestId()`；使用仓库内 Hono Middleware 创建 request-scoped Pino Child Logger |
| Tracing and Metrics | OpenTelemetry Node SDK |
| Instrumentation | OpenTelemetry HTTP、Undici、`pg` 和 Pino Instrumentation |
| Telemetry Export | OTLP/HTTP Protobuf，目标为 OpenTelemetry Collector |

Hono 内置 `logger()`、`pino-http` 和 OpenTelemetry Logs SDK 不作为生产日志方案。Pino Instrumentation
只用于关联 `trace_id`、`span_id` 和日志，关闭 OpenTelemetry Log Sending；OpenTelemetry Logs 待
JavaScript Logs Signal 稳定后再评估。

具体日志字段、Request ID 传播、敏感字段脱敏、Trace 采样、Metrics 和 Collector 后端配置不属于技术栈
文档；这些内容在 Gateway 实施规范和 `platform-deploy` 可观测性设计中记录。

## 7. 测试组件组合

| 能力 | 选择 |
|---|---|
| Test Runner | Vitest |
| Coverage | `@vitest/coverage-v8` |
| PostgreSQL Integration | `testcontainers`、`@testcontainers/postgresql`、真实 PostgreSQL |

Vitest 与 `@vitest/coverage-v8` 保持相同版本，Testcontainers 核心包与 PostgreSQL Module 保持相同版本；
精确版本由 `package.json` 和 `pnpm-lock.yaml` 固定。SQLite 和数据库 Mock 不替代 PostgreSQL 集成测试。

## 8. Formatter 与 Linter

Biome（`@biomejs/biome`）统一承担代码格式化和静态检查，不并行使用 Prettier 或 ESLint。精确版本和命令由
`package.json`、`pnpm-lock.yaml` 与 `biome.json` 定义。

## 9. 类型检查、构建与开发运行

| 能力 | 选择 |
|---|---|
| Development Runner | `tsx watch` |
| Type Check | TypeScript 7 原生 `tsc` |
| Gateway Build | `tsc` 输出 Node.js ESM |
| Gateway Client Build | `tsc` 输出 ESM 和 TypeScript Declaration |
| Bundler | 当前不使用 |

`tsx watch` 只用于本地开发时直接运行和重启 TypeScript 源码；它不替代 `tsc` 类型检查，也不进入生产
Runtime。Node.js 原生 Type Stripping 不读取 `tsconfig.json`，因此当前不替代 `tsx watch`。

不单独使用 `tsgo` 或 `@typescript/native-preview`；原生编译器已经由稳定版 `typescript` 包中的 `tsc`
提供。tsdown 仅在 `@xdenovo/gateway-client` 出现多入口、声明文件打包或单文件输出等实际需求后重新评估。
精确版本、Package Exports 和构建命令由 `package.json`、`pnpm-lock.yaml` 与 TypeScript 配置定义。

## 10. Gateway Client 发布

| 能力 | 选择 |
|---|---|
| Package | Gateway 仓库内的独立 `packages/gateway-client` Package |
| Registry | GitHub Packages；私有 `@xdenovo/gateway-client` |
| Version and Changelog | `@changesets/cli` |
| Release Automation | `changesets/action`、GitHub Actions |
| Publish Authentication | GitHub Actions `GITHUB_TOKEN` |
| Package Validation | publint、`@arethetypeswrong/cli` |

只有影响 Gateway Client 公共契约的改动才添加 Changeset；纯 Gateway 服务端改动不触发 Client
版本发布。Changesets 生成版本与 Changelog Release PR，合并后由 GitHub Actions 构建、验证并发布到
GitHub Packages。

精确 SemVer 策略、Package Access、Release Workflow 和 Website 安装认证属于发布规范与 CI 实施，不在
本文展开。

## 11. 环境配置

| 能力 | 选择 |
|---|---|
| Local Env Loading | Node.js 原生 `--env-file` 和 `--env-file-if-exists` |
| Production Env Loading | Docker Compose 或 systemd 注入 `process.env` |
| Validation and Types | Zod；单一 Gateway Config Module |

dotenv 和 `@t3-oss/env-core` 不采用。Gateway 是不经过 Bundler 的纯服务端 Node.js 应用，不需要
T3 Env 的 Server/Client 隔离、Client Prefix 或 Bundler Runtime Env Mapping。

具体变量、默认值、Env File 分层顺序和敏感配置注入方式不属于技术栈文档；这些内容在 Gateway 配置规范和
`platform-deploy` 部署配置中记录。
