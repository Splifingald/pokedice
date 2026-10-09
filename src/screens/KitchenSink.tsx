// Dev route: every design-system component in every state (docs/15-UI-GUIDELINES.md). Check at 360 px and 1440 px.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DIE_TYPES, POKE_TYPES, STATUS_KINDS, emptyStatus, type Species } from '@/engine'
import { Chip, LevelTag, NewTag, StatusChip } from '@/components/Chip'
import { Dialogue } from '@/components/Dialogue'
import { Die, DieFaces } from '@/components/Die'
import { Gauge } from '@/components/Gauge'
import { GoldPill } from '@/components/GoldPill'
import { HpBar } from '@/components/HpBar'
import { ICONS, PixelIcon, type IconName } from '@/components/icons'
import { Modal } from '@/components/Modal'
import { Panel } from '@/components/Panel'
import { PixelButton } from '@/components/PixelButton'
import { SearchSelect } from '@/components/SearchSelect'
import { FilterChips, SearchField, Seg } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { SpriteImg } from '@/components/SpriteImg'
import { StatusIcons } from '@/components/StatusIcons'
import { Toggle } from '@/components/Toggle'
import { TypeBadge, TypeSwatch } from '@/components/TypeBadge'
import { pushToast, setSettings, useGame } from '@/store/game'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={<h2 className="text-[24px] leading-none">{title}</h2>} className="mb-5">
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </Panel>
  )
}

const VARIANTS = ['primary', 'secondary', 'gold', 'success', 'danger', 'ghost', 'dark'] as const

export function KitchenSink() {
  const data = useGame((s) => s.data)
  const settings = useGame((s) => s.settings)
  const [hp, setHp] = useState(80)
  const [gold, setGold] = useState(1240)
  const [roll, setRoll] = useState(0)
  const [selected, setSelected] = useState<number[]>([1])
  const [modal, setModal] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [mon, setMon] = useState<Species | null>(data.species[6] ?? null)
  const [gaugeVal, setGaugeVal] = useState(30)
  const [seg, setSeg] = useState<'combos' | 'dice'>('combos')
  const [filter, setFilter] = useState<'all' | 'catch' | 'secret' | 'cleared'>('all')
  const [q, setQ] = useState('')
  const [toggle, setToggle] = useState(true)

  const faceFor = (t: (typeof DIE_TYPES)[number], i: number) => data.diceTypes[t]?.faces[(i + roll) % 6] ?? null
  const statusFace = (t: (typeof DIE_TYPES)[number]) => data.diceTypes[t]?.faces.find((f) => f.kind === 'status') ?? null

  return (
    <main className="mx-auto max-w-6xl px-3 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-display">Kitchen sink</h1>
        <div className="flex flex-wrap gap-2">
          <Seg
            label="Animations"
            value={settings.reducedMotion ? 'off' : (settings.animations ?? 'full')}
            onChange={(v) => setSettings(v === 'off' ? { reducedMotion: true } : { reducedMotion: false, animations: v })}
            options={[
              { id: 'full', label: 'Full' },
              { id: 'short', label: 'Short' },
              { id: 'off', label: 'None' },
            ]}
          />
          <Link to="/" className="pixel-btn flex min-h-[44px] items-center px-3 text-lg">
            Title
          </Link>
        </div>
      </div>

      <Section title="Frames">
        <Panel className="w-56">Panel: the 9-slice frame, a lip, a dithered shadow.</Panel>
        <Panel variant="dark" className="w-56">
          Dark panel
        </Panel>
        <Panel variant="dialogue" className="w-56">
          Dialogue frame, with its inner ring.
        </Panel>
        <Panel title="With a title" className="w-56">
          Body
        </Panel>
        <div className="pixel-plate w-56 px-2.5 pb-2.5 pt-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[24px] leading-none">Safari Zone</span>
            <LevelTag level={24} className="ml-auto" />
          </div>
          <span className="font-pixel-sm text-[15px] text-muted">Plate: flat ring, clipped corners</span>
        </div>
        <div className="hatched w-56 p-3">Unavailable (dotted)</div>
      </Section>

      <Section title="PixelButton">
        {VARIANTS.map((v) => (
          <PixelButton key={v} variant={v}>
            {v}
          </PixelButton>
        ))}
        <div className="flex w-full flex-wrap items-end gap-3">
          <PixelButton size="sm">small</PixelButton>
          <PixelButton size="md">medium</PixelButton>
          <PixelButton size="lg" variant="primary">
            Large
          </PixelButton>
          <PixelButton size="xl" variant="primary" className="sheen">
            <PixelIcon name="play" size={24} />
            Continue
          </PixelButton>
          <PixelButton size="lg" variant="gold" className="sheen">
            New region
          </PixelButton>
          <PixelButton disabled>disabled</PixelButton>
          <PixelButton variant="primary" disabled>
            primary off
          </PixelButton>
        </div>
        {/* The tight case: a full-width button, the largest size, and the longest label a translation produces.
            The label shrinks to fit rather than running past the frame. */}
        <div className="w-[300px]" data-test="fit">
          <PixelButton size="lg" variant="success" className="w-full whitespace-nowrap">
            <PixelIcon name="map" size={20} />
            ALLER À LA NOUVELLE ZONE
          </PixelButton>
        </div>
      </Section>

      <Section title="Chips · tags · toggle">
        {(['plain', 'gold', 'green', 'done', 'red', 'blue', 'lock', 'dark'] as const).map((tone) => (
          <Chip key={tone} tone={tone}>
            {tone}
          </Chip>
        ))}
        <NewTag />
        <LevelTag level={36} />
        <div className="flex w-full flex-wrap gap-2">
          {STATUS_KINDS.map((s, i) => (
            <StatusChip key={s} status={s} count={i % 2 ? '1/2' : undefined} lit={i % 3 !== 2} />
          ))}
        </div>
        <Toggle label="A toggle" hint="Its hint, in Jersey 15" on={toggle} onChange={setToggle} className="w-full max-w-md" />
      </Section>

      <Section title="Segmented · filter chips · search">
        <Seg
          label="Upgrades"
          tabs
          value={seg}
          onChange={setSeg}
          options={[
            { id: 'combos', label: 'Combos', count: 5 },
            { id: 'dice', label: 'Dice', count: 15 },
          ]}
          className="w-full max-w-sm"
        />
        <FilterChips
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All', count: 28 },
            { id: 'catch', label: 'To catch', count: 4 },
            { id: 'secret', label: 'Secret', count: 4 },
            { id: 'cleared', label: 'Cleared', count: 15 },
          ]}
          className="w-full"
        />
        <SearchField id="ks-search" label="Search an area or a Pokémon" value={q} onChange={setQ} className="w-full max-w-sm" />
      </Section>

      <Section title="Dialogue">
        <Dialogue className="w-full max-w-xl" text={`A wild PIDGEY appeared! (roll ${roll})`} />
        <PixelButton size="sm" onClick={() => setRoll((r) => r + 1)}>
          Replay
        </PixelButton>
      </Section>

      <Section title="TypeBadge / TypeSwatch">
        {DIE_TYPES.map((t) => (
          <TypeBadge key={t} type={t} />
        ))}
        <div className="flex w-full flex-wrap gap-2">
          {POKE_TYPES.map((t) => (
            <TypeBadge key={t} type={t} size="sm" />
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {DIE_TYPES.map((t) => (
            <TypeSwatch key={t} type={t} />
          ))}
        </div>
      </Section>

      <Section title="HpBar">
        <div className="flex w-full max-w-md flex-col gap-2">
          {[100, 60, 35, 10, 0].map((p) => (
            <HpBar key={p} hp={p} max={100} />
          ))}
          <HpBar hp={hp} max={100} />
          <div className="flex gap-2">
            <PixelButton size="sm" variant="danger" onClick={() => setHp((h) => Math.max(0, h - 17))}>
              Hit −17
            </PixelButton>
            <PixelButton size="sm" variant="success" onClick={() => setHp(100)}>
              Heal
            </PixelButton>
          </div>
        </div>
      </Section>

      <Section title="SpriteImg">
        <SpriteImg dex={6} size={96} />
        <SpriteImg dex={25} size={96} flip />
        <SpriteImg dex={150} size={96} silhouette />
        <SpriteImg dex={9999} size={96} />
        <SpriteImg dex={143} size={48} />
      </Section>

      <Section title="Die — 19 skins (click to select, reroll replays the tumble)">
        <div className="flex w-full flex-wrap gap-3">
          {DIE_TYPES.map((t, i) => (
            <div key={t} className="flex flex-col items-center gap-1">
              <Die
                type={t}
                face={faceFor(t, i)}
                rollKey={`${t}-${roll}`}
                delay={i * 0.03}
                selected={selected.includes(i)}
                onClick={() => setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))}
              />
              <span className="font-pixel-sm text-sm">{t}</span>
            </div>
          ))}
        </div>
        <PixelButton variant="primary" onClick={() => setRoll((r) => r + 1)}>
          Reroll all
        </PixelButton>
        <div className="flex flex-wrap items-end gap-4">
          <Die type="fire" face={statusFace('fire')} label="status face" />
          <Die type="ice" face={statusFace('ice')} />
          <Die type="electric" face={statusFace('electric')} />
          <Die type="poison" face={statusFace('poison')} />
          <Die type="psychic" face={statusFace('psychic')} />
          <Die type="grass" face={data.diceTypes.grass.faces[3]} combo label="combo" />
          <Die type="grass" face={data.diceTypes.grass.faces[3]} combo label="combo" />
          <Die type="water" face={data.diceTypes.water.faces[2]} selected label="selected" />
          <Die type="fire" face={data.diceTypes.fire.faces[0]} locked label="locked" />
          <Die type="water" face={null} />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {[24, 28, 32, 40, 44, 54, 64, 80].map((s) => (
            <Die key={s} type="base" face={{ kind: 'number', value: 5 }} size={s} label={`${s}px`} />
          ))}
        </div>
        <div className="flex w-full flex-col gap-2">
          {(['base', 'normal', 'dragon', 'bug', 'fire'] as const).map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="w-20 font-pixel-sm">{t}</span>
              <DieFaces type={t} faces={data.diceTypes[t].faces} size={40} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Gauge">
        <div className="flex w-full max-w-md flex-col gap-2">
          <Gauge value={0} max={60} />
          <Gauge value={gaugeVal} max={60} />
          <Gauge value={60} max={60} />
          <Gauge value={1234} max={null} label="VICTORY ROAD" />
          <PixelButton size="sm" onClick={() => setGaugeVal((v) => (v + 7) % 61)}>
            +7
          </PixelButton>
        </div>
      </Section>

      <Section title="GoldPill · Toast · Modal · Sheet">
        <GoldPill amount={gold} />
        <PixelButton size="sm" onClick={() => setGold((g) => g + 57)}>
          +57 gold
        </PixelButton>
        <PixelButton size="sm" onClick={() => pushToast('Content updated')}>
          Toast info
        </PixelButton>
        <PixelButton size="sm" variant="success" onClick={() => pushToast('Cloud save loaded', 'good')}>
          Toast good
        </PixelButton>
        <PixelButton size="sm" variant="danger" onClick={() => pushToast('Not enough gold', 'bad')}>
          Toast bad
        </PixelButton>
        <PixelButton size="sm" variant="dark" onClick={() => setModal(true)}>
          Open modal
        </PixelButton>
        <PixelButton size="sm" onClick={() => setSheet(true)}>
          Open sheet
        </PixelButton>
        <Modal open={modal} onClose={() => setModal(false)} title="A modal">
          <p className="copy mb-3">Escape or click outside to close. Tab stays inside.</p>
          <div className="flex gap-2">
            <PixelButton variant="primary" onClick={() => setModal(false)}>
              OK
            </PixelButton>
            <PixelButton onClick={() => setSheet(true)}>Sheet on top</PixelButton>
          </div>
        </Modal>
        <Sheet
          open={sheet}
          onClose={() => setSheet(false)}
          title="Kanto"
          sub="15 cleared · 2/4 secrets found · 61/151 caught"
          head={<SearchField id="ks-sheet-q" label="Search an area or a Pokémon" value={q} onChange={setQ} />}
          footer={
            <PixelButton variant="primary" className="w-full" onClick={() => setSheet(false)}>
              Continue here
            </PixelButton>
          }
        >
          <ul className="flex flex-col gap-2.5">
            {data.areas.slice(0, 12).map((a) => (
              <li key={a.id} className="flex items-center gap-2 bg-paper p-2.5 shadow-card">
                <span className="min-w-0 flex-1 truncate text-[21px] leading-none">{a.name}</span>
                <LevelTag level={a.minLevel} />
              </li>
            ))}
          </ul>
        </Sheet>
      </Section>

      <Section title="SearchSelect">
        <div className="w-full max-w-sm">
          <SearchSelect
            options={data.speciesList}
            value={mon}
            onChange={setMon}
            getKey={(p) => p.dex}
            getLabel={(p) => `${p.dex} ${p.name}`}
            renderOption={(p) => (
              <span className="flex items-center gap-2">
                <SpriteImg dex={p.dex} size={32} />
                <span className="font-mono text-sm text-muted">#{String(p.dex).padStart(3, '0')}</span>
                <span className="truncate">{p.name}</span>
                <TypeBadge type={p.type1} size="sm" />
                {p.type2 && <TypeBadge type={p.type2} size="sm" />}
              </span>
            )}
          />
        </div>
      </Section>

      <Section title="StatusIcons · PixelIcon">
        <StatusIcons
          status={{ ...emptyStatus(), burn: { stacks: 3, turns: 2 }, poison: { turns: 3 }, frozen: 2, paralyze: 1, confused: true }}
        />
        <div className="flex flex-wrap gap-3">
          {(Object.keys(ICONS) as IconName[]).map((n) => (
            <span key={n} className="flex flex-col items-center gap-1 font-pixel-sm text-[12px]">
              <PixelIcon name={n} size={n.startsWith('nav') ? 32 : 24} />
              {n}
            </span>
          ))}
        </div>
      </Section>
    </main>
  )
}
