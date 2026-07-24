import { readdir, readFile } from 'node:fs/promises'
import { extname, relative } from 'node:path'

const repositoryRoot = new URL('..', import.meta.url)
const sourceRoot = new URL('../src/', import.meta.url)
const forbiddenRuntimeFeatures = [
  ['testUtils(', 'Better Auth testUtils plugin'],
  ['better-auth/plugins', 'Better Auth runtime plugin bundle'],
  ['socialProviders', 'social provider configuration'],
  ['emailAndPassword', 'email/password authentication'],
  ['oauthProvider', 'MCP OAuth provider'],
  ['/test/', 'test-only runtime import'],
  ['/users/me', 'product Dashboard route']
]

const sourceFiles = await collectTypeScriptFiles(sourceRoot)
const violations = []

for (const sourceFile of sourceFiles) {
  const source = await readFile(sourceFile, 'utf8')
  for (const [pattern, label] of forbiddenRuntimeFeatures) {
    if (source.includes(pattern)) {
      violations.push(
        `${relative(repositoryRoot.pathname, sourceFile.pathname)} contains ${label}`
      )
    }
  }
}

const runtimeEntryPoint = await readFile(
  new URL('../src/index.ts', import.meta.url),
  'utf8'
)
for (const pattern of [
  'DATABASE_MIGRATION_URL',
  'runMigrations',
  '/db/migrate'
]) {
  if (runtimeEntryPoint.includes(pattern)) {
    violations.push(`src/index.ts contains migration-only reference ${pattern}`)
  }
}

if (violations.length > 0) {
  throw new Error(`Runtime boundary violations:\n${violations.join('\n')}`)
}

process.stdout.write(
  'Runtime authentication and migration boundaries are intact.\n'
)

async function collectTypeScriptFiles(directoryUrl) {
  const entries = await readdir(directoryUrl, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const entryPath = new URL(
      `${entry.name}${entry.isDirectory() ? '/' : ''}`,
      directoryUrl
    )
    if (entry.isDirectory()) {
      files.push(...(await collectTypeScriptFiles(entryPath)))
    } else if (entry.isFile() && extname(entry.name) === '.ts') {
      files.push(entryPath)
    }
  }

  return files
}
