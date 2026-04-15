import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

declare global {
  var __kboPrisma__: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  if (process.env.DATABASE_URL) {
    return new PrismaClient()
  }

  const pool = new pg.Pool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'kbo_ai',
  })

  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalThis.__kboPrisma__ ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__kboPrisma__ = prisma
}
