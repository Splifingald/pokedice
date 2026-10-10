// /setup — a copy-pasteable deployment guide for someone who has never used Supabase, with live checks.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import initSql from '../../supabase/migrations/0001_init.sql?raw'
import { PixelIcon } from '@/components/icons'
import { Panel } from '@/components/Panel'
import { PixelButton } from '@/components/PixelButton'
import { TABLES } from '@/config/mapping'
import { parseAuthSettings } from '@/lib/authProviders'
import { ADMIN_EMAIL, getSupabase, isAdminEmail, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase'
import { pushToast, useGame } from '@/store/game'

/** seed.sql cut into parts the SQL editor accepts (`pnpm seed-sql` writes them), in run order. */
const SEED_PARTS = Object.entries(
  import.meta.glob<string>('../../supabase/seed-parts/*.sql', { query: '?raw', import: 'default', eager: true }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, sql]) => sql)

function copy(text: string, what: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => pushToast(`${what} copied`, 'good'))
    .catch(() => pushToast('Clipboard unavailable — select the text and copy it manually', 'bad'))
}

function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="relative my-1">
      <pre
        tabIndex={0}
        aria-label={label ?? 'Code'}
        className="pixel-scroll max-h-40 overflow-auto border-2 border-edge bg-ink p-2 pr-20 font-mono text-xs text-panel"
      >
        {children}
      </pre>
      <button type="button" className="pixel-btn absolute right-1 top-1 bg-gold px-2 text-sm" onClick={() => copy(children, label ?? 'Text')}>
        Copy
      </button>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <Panel title={<span className="text-2xl">{`${n}. ${title}`}</span>}>
      <div className="copy flex flex-col gap-2">{children}</div>
    </Panel>
  )
}

interface Check {
  label: string
  ok: boolean | null
  detail?: string
  /** An optional part: off is a dash, not a failure. */
  optional?: boolean
}

function jwtRole(key: string): string | null {
  const part = key.split('.')[1]
  if (!part) return null
  try {
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.role === 'string' ? json.role : null
  } catch {
    return null
  }
}

const EXPECTED: Partial<Record<string, number>> = { pokemon: 1025, dice_types: 19, die_upgrades: 180, combo_upgrades: 80, regions: 9 }

function useChecks() {
  const auth = useGame((s) => s.auth)
  const [checks, setChecks] = useState<Check[]>([])
  const [running, setRunning] = useState(false)

  const run = useCallback(async () => {
    setRunning(true)
    const out: Check[] = []
    const push = (c: Check) => {
      out.push(c)
      setChecks([...out])
    }
    push({ label: 'VITE_SUPABASE_URL is set', ok: !!SUPABASE_URL, detail: SUPABASE_URL || 'missing' })
    push({ label: 'VITE_SUPABASE_ANON_KEY is set', ok: !!SUPABASE_ANON_KEY, detail: SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.slice(0, 14)}…` : 'missing' })
    const role = SUPABASE_ANON_KEY ? jwtRole(SUPABASE_ANON_KEY) : null
    if (SUPABASE_ANON_KEY)
      push({
        label: 'Key is the public anon key (not service_role)',
        ok: role === 'service_role' ? false : true,
        detail: role === 'service_role' ? 'DANGER: this is the service_role key — replace it now!' : (role ?? 'publishable key'),
      })
    push({ label: 'VITE_ADMIN_EMAIL is set', ok: !!ADMIN_EMAIL, detail: ADMIN_EMAIL || 'missing' })
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      setRunning(false)
      return
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } })
      push({ label: 'Supabase is reachable', ok: res.ok, detail: `HTTP ${res.status}` })
    } catch (err) {
      push({ label: 'Supabase is reachable', ok: false, detail: String(err) })
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_ANON_KEY } })
      const providers = parseAuthSettings(res.ok ? await res.json() : null)
      push({ label: 'Google sign-in is on', ok: res.ok && providers.google, detail: res.ok ? undefined : `HTTP ${res.status}` })
      push({
        label: 'Discord sign-in is on (optional)',
        ok: res.ok && providers.discord,
        optional: true,
        detail: providers.discord ? undefined : 'not set — step 7 above, or docs/17-DISCORD-SIGN-IN.md',
      })
    } catch (err) {
      push({ label: 'Sign-in providers', ok: false, detail: String(err) })
    }
    const client = await getSupabase()
    if (client) {
      for (const t of [...TABLES, 'saves'] as const) {
        const { count, error } = await client.from(t).select('*', { count: 'exact', head: true })
        const exp = EXPECTED[t]
        push({
          label: `Table ${t}`,
          ok: !error && (t === 'saves' || (count ?? 0) > 0) && (exp == null || count === exp),
          detail: error ? error.message : `${count ?? 0} rows${exp != null ? ` (expected ${exp})` : ''}`,
        })
      }
      const { data: isAdm, error } = await client.rpc('is_admin')
      push({ label: 'Server says you are admin (is_admin())', ok: error ? false : isAdm === true, detail: error ? error.message : String(isAdm) })
    }
    setRunning(false)
  }, [])

  useEffect(() => {
    void run()
  }, [run, auth.status])

  const session: Check[] = [
    { label: 'Signed in', ok: auth.status === 'signed_in', detail: auth.email ?? auth.status },
    { label: 'Session email matches VITE_ADMIN_EMAIL', ok: isAdminEmail(auth.email), detail: auth.email ?? '—' },
  ]
  return { checks: [...checks, ...session], run, running }
}

export default function SetupPage() {
  const { checks, run, running } = useChecks()
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://your-site.netlify.app'
  const supa = SUPABASE_URL || 'https://<project-ref>.supabase.co'

  return (
    <main className="scanlines min-h-screen px-3 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-5xl">Deploy Pokédice</h1>
          <Link to="/" className="underline">
            Back to the game
          </Link>
        </div>
        <p className="copy">
          The game already works offline with no backend at all. These steps add the optional parts: a public URL, cloud
          save backup with Google (and, if you like, Discord) sign-in, and the admin panel. Budget about 30 minutes. Everything used here has a free tier.
        </p>

        <Step n={1} title="Netlify — host the site">
          <p>Push this repository to GitHub. In Netlify: Add new site → Import an existing project → GitHub → pick the repo.</p>
          <p>
            Build command <code className="bg-ink px-1 text-panel">pnpm build</code>, publish directory{' '}
            <code className="bg-ink px-1 text-panel">dist</code> (already in <code>netlify.toml</code>, including the SPA redirect).
          </p>
          <p>Deploy, then note your site URL (e.g. https://pokedice-yourname.netlify.app). You can rename it under Site configuration → Change site name.</p>
        </Step>

        <Step n={2} title="Supabase — create the project">
          <p>At supabase.com: New project → pick a name, a strong database password (store it somewhere) and the closest region. Wait ~2 minutes.</p>
          <p>
            Open Project Settings → API (or “API Keys”). Copy the <b>Project URL</b> and the <b>anon / public</b> key (newer dashboards call it
            the “publishable” key).
          </p>
          <p className="border-2 border-danger bg-danger/10 p-2">
            <PixelIcon name="lock" size={14} /> Never put the <b>service_role</b> / secret key in the front end or in Netlify — it bypasses
            every security rule. The checklist below warns you if you do.
          </p>
        </Step>

        <Step n={3} title="SQL — create the tables and load the content">
          <p>
            In Supabase: SQL Editor → New query. Paste the schema, press Run. Then the seed data, which is too large for one paste: one
            new query per part, Run each, part 1 first. Updating a live database only needs the parts.
          </p>
          <Code label="0001_init.sql">{initSql}</Code>
          {SEED_PARTS.map((sql, i) => (
            <div key={i}>
              <p className="copy text-muted">
                Seed data, part {i + 1} of {SEED_PARTS.length} ({Math.round(sql.length / 1024)} KB) — use the Copy button rather than
                selecting it.
              </p>
              <Code label={`seed part ${i + 1}`}>{sql}</Code>
            </div>
          ))}
        </Step>

        <Step n={4} title="Google Cloud Console — OAuth client">
          <ol className="ml-6 list-decimal">
            <li>console.cloud.google.com → create (or pick) a project.</li>
            <li>APIs &amp; Services → OAuth consent screen → External → app name “Pokédice”, your email as support and developer contact → Save. Publish the app (or add yourself as a test user).</li>
            <li>APIs &amp; Services → Credentials → Create credentials → OAuth client ID → Application type: <b>Web application</b>.</li>
            <li>
              Authorised JavaScript origins: your Netlify URL and <code>http://localhost:5173</code>.
            </li>
            <li>Authorised redirect URIs: exactly this (Supabase's callback, not your site):</li>
          </ol>
          <Code label="Redirect URI">{`${supa}/auth/v1/callback`}</Code>
          <p>Create → copy the Client ID and Client secret.</p>
        </Step>

        <Step n={5} title="Supabase — enable Google">
          <p>Authentication → Sign In / Providers → Google → enable, paste the Client ID and Client secret → Save.</p>
        </Step>

        <Step n={6} title="Supabase — URL configuration">
          <p>Authentication → URL Configuration:</p>
          <p>Site URL = your Netlify URL. Additional Redirect URLs — add both:</p>
          <Code label="Redirect URLs">{`${origin.includes('localhost') ? 'https://your-site.netlify.app' : origin}/**\nhttp://localhost:5173/**`}</Code>
        </Step>

        <Step n={7} title="Discord — a second way to sign in (optional)">
          <p>
            Players without Google, or who prefer Discord, can sign in with it: same save, leaderboard, Versus and friends. Skip
            this step if you don't want it; the game only offers Discord once it is on. The full guide, with a test you can
            run before the game has the button, is <code>docs/17-DISCORD-SIGN-IN.md</code>.
          </p>
          <ol className="ml-6 list-decimal">
            <li>discord.com/developers/applications → New Application → “Pokédice” → Create. Give it the game's logo (General Information).</li>
            <li>OAuth2 → copy the Client ID; Reset Secret → copy the Client Secret (shown once).</li>
            <li>OAuth2 → Redirects → Add Redirect → exactly this (Supabase's callback, the same as Google's) → Save Changes:</li>
          </ol>
          <Code label="Discord redirect">{`${supa}/auth/v1/callback`}</Code>
          <ol className="ml-6 list-decimal" start={4}>
            <li>Supabase → Authentication → Sign In / Providers → Discord → enable, paste the Client ID and Client Secret → Save.</li>
            <li>
              Same page, User Signups → turn on <b>Allow manual linking</b>, so a player can add Discord to the save they already
              back up with Google (Settings → Connected accounts), and the reverse.
            </li>
          </ol>
          <p>No environment variable and no redeploy: the secret stays in Supabase.</p>
        </Step>

        <Step n={8} title="Netlify — environment variables">
          <p>Site configuration → Environment variables → add these three, then Deploys → Trigger deploy → Clear cache and deploy.</p>
          <Code label="Env vars">{`VITE_SUPABASE_URL=${SUPABASE_URL || 'https://<project-ref>.supabase.co'}\nVITE_SUPABASE_ANON_KEY=<the anon / publishable key>\nVITE_ADMIN_EMAIL=gregoire.ftn@gmail.com`}</Code>
          <p className="copy text-muted">
            For local dev, put the same lines in a <code>.env.local</code> file at the project root and restart <code>pnpm dev</code>.
          </p>
        </Step>

        <Step n={9} title="Verify">
          <p>These checks run live against this deployment. Sign in (title screen → “Back up your save”) to complete the last ones.</p>
          <ul className="flex flex-col gap-1">
            {checks.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-lg">
                <span className="mt-0.5 w-6 shrink-0 text-center">
                  {c.ok === null ? (
                    '…'
                  ) : c.ok ? (
                    <PixelIcon name="check" size={16} title="ok" />
                  ) : c.optional ? (
                    <span className="text-muted">–</span>
                  ) : (
                    <span className="text-danger">✗</span>
                  )}
                </span>
                <span className="flex-1">
                  {c.label}
                  {c.detail && <span className="block break-all text-base text-muted">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          <PixelButton size="sm" className="self-start" disabled={running} onClick={() => void run()}>
            {running ? 'Checking…' : 'Run checks again'}
          </PixelButton>
          <p>
            When everything is green, the <Link to="/admin" className="underline">Admin</Link> link appears in the game's menu.
          </p>
        </Step>

        <Step n={10} title="Troubleshooting">
          <dl className="flex flex-col gap-2">
            <dt className="text-2xl">Error 400: redirect_uri_mismatch</dt>
            <dd>The redirect URI in Google must be the Supabase callback ({supa}/auth/v1/callback), character for character — not your Netlify URL.</dd>
            <dt className="text-2xl">“relation … does not exist”</dt>
            <dd>The schema wasn't run, or ran in another project. Run 0001_init.sql, then seed.sql, in the SQL editor.</dd>
            <dt className="text-2xl">Admin saves fail with “row-level security”</dt>
            <dd>
              You're not signed in as the admin email, or the email in <code>is_admin()</code> (inside 0001_init.sql) differs from yours. RLS is
              the real gate — the front-end variable only hides the link.
            </dd>
            <dt className="text-2xl">Blank page after the Google redirect / 404 on reload</dt>
            <dd>The SPA redirect is missing. Keep netlify.toml's “/* → /index.html 200” rule, and make sure the site URL is in Supabase's Redirect URLs.</dd>
            <dt className="text-2xl">Env vars changed but nothing happens</dt>
            <dd>Vite bakes them in at build time: trigger a fresh deploy (Clear cache and deploy).</dd>
            <dt className="text-2xl">Discord: “Invalid OAuth2 redirect_uri”</dt>
            <dd>The redirect in the Discord application must be the Supabase callback ({supa}/auth/v1/callback), character for character.</dd>
            <dt className="text-2xl">Discord: “Error getting user email from external provider”</dt>
            <dd>That Discord account has no verified e-mail. Discord → User Settings → My Account → verify it, then sign in again.</dd>
            <dt className="text-2xl">Discord: “invalid_client”, or it stopped working</dt>
            <dd>The Client Secret was reset in Discord: paste the new one in Supabase → Authentication → Sign In / Providers → Discord.</dd>
            <dt className="text-2xl">“Manual linking is disabled”</dt>
            <dd>Turn on Allow manual linking (Authentication → Sign In / Providers → User Signups).</dd>
          </dl>
        </Step>
      </div>
    </main>
  )
}
