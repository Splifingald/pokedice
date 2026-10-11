// The Discord scripts' settings: .env.discord (the bot token, the server id, the webhook URLs the setup writes) and
// .env.local (the Supabase pair the raid poster reads content with). The environment wins, as on GitHub Actions.
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const DISCORD_ENV = path.join(ROOT, '.env.discord')

const LINE = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i

/** `KEY=value` lines, `#` comments, optional quotes. */
async function readEnvFile(file: string): Promise<Record<string, string>> {
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of (await readFile(file, 'utf8')).split(/\r?\n/)) {
    const m = LINE.exec(line)
    if (!m || line.trimStart().startsWith('#')) continue
    out[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '')
  }
  return out
}

export async function loadEnv(): Promise<Record<string, string | undefined>> {
  return {
    ...(await readEnvFile(path.join(ROOT, '.env.local'))),
    ...(await readEnvFile(DISCORD_ENV)),
    ...process.env,
  }
}

/** Sets these keys in .env.discord, in place when the line exists, appended otherwise. Returns the keys it changed. */
export async function writeDiscordEnv(values: Record<string, string>): Promise<string[]> {
  const text = existsSync(DISCORD_ENV) ? await readFile(DISCORD_ENV, 'utf8') : ''
  const lines = text ? text.split(/\r?\n/) : []
  const changed: string[] = []
  for (const [key, value] of Object.entries(values)) {
    const i = lines.findIndex((l) => LINE.exec(l)?.[1] === key)
    const line = `${key}=${value}`
    if (i >= 0) {
      if (lines[i] !== line) {
        lines[i] = line
        changed.push(key)
      }
    } else {
      if (lines.length && lines[lines.length - 1] === '') lines.pop()
      lines.push(line, '')
      changed.push(key)
    }
  }
  if (changed.length) await writeFile(DISCORD_ENV, lines.join('\n'))
  return changed
}
