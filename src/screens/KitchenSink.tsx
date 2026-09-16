// Dev route: every design-system component in every state. Check at 360 px and 1440 px.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { DIE_TYPES, POKE_TYPES, emptyStatus, type Species } from '@/engine'
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
import { SpriteImg } from '@/components/SpriteImg'
import { StatusIcons } from '@/components/StatusIcons'
import { TypeBadge, TypeSwatch } from '@/components/TypeBadge'
import { pushToast, setSettings, useGame } from '@/store/game'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={<span className="text-xl">{title}</span>} className="mb-5">
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </Panel>
  )
}

export function KitchenSink() {
  const data = useGame((s) => s.data)
  const settings = useGame((s) => s.settings)
  const [hp, setHp] = useState(80)
  const [gold, setGold] = useState(120)
  const [roll, setRoll] = useState(0)
  const [selected, setSelected] = useState<number[]>([1])
  const [modal, setModal] = useState(false)
  const [mon, setMon] = useState<Species | null>(data.species[6] ?? null)
  const [gaugeVal, setGaugeVal] = useState(30)

  const faceFor = (t: (typeof DIE_TYPES)[number], i: number) => data.diceTypes[t]?.faces[(i + roll) % 6] ?? null

  return (
    <div className="mx-auto max-w-6xl px-3 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-5xl">Kitchen sink</h1>
        <div className="flex gap-2">
          <PixelButton size="sm" variant={settings.reducedMotion ? 'primary' : 'secondary'} onClick={() => setSettings({ reducedMotion: !settings.reducedMotion })}>
            Reduced motion: {settings.reducedMotion ? 'ON' : 'off'}
          </PixelButton>
          <Link to="/" className="pixel-btn bg-panel px-2 py-1 text-lg">
            Title
          </Link>
        </div>
      </div>

      <Section title="Panels">
        <Panel className="w-56">Light panel</Panel>
        <Panel variant="dark" className="w-56">
          Dark panel
        </Panel>
        <Panel variant="dialogue" className="w-56">
          Dialogue frame
        </Panel>
        <Panel title="With title" className="w-56">
          Body
        </Panel>
      </Section>

      <Section title="PixelButton">
        {(['primary', 'secondary', 'danger', 'success', 'ghost', 'dark'] as const).map((v) => (
          <PixelButton key={v} variant={v}>
            {v}
          </PixelButton>
        ))}
        <PixelButton size="sm">small</PixelButton>
        <PixelButton size="lg" variant="primary">
          LARGE
        </PixelButton>
        <PixelButton disabled>disabled</PixelButton>
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
        <div className="flex gap-1">
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
              <span className="text-sm">{t}</span>
            </div>
          ))}
        </div>
        <PixelButton variant="primary" onClick={() => setRoll((r) => r + 1)}>
          Reroll all
        </PixelButton>
        <div className="flex gap-3">
          <Die type="fire" face={data.diceTypes.fire.faces[0]} locked label="locked" />
          <Die type="ice" face={data.diceTypes.ice.faces[0]} />
          <Die type="electric" face={data.diceTypes.electric.faces[3]} />
          <Die type="psychic" face={data.diceTypes.psychic.faces[5]} />
          <Die type="poison" face={data.diceTypes.poison.faces[0]} />
          <Die type="ghost" face={data.diceTypes.ghost.faces[5]} />
          <Die type="ground" face={data.diceTypes.ground.faces[5]} />
          <Die type="ghost" face={data.diceTypes.ghost.faces[0]} size={40} />
          <Die type="water" face={null} />
        </div>
        <div className="flex w-full flex-col gap-2">
          {(['base', 'normal', 'dragon', 'bug'] as const).map((t) => (
            <div key={t} className="flex items-center gap-2">
              <span className="w-20">{t}</span>
              <DieFaces type={t} faces={data.diceTypes[t].faces} />
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

      <Section title="GoldPill · Toast · Modal">
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
        <Modal open={modal} onClose={() => setModal(false)} title="A modal">
          <p className="mb-3 text-xl">Escape or click outside to close.</p>
          <PixelButton variant="primary" onClick={() => setModal(false)}>
            OK
          </PixelButton>
        </Modal>
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
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ICONS) as IconName[]).map((n) => (
            <span key={n} className="flex flex-col items-center text-xs">
              <PixelIcon name={n} size={24} />
              {n}
            </span>
          ))}
        </div>
      </Section>
    </div>
  )
}
