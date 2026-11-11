// Admin → Live events → a Type Rush (docs/71 §3.7): its type (or a weekly rotation), its boost, its quests with their
// steps and points, and its reward gauge. No switch of its own (the user's call, 2026-11-11): scheduling one is
// turning it on. A new one starts with the default list; "Reset" brings it back.
import {
  COMBO_KEYS,
  POKE_TYPES,
  RUSH_MAX_GAUGE,
  RUSH_MAX_QUESTS,
  RUSH_MAX_STEPS,
  RUSH_QUEST_KINDS,
  defaultRushGauge,
  defaultRushQuests,
  rushTotalPoints,
  rushType,
  type ComboKey,
  type GameData,
  type LiveEvent,
  type PokeType,
  type RushQuest,
  type RushQuestKind,
} from '@/engine'
import { PixelButton } from '@/components/PixelButton'
import { TypeBadge } from '@/components/TypeBadge'
import { Field, NumInput, inputCls } from '../widgets'
import { RewardFields, RewardKindSelect } from './CalendarBox'

type Rush = LiveEvent['rush']

const KIND_NAME: Record<RushQuestKind, string> = {
  catch: 'Catch Pokémon of the type',
  ko: 'K.O. foes with Pokémon of the type',
  evolve: 'Evolve Pokémon of the type',
  damage: 'Deal damage with Pokémon of the type',
  hatch: 'Hatch Pokémon of the type',
  combo: 'Land combos with Pokémon of the type',
  raid: 'Win raids with one on the team',
}
const COMBO_NAME: Record<ComboKey, string> = Object.fromEntries(
  COMBO_KEYS.map((k) => [k, k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())]),
) as Record<ComboKey, string>
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const clamp = (v: number | null, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v ?? lo)))
const newQuestId = (list: readonly RushQuest[], kind: RushQuestKind) => {
  let n = 1
  while (list.some((q) => q.id === (n === 1 ? kind : `${kind}${n}`))) n++
  return n === 1 ? kind : `${kind}${n}`
}

/** A quest: its kind (and combo), its steps in order (target, points), up, down, delete. */
function QuestRow({
  q,
  i,
  count,
  set,
  remove,
  move,
}: {
  q: RushQuest
  i: number
  count: number
  set: (q: RushQuest) => void
  remove: () => void
  move: (by: -1 | 1) => void
}) {
  const step = (j: number, patch: Partial<RushQuest['steps'][number]>) =>
    set({ ...q, steps: q.steps.map((s, k) => (k === j ? { ...s, ...patch } : s)) })
  const last = q.steps[q.steps.length - 1]
  return (
    <li className="grid gap-2 border-t-2 border-line pt-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="pb-1 text-lg">{i + 1}.</span>
        <label className="flex min-w-[220px] flex-1 flex-col text-base">
          Quest
          <select
            className={inputCls}
            value={q.kind}
            aria-label={`Quest ${i + 1}: what it counts`}
            onChange={(e) => {
              const kind = e.target.value as RushQuestKind
              set({ ...q, kind, ...(kind === 'combo' ? { combo: q.combo ?? 'any' } : { combo: undefined }) })
            }}
          >
            {RUSH_QUEST_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_NAME[k]}
              </option>
            ))}
          </select>
        </label>
        {q.kind === 'combo' && (
          <label className="flex w-40 flex-col text-base">
            Combo
            <select
              className={inputCls}
              value={q.combo ?? 'any'}
              aria-label={`Quest ${i + 1}: which combo`}
              onChange={(e) => set({ ...q, combo: e.target.value as ComboKey | 'any' })}
            >
              <option value="any">Any combo</option>
              {COMBO_KEYS.map((k) => (
                <option key={k} value={k}>
                  {COMBO_NAME[k]}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="ml-auto flex gap-1">
          <PixelButton
            size="sm"
            onClick={() => move(-1)}
            disabled={i === 0}
            aria-label={`Quest ${i + 1}: up`}
          >
            ↑
          </PixelButton>
          <PixelButton
            size="sm"
            onClick={() => move(1)}
            disabled={i === count - 1}
            aria-label={`Quest ${i + 1}: down`}
          >
            ↓
          </PixelButton>
          <PixelButton size="sm" onClick={remove} aria-label={`Quest ${i + 1}: delete`}>
            Delete
          </PixelButton>
        </span>
      </div>
      <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
        {q.steps.map((s, j) => (
          <li key={j} className="flex items-end gap-1 bg-paper px-1.5 py-1 shadow-ring-line">
            <label className="flex w-24 flex-col text-sm">
              Step {j + 1}: target
              <NumInput
                value={s.target}
                min={1}
                max={9_999_999}
                onChange={(v) => step(j, { target: clamp(v, 1, 9_999_999) })}
              />
            </label>
            <label className="flex w-20 flex-col text-sm">
              Points
              <NumInput
                value={s.points}
                min={0}
                max={9999}
                onChange={(v) => step(j, { points: clamp(v, 0, 9999) })}
              />
            </label>
            {q.steps.length > 1 && (
              <PixelButton
                size="sm"
                onClick={() => set({ ...q, steps: q.steps.filter((_, k) => k !== j) })}
                aria-label={`Quest ${i + 1}: delete step ${j + 1}`}
              >
                ×
              </PixelButton>
            )}
          </li>
        ))}
        {q.steps.length < RUSH_MAX_STEPS && (
          <li className="flex items-end">
            <PixelButton
              size="sm"
              onClick={() =>
                set({
                  ...q,
                  steps: [...q.steps, { target: (last?.target ?? 0) * 2 || 1, points: last?.points ?? 10 }],
                })
              }
            >
              + Step
            </PixelButton>
          </li>
        )}
      </ol>
    </li>
  )
}

/** Its settings: the type (or a rotation, for a weekly one), the boost, the quests, the gauge. */
export function RushEditor({
  e,
  set,
  data,
}: {
  e: LiveEvent
  set: (rush: Rush) => void
  data: GameData | null
}) {
  const r = e.rush
  const items = data ? Object.values(data.items).sort((a, b) => a.name.localeCompare(b.name)) : []
  const total = rushTotalPoints(e)
  const setQuests = (quests: RushQuest[]) => set({ ...r, quests })
  const weekly = e.repeat?.kind === 'weekly'
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
        <Field
          label="Type"
          hint="Its Pokémon count for the quests; its attacks hit harder. The picture defaults to its gym stage."
        >
          <select
            className={inputCls}
            value={r.type}
            onChange={(ev) => {
              const type = ev.target.value as PokeType
              // The default gauge's Pokémon follows the type while the gauge is the default one.
              const same = JSON.stringify(r.gauge) === JSON.stringify(defaultRushGauge(r.type))
              set({ ...r, type, ...(same && { gauge: defaultRushGauge(type) }) })
            }}
          >
            {POKE_TYPES.map((t) => (
              <option key={t} value={t}>
                {cap(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Boost + %" hint="On the player's attacks of the type only.">
          <NumInput
            value={Math.round((r.boost - 1) * 100)}
            min={0}
            max={300}
            step={5}
            onChange={(v) => set({ ...r, boost: 1 + clamp(v, 0, 300) / 100 })}
          />
        </Field>
      </div>
      {weekly && (
        <fieldset className="grid gap-1.5 border-2 border-line p-2">
          <legend className="px-1 text-lg">Rotate each week</legend>
          <p className="m-0 text-sm text-muted">
            Tick types in the order they come: each week's run takes the next. None ticked: always the type
            above. This week's run: {cap(rushType(e))}.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {POKE_TYPES.map((t) => {
              const at = r.rotate.indexOf(t)
              return (
                <label key={t} className="flex min-h-[34px] items-center gap-1 text-base">
                  <input
                    type="checkbox"
                    checked={at >= 0}
                    onChange={(ev) =>
                      set({
                        ...r,
                        rotate: ev.target.checked ? [...r.rotate, t] : r.rotate.filter((x) => x !== t),
                      })
                    }
                  />
                  <TypeBadge type={t} size="sm" />
                  {at >= 0 && <span className="text-sm text-muted">#{at + 1}</span>}
                </label>
              )
            })}
          </div>
        </fieldset>
      )}
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="m-0 text-xl font-normal">Quests</h4>
          <span className="text-base text-muted">
            {r.quests.length} · {total} points in all
          </span>
          <span className="ml-auto flex gap-1">
            <PixelButton
              size="sm"
              disabled={r.quests.length >= RUSH_MAX_QUESTS}
              onClick={() =>
                setQuests([
                  ...r.quests,
                  { id: newQuestId(r.quests, 'catch'), kind: 'catch', steps: [{ target: 5, points: 10 }] },
                ])
              }
            >
              + Quest
            </PixelButton>
            <PixelButton
              size="sm"
              onClick={() => {
                if (window.confirm('Replace the quests and the gauge with the default ones?'))
                  set({ ...r, quests: defaultRushQuests(), gauge: defaultRushGauge(r.type) })
              }}
            >
              Reset to the default list
            </PixelButton>
          </span>
        </div>
        <ol className="m-0 grid list-none gap-2 p-0">
          {r.quests.map((q, i) => (
            <QuestRow
              key={q.id}
              q={q}
              i={i}
              count={r.quests.length}
              set={(nq) => setQuests(r.quests.map((x, k) => (k === i ? nq : x)))}
              remove={() => setQuests(r.quests.filter((_, k) => k !== i))}
              move={(by) => {
                const list = [...r.quests]
                const [it] = list.splice(i, 1)
                list.splice(i + by, 0, it!)
                setQuests(list)
              }}
            />
          ))}
        </ol>
      </section>
      <section className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="m-0 text-xl font-normal">Reward gauge</h4>
          <span className="text-base text-muted">
            Given as the player's points reach each mark (the quests pay {total}).
          </span>
          <PixelButton
            size="sm"
            className="ml-auto"
            disabled={r.gauge.length >= RUSH_MAX_GAUGE}
            onClick={() =>
              set({
                ...r,
                gauge: [
                  ...r.gauge,
                  {
                    at: Math.min(total, (r.gauge[r.gauge.length - 1]?.at ?? 0) + 50) || 50,
                    reward: { kind: 'gold', amount: 1000 },
                  },
                ],
              })
            }
          >
            + Reward
          </PixelButton>
        </div>
        {data && (
          <ol className="m-0 grid list-none gap-2 p-0">
            {r.gauge.map((g, i) => {
              const setRow = (patch: Partial<typeof g>) => {
                const gauge = r.gauge.map((x, k) => (k === i ? { ...x, ...patch } : x))
                set({ ...r, gauge })
              }
              return (
                <li key={i} className="flex flex-wrap items-end gap-2 border-t-2 border-line pt-2">
                  <label className="flex w-24 flex-col text-base">
                    At points
                    <NumInput
                      value={g.at}
                      min={1}
                      max={99_999}
                      onChange={(v) => setRow({ at: clamp(v, 1, 99_999) })}
                    />
                  </label>
                  <label className="flex w-36 flex-col text-base">
                    Reward
                    <RewardKindSelect
                      r={g.reward}
                      set={(reward) => setRow({ reward })}
                      label={`Reward ${i + 1}: kind`}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <RewardFields
                      r={g.reward}
                      set={(reward) => setRow({ reward })}
                      data={data}
                      items={items}
                    />
                  </div>
                  <PixelButton
                    size="sm"
                    onClick={() => set({ ...r, gauge: r.gauge.filter((_, k) => k !== i) })}
                    aria-label={`Reward ${i + 1}: delete`}
                  >
                    Delete
                  </PixelButton>
                </li>
              )
            })}
          </ol>
        )}
        <p className="m-0 text-sm text-muted">
          The marks are sorted when saved; the last one must be at most {total}.
        </p>
      </section>
    </div>
  )
}
