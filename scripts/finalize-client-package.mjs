import { cp, mkdir, rm } from 'node:fs/promises'

const repositoryRoot = new URL('..', import.meta.url)
const buildRoot = new URL('../.client-build/', import.meta.url)
const packageRoot = new URL('../packages/gateway-client/', import.meta.url)
const distributionRoot = new URL('dist/', packageRoot)

await rm(distributionRoot, { recursive: true, force: true })
await mkdir(distributionRoot, { recursive: true })
await cp(
  new URL('packages/gateway-client/src/index.js', buildRoot),
  new URL('index.js', distributionRoot)
)
await cp(
  new URL('src/index.public.d.ts', packageRoot),
  new URL('index.d.ts', distributionRoot)
)
await rm(buildRoot, { recursive: true, force: true })

process.stdout.write(
  `Built ${new URL('packages/gateway-client/dist/', repositoryRoot).pathname}\n`
)
