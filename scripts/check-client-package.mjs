import { spawnSync } from 'node:child_process'
import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

const repositoryRoot = resolve(new URL('..', import.meta.url).pathname)
const packageRoot = join(repositoryRoot, 'packages/gateway-client')
const artifactRoot = join(repositoryRoot, '.artifacts')
const fixtureRoot = join(repositoryRoot, 'test/fixtures/gateway-client')
const packageJson = JSON.parse(
  await readFile(join(packageRoot, 'package.json'), 'utf8')
)
const publish = process.argv.includes('--publish')

const tarball = await packClient()
await auditTarball(tarball)
run('pnpm', ['exec', 'publint', 'run', tarball, '--strict'])
run('pnpm', [
  'exec',
  'attw',
  tarball,
  '--profile',
  'esm-only',
  '--entrypoints',
  '.'
])
await checkConsumers(tarball)

if (publish) {
  await publishTarball(tarball)
}

async function packClient() {
  await mkdir(artifactRoot, { recursive: true })
  for (const entry of await readdir(artifactRoot)) {
    if (entry.endsWith('.tgz')) {
      await rm(join(artifactRoot, entry), { force: true })
    }
  }

  run('pnpm', [
    '--filter',
    packageJson.name,
    'pack',
    '--pack-destination',
    artifactRoot
  ])

  const tarballs = (await readdir(artifactRoot)).filter((entry) =>
    entry.endsWith('.tgz')
  )
  if (tarballs.length !== 1) {
    throw new Error(`Expected one client tarball, found ${tarballs.length}`)
  }
  return join(artifactRoot, tarballs[0])
}

async function auditTarball(tarball) {
  const expectedFiles = [
    'package/CHANGELOG.md',
    'package/LICENSE',
    'package/README.md',
    'package/dist/index.d.ts',
    'package/dist/index.js',
    'package/package.json'
  ]
  const files = output('tar', ['-tzf', tarball])
    .trim()
    .split('\n')
    .filter(Boolean)
    .sort()

  if (JSON.stringify(files) !== JSON.stringify(expectedFiles)) {
    throw new Error(`Unexpected tarball files:\n${files.join('\n')}`)
  }

  const packedManifest = JSON.parse(
    output('tar', ['-xOf', tarball, 'package/package.json'])
  )
  const expectedDependencies = { hono: '4.12.31' }
  if (
    packedManifest.name !== '@xdenovo/gateway-client' ||
    packedManifest.publishConfig?.registry !== 'https://npm.pkg.github.com' ||
    packedManifest.publishConfig?.access !== 'restricted' ||
    JSON.stringify(packedManifest.dependencies) !==
      JSON.stringify(expectedDependencies) ||
    Object.keys(packedManifest.exports ?? {}).join(',') !== '.'
  ) {
    throw new Error(
      'Packed client metadata does not match the release contract'
    )
  }

  const declaration = output('tar', [
    '-xOf',
    tarball,
    'package/dist/index.d.ts'
  ])
  const runtime = output('tar', ['-xOf', tarball, 'package/dist/index.js'])
  const forbidden = [
    'gateway/src',
    '../../src',
    'better-auth',
    'drizzle',
    'node-server',
    'pino',
    'sourceMappingURL'
  ]
  for (const pattern of forbidden) {
    if (declaration.includes(pattern) || runtime.includes(pattern)) {
      throw new Error(`Packed client contains private reference ${pattern}`)
    }
  }
  if (!runtime.includes("from 'hono/client'")) {
    throw new Error('Packed client runtime must import only hono/client')
  }

  process.stdout.write(`Audited ${basename(tarball)}\n`)
}

async function checkConsumers(tarball) {
  const consumersRoot = await mkdtemp(
    join(tmpdir(), 'gateway-client-consumers-')
  )

  try {
    const nodeFixture = await prepareConsumer('node', consumersRoot, tarball)
    run(process.execPath, ['consumer.mjs'], nodeFixture)

    const browserFixture = await prepareConsumer(
      'browser',
      consumersRoot,
      tarball
    )
    run(
      process.execPath,
      [join(repositoryRoot, 'node_modules/vite/bin/vite.js'), 'build'],
      browserFixture
    )
    const browserOutput = await readTree(join(browserFixture, 'dist'))
    for (const pattern of ['better-auth', 'node:fs', '@hono/node-server']) {
      if (browserOutput.includes(pattern)) {
        throw new Error(`Browser bundle contains private runtime ${pattern}`)
      }
    }

    const typescriptFixture = await prepareConsumer(
      'typescript',
      consumersRoot,
      tarball
    )
    run(
      process.execPath,
      [
        join(repositoryRoot, 'node_modules/typescript-5/lib/tsc.js'),
        '--project',
        'tsconfig.json'
      ],
      typescriptFixture
    )
  } finally {
    await rm(consumersRoot, { recursive: true, force: true })
  }

  process.stdout.write(
    'Clean Node, Browser, and TypeScript 5 consumers passed.\n'
  )
}

async function prepareConsumer(name, consumersRoot, tarball) {
  const destination = join(consumersRoot, name)
  await cp(join(fixtureRoot, name), destination, { recursive: true })
  await writeFile(
    join(destination, 'package.json'),
    `${JSON.stringify(
      {
        name: `gateway-client-${name}-fixture`,
        private: true,
        type: 'module',
        dependencies: {
          '@xdenovo/gateway-client': `file:${tarball}`
        }
      },
      null,
      2
    )}\n`
  )
  run(
    'pnpm',
    ['install', '--ignore-workspace', '--lockfile=false', '--ignore-scripts'],
    destination
  )
  return destination
}

async function publishTarball(tarball) {
  if (packageJson.version === '0.0.0') {
    throw new Error('Refusing to publish the unreleased placeholder version')
  }

  const lookup = spawnSync(
    'pnpm',
    [
      'view',
      `${packageJson.name}@${packageJson.version}`,
      'version',
      '--registry',
      'https://npm.pkg.github.com'
    ],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: process.env
    }
  )
  if (
    lookup.status === 0 &&
    lookup.stdout.trim().replaceAll('"', '') === packageJson.version
  ) {
    process.stdout.write(
      `${packageJson.name}@${packageJson.version} is already published.\n`
    )
    return
  }

  run('pnpm', [
    'publish',
    tarball,
    '--no-git-checks',
    '--access',
    'restricted',
    '--registry',
    'https://npm.pkg.github.com'
  ])
  process.stdout.write(`New tag: ${packageJson.name}@${packageJson.version}\n`)
}

async function readTree(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const contents = []
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      contents.push(await readTree(path))
    } else if (entry.isFile()) {
      contents.push(await readFile(path, 'utf8'))
    }
  }
  return contents.join('\n')
}

function output(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env
  })
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with status ${result.status}: ${result.stderr}`
    )
  }
  return result.stdout
}

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit'
  })
  if (result.status !== 0) {
    throw new Error(`${command} failed with status ${result.status}`)
  }
}
