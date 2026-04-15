import { PrismaClient } from '@prisma/client'

declare global {
  var __kboPrisma__: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Supabase pooler: use DATABASE_URL with standard Prisma client
  if (process.env.DATABASE_URL) {
    return new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
    })
  }

  // Local Docker: use pg adapter with individual env vars
  const pg = require('pg')
  const { PrismaPg } = require('@prisma/adapter-pg')
  const pool = new pg.Pool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'kbo_ai',
  })

  return new PrismaClient({ adapter: new PrismaPg(pool) })
}

export const prisma = globalThis.__kboPrisma__ ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__kboPrisma__ = prisma
}
