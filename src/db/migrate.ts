import { fileURLToPath, pathToFileURL } from 'node:url'

import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

import { loadMigrationConfig } from '../config.js'
import { describeError } from '../logging.js'

const migrationsFolder = fileURLToPath(
  new URL('../../drizzle', import.meta.url)
)

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({
    connectionString,
    max: 1
  })

  try {
    await migrate(drizzle(pool), { migrationsFolder })
  } finally {
    await pool.end()
  }
}

async function main(): Promise<void> {
  const config = loadMigrationConfig()
  await runMigrations(config.database.migrationUrl)
  process.stdout.write('Gateway migrations applied successfully.\n')
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  main().catch((error: unknown) => {
    const { errorType } = describeError(error)
    process.stderr.write(`Gateway migration failed (${errorType}).\n`)
    process.exitCode = 1
  })
}
