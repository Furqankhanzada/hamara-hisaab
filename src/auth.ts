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
  // Signing out is the only way out. The default 7 days silently logged a phone out mid-week, and an
  // expired session on a local-first client is worse than a lost tab: queued writes can't drain.
  // 400 days is the ceiling — expiresIn also sets the cookie's Max-Age, and both browsers and
  // better-call reject anything longer. Default updateAge (1 day) slides it on use, so a phone that
  // opens the app even once a year never gets logged out.
  session: { expiresIn: 60 * 60 * 24 * 400 },
  user: {
    additionalFields: {
      householdId: { type: 'string', required: false, input: false },
    },
  },
  // ponytail: rate limiting off — these keys belong to the household's own agents
  plugins: [apiKey({ rateLimit: { enabled: false } })],
})
