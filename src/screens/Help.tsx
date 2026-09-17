// The rules in plain words, plus the type chart. Numbers come from the live game data.
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { COMBO_KEYS, COMBO_NAMES, comboBonus, POKE_TYPES, typeMultiplier, type PokeType } from '@/engine'
import { DieFaces } from '@/components/Die'
import { PixelIcon } from '@/components/icons'
import { PixelButton } from '@/components/PixelButton'
import { TypeBadge } from '@/components/TypeBadge'
import { comboExampleText, DIE_ABBR, statusEffects } from '@/lib/format'
import { useGame } from '@/store/game'
import { badgeColors, cx, typeColor } from '@/theme/util'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex flex-col gap-2">
      <h2 id={`${id}-h`} className="border-b-[3px] border-ink text-3xl leading-tight">
        {title}
      </h2>
      <div className="copy flex flex-col gap-2">{children}</div>
    </section>
  )
}

function StatusTable() {
  const r = useGame((s) => s.data.config.status)
  const rows = statusEffects(r)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-lg">
        <thead>
          <tr className="bg-ink text-panel">
            <th scope="col" className="px-2 py-1 text-left font-normal">Status</th>
            <th scope="col" className="px-2 py-1 text-left font-normal">Triggers on</th>
            <th scope="col" className="px-2 py-1 text-left font-normal">Effect</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => (
            <tr key={x.name} className="border-b-2 border-shadow/40 align-top">
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-normal">
                <span className="flex items-center gap-1">
                  <PixelIcon name={x.icon} size={16} /> {x.name}
                </span>
                <TypeBadge type={x.die} size="sm" />
              </th>
              <td className="px-2 py-1">{x.when} in one roll</td>
              <td className="px-2 py-1">{x.what}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-lg text-muted">
        Below its trigger count a status face still counts as a number (shown in its corner) for damage and combos. All
        statuses clear when a battle ends.
      </p>
    </div>
  )
}

const CELL: Record<string, { label: string; cls: string; words: string }> = {
  '2': { label: '2', cls: 'bg-hp-green text-ink', words: 'super effective (×2)' },
  '0.5': { label: '½', cls: 'bg-[#e8905a] text-ink', words: 'not very effective (×½)' },
  '0': { label: '0', cls: 'bg-ink text-panel', words: 'no effect (×0)' },
  '1': { label: '', cls: '', words: 'normal (×1)' },
}

function TypeHeader({ t }: { t: PokeType }) {
  const { bg, fg } = badgeColors(typeColor(t))
  return (
    <span className="flex h-6 w-8 items-center justify-center border border-ink font-mono text-xs font-bold" style={{ background: bg, color: fg }} title={t}>
      <span aria-hidden="true">{DIE_ABBR[t]}</span>
      <span className="sr-only">{t}</span>
    </span>
  )
}

export function TypeChart() {
  const chart = useGame((s) => s.data.typeChart)
  return (
    <div className="pixel-scroll overflow-x-auto" role="region" aria-label="Type effectiveness chart, scrollable" tabIndex={0}>
      <table className="border-collapse">
        <caption className="pb-1 text-left text-lg text-muted">Attacking type (rows) against defending type (columns).</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 bg-panel p-0.5 text-left text-sm font-normal">
              ATK ↓ DEF →
            </th>
            {POKE_TYPES.map((d) => (
              <th key={d} scope="col" className="p-0.5">
                <TypeHeader t={d} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {POKE_TYPES.map((a) => (
            <tr key={a}>
              <th scope="row" className="sticky left-0 bg-panel p-0.5">
                <TypeHeader t={a} />
              </th>
              {POKE_TYPES.map((d) => {
                const m = typeMultiplier(chart, a, [d])
                const cell = CELL[String(m)] ?? CELL['1']!
                return (
                  <td key={d} className="p-0.5">
                    <span
                      className={cx('flex h-6 w-8 items-center justify-center border border-shadow/40 font-mono text-sm', cell.cls)}
                      title={`${a} → ${d}: ${cell.words}`}
                    >
                      <span aria-hidden="true">{cell.label}</span>
                      <span className="sr-only">{`${a} on ${d}: ${cell.words}`}</span>
                    </span>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 flex flex-wrap gap-3 text-lg">
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-ink bg-hp-green" /> ×2
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-ink bg-[#e8905a]" /> ×½
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-ink bg-ink" /> ×0
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-4 w-5 border border-shadow/40" /> ×1
        </span>
      </div>
    </div>
  )
}

/** Mobile-friendly lookup: pick a type, read its matchups as lists. */
function TypeLookup() {
  const chart = useGame((s) => s.data.typeChart)
  const [t, setT] = useState<PokeType>('fire')
  const by = (pred: (m: number) => boolean, atk: boolean) =>
    POKE_TYPES.filter((o) => pred(atk ? typeMultiplier(chart, t, [o]) : typeMultiplier(chart, o, [t])))
  const rows: [string, PokeType[]][] = [
    [`${t} dice hit hard (×2) on`, by((m) => m === 2, true)],
    [`${t} dice are weak (×½) on`, by((m) => m === 0.5, true)],
    [`${t} dice do nothing to`, by((m) => m === 0, true)],
    [`${t} Pokémon take ×2 from`, by((m) => m === 2, false)],
    [`${t} Pokémon resist`, by((m) => m < 1, false)],
  ]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Pick a type">
        {POKE_TYPES.map((x) => (
          <button key={x} type="button" onClick={() => setT(x)} aria-pressed={x === t} className={cx('rounded-[2px]', x === t && 'outline outline-[3px] outline-offset-1 outline-gold')}>
            <TypeBadge type={x} size="sm" />
          </button>
        ))}
      </div>
      <dl className="grid gap-1 text-lg sm:grid-cols-[auto_1fr] sm:gap-x-3">
        {rows.map(([label, list]) => (
          <div key={label} className="contents">
            <dt className="text-muted first-letter:uppercase">{label}</dt>
            <dd className="flex flex-wrap gap-1">{list.length ? list.map((x) => <TypeBadge key={x} type={x} size="sm" />) : '—'}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function HelpContent() {
  const data = useGame((s) => s.data)
  const cfg = data.config
  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Help sections" className="flex flex-wrap gap-2 text-lg">
        {[
          ['goal', 'The goal'],
          ['explore', 'Exploring'],
          ['battle', 'Battles'],
          ['damage', 'Damage'],
          ['combos', 'Combos'],
          ['status', 'Status faces'],
          ['types', 'Type chart'],
          ['grow', 'Getting stronger'],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="pixel-btn flex min-h-[44px] items-center bg-panel px-2 md:min-h-[32px]">
            {label}
          </a>
        ))}
      </nav>

      <Section id="goal" title="The goal">
        <p>
          Travel across Kanto one area at a time. Catch Pokémon, beat the 8 Gym Leaders, the Elite Four and the Champion,
          then find the secret areas and fill the Pokédex: all 151.
        </p>
      </Section>

      <Section id="explore" title="Exploring">
        <ul className="ml-5 list-disc">
          <li>Each area has an <b>exploration</b> bar. Every Pokémon you knock out fills it by the foe's level.</li>
          <li>
            When it's full, <b>CHALLENGE</b> the area's Gym Leader (or legendary) whenever you're ready — or keep exploring
            first: a complete exploration stays complete. Win to open the next area.
          </li>
          <li>
            You see every encounter before it starts: <b>FIGHT</b> it, <b>FLEE</b> a wild Pokémon, or <b>AVOID</b> an
            ordinary trainer. Once a battle starts, only wild Pokémon can be run from.
          </li>
          <li>
            Knock a wild Pokémon out, then throw the <b>catch die</b>: reach its catch value (1–9) and it's yours; miss
            and it flees. A Poké Ball adds +1, a Great Ball +2, an Ultra Ball +3, and a Master Ball never misses.
          </li>
          <li>
            You can catch a species you don't have yet, or a stronger copy of one you do (it replaces yours). Your team
            holds 3; the rest wait in the Box. A legendary that flees comes back later.
          </li>
          <li>
            Now and then you <b>find something</b> on the ground: an item or some Pokédollars. Each area has its own
            finds, and a few can only be found once.
          </li>
          <li>A <b>Pokémon Center</b> heals everyone and lets you change your team.</li>
          {cfg.encounterMode === 'deck' && (
            <li>
              Encounters are dealt from each area's <b>shuffled deck</b> (about ten cards). Going through it is a{' '}
              <b>round</b>; every new round opens with a Pokémon Center whenever you have someone to heal or swap. The
              round bar under the exploration bar shows how far into the round you are.
            </li>
          )}
          <li>
            In <b>easy</b> areas (marked on the Map), a Center comes next whenever one of your Pokémon is K.O.
          </li>
          <li>
            <b>Secret areas</b> appear on the Map when you meet their conditions (catch enough Pokémon, or raise one high
            enough).
          </li>
          <li>
            The type badges at the top right of each area are its <b>encounter types</b>: build your team for them.
          </li>
        </ul>
      </Section>

      <Section id="battle" title="Battles">
        <ol className="ml-5 list-decimal">
          <li>The faster Pokémon acts first.</li>
          <li>
            Your dice are thrown for you as your turn starts. Tap the dice you don't like and press <b>REROLL</b>. Each
            press uses one reroll, however many dice you picked, and your rerolls last the whole battle.
          </li>
          <li>Press <b>ATTACK</b> when you're happy.</li>
        </ol>
        <p>
          You can use <b>one item per turn</b>, before or after rolling, and it doesn't end your turn. A frozen or
          paralyzed Pokémon loses its turn unless you cure it first (Ice Heal, Paralyze Heal). Switching costs your turn;
          switching after a faint is free. You can only <b>RUN</b> from wild Pokémon.
          Keyboard: <kbd>1</kbd>–<kbd>6</kbd> pick dice, <kbd>R</kbd> reroll, <kbd>Space</kbd> attack.
        </p>
      </Section>

      <Section id="damage" title="Damage">
        <p>
          Add up your dice <b>numbers</b> (+ your upgrades) and your <b>best combo</b>. The whole attack then takes the
          most effective <b>type</b> among your dice against the foe: a Kabuto with water and rock dice hits a Pidgeotto as
          Rock, ×2. If none of your types can touch the foe, the attack does nothing. Levels give HP, not damage: upgrades
          are what make you hit harder.
        </p>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="w-16 text-lg">Base</span>
            <DieFaces type="base" faces={data.diceTypes.base?.faces ?? []} size={28} />
          </div>
          <p className="copy text-muted">
            White <b>Base</b> dice have no type of their own (they follow the attack's type) and can't be upgraded. Coloured dice carry a type and have their
            own faces. The Pokédex shows each Pokémon's dice.
          </p>
        </div>
      </Section>

      <Section id="combos" title="Combos">
        <p>Only the single most damaging combo in a roll pays.</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-lg">
            <thead>
              <tr className="bg-ink text-panel">
                <th scope="col" className="px-2 py-1 text-left font-normal">Combo</th>
                <th scope="col" className="px-2 py-1 text-left font-normal">Example</th>
                <th scope="col" className="px-2 py-1 text-left font-normal">Bonus at Lv.1</th>
              </tr>
            </thead>
            <tbody>
              {COMBO_KEYS.map((k) => (
                <tr key={k} className="border-b-2 border-shadow/40">
                  <th scope="row" className="px-2 py-1 text-left font-normal">{COMBO_NAMES[k]}</th>
                  <td className="px-2 py-1 font-mono text-base">{comboExampleText(k)}</td>
                  <td className="px-2 py-1">+{comboBonus(k, 1, data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="status" title="Status faces">
        <StatusTable />
      </Section>

      <Section id="types" title="Type chart">
        <TypeLookup />
        <details>
          <summary className="flex min-h-[44px] cursor-pointer items-center text-xl">Show the full type chart</summary>
          <TypeChart />
        </details>
      </Section>

      <Section id="grow" title="Getting stronger">
        <ul className="ml-5 list-disc">
          <li>The Pokémon that lands the K.O. gets XP. Levels raise HP; some levels add a die or a reroll, and many Pokémon evolve.</li>
          <li>
            <b>Multi EXP</b> (Settings): team members who didn't fight still get {Math.round(cfg.multiExpShare * 100)} % of the XP.
          </li>
          <li>
            Trainers pay <b>Pokédollars (₽)</b>. Gym Leaders, the Elite Four and the Champion pay ×{cfg.gymGoldMultiplier}.
          </li>
          <li>
            Spend them on <b>Upgrades</b> (every Pokémon benefits) and at the <b>Poké Mart</b>, whose stock grows with your
            badges.
          </li>
          <li>HP carries over between fights. Hurt Pokémon recover {cfg.regenPercentPerHour} % of their HP per hour, or fully at a Center.</li>
          <li>
            If your whole team faints, the <b>round is lost</b>: exploration goes back to where it stood when the round
            began (the red mark on it; a complete exploration stays complete) and a new, freshly shuffled round starts. Your team is
            healed, and you keep your Pokédollars, items and your Pokémon's levels.
          </li>
        </ul>
      </Section>
    </div>
  )
}

export function HelpPage() {
  const navigate = useNavigate()
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-3 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-5xl">How to play</h1>
        <PixelButton onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>Back</PixelButton>
      </div>
      <div className="pixel-panel p-4">
        <HelpContent />
      </div>
      <Link to="/" className="self-center underline">
        Title screen
      </Link>
    </main>
  )
}
