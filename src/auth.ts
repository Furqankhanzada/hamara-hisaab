import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { apiKey } from '@better-auth/api-key'
import { db } from './db/client'
import * as schema from './db/schema'

const baseURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
// TRUSTED_ORIGINS: comma-separated extras (e.g. keep localhost working once APP_URL is public)
const extraOrigins = (process.env.TRUSTED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean)

export const auth = betterAuth({
  baseURL,
  // localhost and 127.0.0.1 are the same machine — trust both spellings
  trustedOrigins: [baseURL, baseURL.replace('//localhost', '//127.0.0.1'), ...extraOrigins],
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  emailAndPassword: {
    enabled: true,
    // once the household is registered on a public URL, set DISABLE_SIGNUPS=true
    disableSignUp: process.env.DISABLE_SIGNUPS === 'true',
  },
  user: {
    additionalFields: {
      householdId: { type: 'string', required: false, input: false },
    },
  },
  // ponytail: rate limiting off — these keys belong to the household's own agents
  plugins: [apiKey({ rateLimit: { enabled: false } })],
})
