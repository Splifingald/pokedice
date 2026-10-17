// Dev route: every design-system component in every state (docs/15-UI-GUIDELINES.md). Check at 360 px and 1440 px.
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  DIE_TYPES,
  POKE_TYPES,
  STATUS_KINDS,
  deckSize,
  emptyProgress,
  emptyStatus,
  type AreaProgress,
  type DeckCard,
  type PokeType,
  type Species,
} from '@/engine'
import { Chip, LevelTag, NewTag, StatusChip } from '@/components/Chip'
import { CryButton } from '@/components/CryButton'
import { Dialogue } from '@/components/Dialogue'
import { Die, DieFaces } from '@/components/Die'
import { FaceDice, facesStatuses, StatusLines } from '@/components/FaceDice'
import { Gauge } from '@/components/Gauge'
import { GoldPill } from '@/components/GoldPill'
import { HpBar } from '@/components/HpBar'
import { ICONS, PixelIcon, type IconName } from '@/components/icons'
import { ItemSprite } from '@/components/ItemSprite'
import { Modal } from '@/components/Modal'
import { MonTile, TILE_GRID, TileTag } from '@/components/MonTile'
import { PageHead, Wallet } from '@/components/PageHead'
import { Panel } from '@/components/Panel'
import { PixelButton } from '@/components/PixelButton'
import { SearchSelect } from '@/components/SearchSelect'
import { FilterChips, SearchField, Seg } from '@/components/Segmented'
import { SortSelect, TypeSelect } from '@/components/TypeSelect'
import { RecommendedThumb } from '@/components/RecommendedThumb'
import { Medal } from '@/screens/events/RebattlePage'
import { RoundGauge } from '@/screens/area/RoundGauge'
import { Sheet } from '@/components/Sheet'
import { SpriteImg } from '@/components/SpriteImg'
import { StatusIcons } from '@/components/StatusIcons'
import { Toggle } from '@/components/Toggle'
import { TypeBadge, TypeSwatch } from '@/components/TypeBadge'
import { soundOn } from '@/save/storage'
import { pushToast, setSettings, useGame } from '@/store/game'
import { BattleBits } from './kitchen/BattleBits'
import { DoubleBits } from './kitchen/DoubleBits'
import { DayCareBits } from './kitchen/DayCareBits'
import { NicknameBits } from './kitchen/NicknameBits'
import { TradeKitBits } from './kitchen/TradeBits'
import { PushBits } from './kitchen/PushBits'
import { GeneralBits } from './kitchen/GeneralBits'
import { RulesBits } from './kitchen/RulesBits'
import { ExtremeBits } from './kitchen/ExtremeBits'
import { PartnerBits } from './kitchen/PartnerBits'
import { RaidBits } from './kitchen/RaidBits'
import { WorldBits } from './kitchen/WorldBits'
import { PortalBits } from './kitchen/PortalBits'
import { PortalRaidBits } from './kitchen/PortalRaidBits'
import { NightmareBits } from './kitchen/NightmareBits'
import { NightmareRaidBits } from './kitchen/NightmareRaidBits'
import { GiftBits } from './kitchen/GiftBits'
import { InviteBits } from './kitchen/InviteBits'
import { SupportBits } from './kitchen/SupportBits'
import { TrickBits } from './kitchen/TrickBits'
import { RotateView } from '@/components/RotateCover'
import { BadgeIcon, CrownIcon } from '@/components/BadgeIcon'
import { BoardRow } from '@/components/BoardRow'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Panel title={<h2 className="text-[24px] leading-none">{title}</h2>} className="mb-5">
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </Panel>
  )
}

const VARIANTS = ['primary', 'secondary', 'gold', 'success', 'danger', 'ghost', 'dark'] as const

/** The real setting, so the cry buttons' "off" state shows too. */
function SoundToggle() {
  const on = useGame((s) => soundOn(s.settings))
  return (
    <Toggle label="Sound" on={on} onChange={(v) => setSettings({ sound: v, sfx: v })} className="w-full max-w-md" />
  )
}

/** The round gauge in each state, on an area with a round of six or more cards. */
function RoundGaugeStates() {
  const data = useGame((s) => s.data)
  const area = data.areas.find((a) => deckSize(a) >= 6)
  if (!area) return null
  const n = deckSize(area)
  const mid: AreaProgress = { ...emptyProgress(), drawn: ['wild', 'center'], deck: Array<DeckCard>(n - 2).fill('wild') }
  const done: AreaProgress = { ...emptyProgress(), drawn: Array.from({ length: n }, (_, i) => (i % 3 ? 'wild' : 'trainer')) }
  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <RoundGauge area={area} progress={mid} />
      <RoundGauge area={area} progress={emptyProgress()} />
      <RoundGauge area={area} progress={done} />
      <div className="flex flex-col gap-1.5 border-t-[3px] border-edge bg-parchment px-3 py-2">
        <RoundGauge area={area} progress={mid} compact />
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
          <PixelButton size="lg" className="px-2">
            Home
          </PixelButton>
          <PixelButton variant="primary" size="lg" className="px-2">
            Continue
          </PixelButton>
        </div>
      </div>
    </div>
  )
}

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
  const [ksType, setKsType] = useState<PokeType | 'all'>('all')
  const [ksSort, setKsSort] = useState<'level' | 'dex' | 'az'>('level')
  const [toggle, setToggle] = useState(true)

  const faceFor = (t: (typeof DIE_TYPES)[number], i: number) => data.diceTypes[t]?.faces[(i + roll) % 6] ?? null
  const statusFace = (t: (typeof DIE_TYPES)[number]) => data.diceTypes[t]?.faces.find((f) => f.kind === 'status') ?? null

  return (
    <main className="mx-auto max-w-6xl px-3 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-display">Kitchen sink</h1>
        <Link to="/kitchen-sink/fx" className="underline">
          FX lab ▶
        </Link>
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
          {/* Every component in both themes: flip this and scroll. */}
          <Seg
            label="Theme"
            value={settings.theme ?? 'light'}
            onChange={(v) => setSettings({ theme: v })}
            options={[
              { id: 'light', label: 'Light' },
              { id: 'dark', label: 'Dark' },
              { id: 'auto', label: 'Auto' },
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

      <Section title="CryButton">
        {/* A species, a Mega with its own cry, a form that borrows its species'. Gone while sound is off. */}
        {[
          [25, 'Pikachu'],
          [10034, 'Mega Charizard X'],
          [10103, 'Alolan Vulpix'],
        ].map(([dex, name]) => (
          <div key={dex} className="flex items-center gap-2">
            <CryButton dex={dex as number} name={name as string} />
            <span className="text-lg">{name}</span>
          </div>
        ))}
        <SoundToggle />
      </Section>

      <Section title="Chips · tags · toggle">
        {(['plain', 'gold', 'green', 'done', 'red', 'blue', 'lock', 'dark'] as const).map((tone) => (
          <Chip key={tone} tone={tone}>
            {tone}
          </Chip>
        ))}
        <NewTag />
        <LevelTag level={36} />
        {/* RecommendedThumb: inline after a name, and over a sprite's corner (a raid team's Pokémon worth bringing). */}
        <span className="flex items-center gap-1.5 text-[18px]">
          Charizard <RecommendedThumb size={18} />
        </span>
        <span className="relative inline-block">
          <SpriteImg dex={6} size={48} />
          <RecommendedThumb overlay />
        </span>
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
        {/* TypeSelect: every type, then one picked (its colour beside it). */}
        <TypeSelect value={ksType} onChange={setKsType} types={['fire', 'water', 'grass', 'electric']} className="w-full" />
        <TypeSelect value="fire" onChange={() => undefined} types={['fire', 'water']} className="w-full" />
        {/* SortSelect: the raid team's order, beside its TypeSelect. */}
        <div className="flex w-full flex-wrap gap-2">
          <SortSelect
            label="Sort by"
            value={ksSort}
            onChange={setKsSort}
            options={[
              { id: 'level', label: 'Highest level' },
              { id: 'dex', label: 'Pokédex No.' },
              { id: 'az', label: 'Name (A–Z)' },
            ]}
            className="min-w-0 flex-[1_1_140px]"
          />
          <TypeSelect value={ksType} onChange={setKsType} types={['fire', 'water']} className="min-w-0 flex-[1_1_140px]" />
        </div>
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
          {/* Values without pips show their number, centred like the pips. */}
          <Die type="ground" face={{ kind: 'number', value: 0 }} label="number face 0" />
          <Die type="flying" face={{ kind: 'number', value: 7 }} label="number face 7" />
          <Die type="dragon" face={{ kind: 'number', value: 8 }} label="number face 8" />
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

      <Section title="FaceDice · StatusLines (Pokémon sheet, Upgrades)">
        <div className="flex w-full max-w-md flex-col gap-2">
          {(['electric', 'fire', 'grass'] as const).map((ty) => (
            <div key={ty} className="flex flex-col gap-1">
              <FaceDice type={ty} faces={data.diceTypes[ty].faces} />
              <StatusLines statuses={facesStatuses(data.diceTypes[ty].faces)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="PageHead · Wallet · MonTile · ItemSprite (atlas)">
        <div className="flex w-full flex-col gap-2">
          <PageHead icon="navShop" title="Poké Mart" as="h2">
            <Wallet />
          </PageHead>
          <ul className={TILE_GRID}>
            <li>
              <MonTile dex={25} number="#025" name="Pikachu" label="Pikachu" onClick={() => {}} tags={<TileTag tone="new">NEW</TileTag>} />
            </li>
            <li>
              <MonTile dex={1} number="#001" name="???" missing label="???" onClick={() => {}} tags={<TileTag tone="near">Nearby</TileTag>} />
            </li>
            <li>
              <MonTile dex={6} name="Charizard" sub="Lv.36" label="Charizard" onClick={() => {}} />
            </li>
            <li>
              <MonTile dex={94} name="Gengar" sub="Lv.42" locked label="Gengar, Locked until Lv.42" onClick={() => {}} />
            </li>
          </ul>
          <div className="flex flex-wrap gap-2">
            {['poke-ball', 'great-ball', 'potion', 'thunder-stone', 'old-amber'].map((k) => (
              <ItemSprite key={k} item={data.items[k]} size={32} />
            ))}
          </div>
        </div>
      </Section>

      <Section title="Rebattle medals — Bronze, Silver, Gold, Diamond (sm · md · big)">
        {(['sm', 'md', 'big'] as const).map((size) => (
          <div key={size} className="flex items-end gap-4">
            {[0, 1, 2, 3].map((tier) => (
              <Medal key={tier} tier={tier} size={size} />
            ))}
          </div>
        ))}
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

      <Section title="RoundGauge — a round under way, its start, just done; compact over an action bar">
        <RoundGaugeStates />
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

      <Section title="Badges · crown · board rows">
        <div className="flex flex-wrap gap-2 bg-[#2b3a63] p-2">
          {[
            'Boulder Badge',
            'Cascade Badge',
            'Thunder Badge',
            'Rainbow Badge',
            'Soul Badge',
            'Marsh Badge',
            'Volcano Badge',
            'Earth Badge',
            'Zephyr Badge',
            'Storm Badge',
            'Relic Badge',
            'Glacier Badge',
            'Fairy Badge',
            'Normalium Z',
          ].map((b) => (
            <BadgeIcon key={b} badge={b} earned size={36} />
          ))}
          <BadgeIcon badge="Boulder Badge" earned={false} size={36} />
          <CrownIcon earned size={36} label="Crown" />
          <CrownIcon earned={false} size={36} label="Crown — not earned yet" />
        </div>
        <ol className="m-0 grid w-full max-w-[420px] list-none gap-1.5 p-0">
          <BoardRow
            rank={1}
            look="/characters/red.png"
            name="Red"
            team={[
              { dex: 25, level: 88 },
              { dex: 6, level: 85 },
            ]}
            value="Lv.88"
          />
          <BoardRow
            rank={2}
            look="/characters/green.png"
            name="Leaf"
            isMe
            team={[{ dex: 3, level: 60 }]}
            value="Lv.60"
          />
          <BoardRow
            rank={7}
            look="/characters/red.png"
            name="Blue"
            team={[{ dex: 9, level: 41 }]}
            value="Lv.41"
          />
        </ol>
      </Section>

      <Section title="Battle: stage, plates, tray, readout, team pips (and the raid's compact ones, speed button), Bag, catch">
        <BattleBits />
      </Section>

      <Section title="Double battles: the four-Pokémon stage (front pair big, partners behind), name-less plates, target picker, the preview's tag and INFO, rules, two leads">
        <DoubleBits />
      </Section>

      <Section title="PartnerMoment: the lab (new game, new region)">
        <PartnerBits />
      </Section>

      <Section title="Day Care: Egg, hearts, tags, slot cards, empty slots, Egg now, the Egg card">
        <DayCareBits />
      </Section>

      <Section title="Nicknames: the name on a Pokémon's sheet (tap to rename), the dialog without and with a nickname">
        <NicknameBits />
      </Section>

      <Section title="RulesModal · InfoButton: a feature's rules (the unlock pop-up, the INFO copy)">
        <RulesBits />
      </Section>

      <Section title="General upgrades: the tab's cards, rules and INFO, while you were away, golden names (docs/25)">
        <GeneralBits />
      </Section>

      <Section title="Trades: visibility, wants, time left, board rows (every state), listing sheet, share, rules, the trade scene, results">
        <TradeKitBits />
      </Section>

      <Section title="Push notifications: each feature's question (and an iPhone tab's), Settings' panel in every state">
        <PushBits />
      </Section>

      <Section title="Gifts: under a message (ready, open it, asking, waiting), opened, what arrived, rules, the opening">
        <GiftBits />
      </Section>

      <Section title="Invite rewards: the gauge in every state, the Friends page’s card, Prof. Oak’s invite, ready, rules, the opening">
        <InviteBits />
      </Section>

      <Section title="Support me: the developer's asks (Discord, invite, PayPal), with and without a Discord link">
        <SupportBits />
      </Section>

      <Section title="RotateCover: a phone or a tablet held sideways (over the whole game, nothing to dismiss)">
        <div className="flex w-full justify-center bg-parchment p-3 shadow-ring">
          <RotateView />
        </div>
      </Section>

      <Section title="Extreme mode: rules, band, title card, K.O. rest, resting team, while you were away, switch">
        <ExtremeBits />
      </Section>

      <Section title="Raids: the NPC partners pop-up (each state), a legendary raid's card open and caught">
        <RaidBits />
      </Section>

      <Section title="Small worlds: square, pop-up, partner pick, strip, squares inside, boosters, dice level, mythical card, closing, away page">
        <WorldBits />
      </Section>

      <Section title="Portal run (Distortion World): the portal, gauge, breach and its pop-up, rules, boons, bonuses, shader, screen distortion, victory">
        <PortalBits />
      </Section>
      <Section title="Giratina's area raid (Distortion World): the themed raid page, its pop-up, the raid's stage and a bar's tear">
        <PortalRaidBits />
      </Section>
      <Section title="Darkrai's nightmare (Newmoon Island): the moon, gauge, way in (intro, then its pop-up), rules, a haunted foe, Darkrai's strike, result cards, the locked Areas button, the waking">
        <NightmareBits />
      </Section>
      <Section title="Darkrai's area raid (the nightmare): the themed raid page, its pop-up, the raid's stage and a bar's shadow, the screen's vignette">
        <NightmareRaidBits />
      </Section>
      <Section title="Trick or Treat: the gauge of each tier, the screen in each state (idle, after a Treat, a Treat and a throw playing, a miss, caught, fled), the recaps, the pieces, preview cards, rules">
        <TrickBits />
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
