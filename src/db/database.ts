import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as authSchema from './auth-schema.js'

export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 10
  })
  const client = drizzle(pool, { schema: authSchema })

  return {
    client,
    pool,
    verifyConnection: async () => {
      await pool.query('SELECT 1')
    },
    close: async () => {
      await pool.end()
    }
  }
}

export type GatewayDatabase = ReturnType<typeof createDatabase>
export type GatewayDatabaseClient = GatewayDatabase['client']
