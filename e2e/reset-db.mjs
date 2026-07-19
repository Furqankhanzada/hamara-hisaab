// Recreate the e2e database before the app boots (runs as part of the webServer command).
import pg from 'pg'

const e2eUrl = process.env.DATABASE_URL
const dbName = e2eUrl.split('/').pop()
const admin = new pg.Client({ connectionString: e2eUrl.replace(/\/[^/]+$/, '/finance') })
await admin.connect()
await admin.query(`drop database if exists ${dbName} with (force)`)
await admin.query(`create database ${dbName}`)
await admin.end()
console.log(`[e2e] fresh database ${dbName}`)
