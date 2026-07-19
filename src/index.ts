import './env'
import { serve } from '@hono/node-server'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db } from './db/client'
import { buildApp } from './app'
import { startJobs } from './jobs/cron'

await migrate(db, { migrationsFolder: './drizzle' })

const port = Number(process.env.PORT ?? 3000)
serve({ fetch: buildApp().fetch, port }, (info) => console.log(`hamara-hisaab listening on :${info.port}`))
startJobs()
