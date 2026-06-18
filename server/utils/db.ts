import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from '~/db/schema'

let _db: ReturnType<typeof drizzle> | null = null

export function useDb() {
  if (!_db) {
    const config = useRuntimeConfig()
    const client = postgres(config.databaseUrl)
    _db = drizzle(client, { schema })
  }
  return _db
}

export async function findSimilarItems(
  db: ReturnType<typeof useDb>,
  userId: string,
  embeddingArray: number[],
  threshold = 0.82,
  limit = 20,
): Promise<Array<{ unit_price: string; similarity: number }>> {
  const vectorStr = `[${embeddingArray.join(',')}]`
  const result = await db.execute(
    sql`
      SELECT unit_price::text,
             (1 - (embedding <=> ${vectorStr}::vector))::float AS similarity
      FROM receipt_items
      WHERE user_id = ${userId}::uuid
        AND embedding IS NOT NULL
        AND (1 - (embedding <=> ${vectorStr}::vector)) > ${threshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `,
  )
  return result as unknown as Array<{ unit_price: string; similarity: number }>
}
