// Admin-only tools operating on YOUR OWN save. Balancing a 100-level game without these is not realistic.
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  centerHeal,
  COMBO_KEYS,
  createInstance,
  instanceMaxHp,
  linearAreas,
  maxComboLevel,
  maxDieLevel,
  POKE_TYPES,
  type AreaProgress,
  type ComboKey,
  type ForceKind,
  type PokeType,
} from '@/engine'
import { Panel } from '@/components/Panel'
import { PixelButton } from '@/components/PixelButton'
import { parseSave } from '@/save/schema'
import { mutateSave, pushToast, tickRegen, useGame } from '@/store/game'
import { deleteSave, newId, replaceSave, setForceNext } from '@/store/run'
import { Field, NumInput, PokemonPicker, inputCls } from '../widgets'

const emptyProgress = (): AreaProgress => ({ xp: 0, cleared: false, bossDefeated: false, bossesDefeated: [], gymsDefeated: [] })

export function DevToolsSection() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const run = useGame((s) => s.run)
  const navigate = useNavigate()
  const [gold, setGold] = useState(1000)
  const [catchDex, setCatchDex] = useState(25)
  const [catchLevel, setCatchLevel] = useState(10)
  const [instId, setInstId] = useState<string>('')
  const [level, setLevel] = useState(20)
  const [importText, setImportText] = useState('')

  if (!save)
    return (
      <p className="text-xl">
        No save yet — <Link to="/new" className="underline">start a game</Link> first.
      </p>
    )

  const areaId = run.areaId ?? save.currentAreaId
  const area = data.areas.find((a) => a.id === areaId)
  const inst = save.box.find((p) => p.id === (instId || save.box[0]?.id))

  const unlockAll = () =>
    mutateSave((s) => {
      const areaProgress = { ...s.areaProgress }
      linearAreas(data)
        .slice(0, -1)
        .forEach((a) => {
          const p = { ...emptyProgress(), ...areaProgress[a.id] }
          const gaugeBosses = (a.legendaryBoss ?? []).filter((b) => b.teamAvgThreshold == null).map((b) => b.dex)
          areaProgress[a.id] = {
            ...p,
            xp: Math.max(p.xp, a.xpToUnlockNext ?? p.xp),
            cleared: true,
            bossesDefeated: [...new Set([...p.bossesDefeated, ...gaugeBosses])],
            bossDefeated: true,
            gymsDefeated: [...new Set([...p.gymsDefeated, ...a.gyms])],
          }
        })
      return { ...s, areaProgress }
    }) && pushToast('Every area of the main chain unlocked (secret areas still need their conditions)', 'good', 4500)

  const fillGauge = () =>
    area &&
    mutateSave((s) => {
      const p = { ...emptyProgress(), ...s.areaProgress[area.id] }
      return { ...s, areaProgress: { ...s.areaProgress, [area.id]: { ...p, xp: area.xpToUnlockNext ?? p.xp + 100 } } }
    }) &&
    pushToast(`${area.name} gauge filled`, 'good')

  const catchOne = () =>
    mutateSave((s) => {
      const i = createInstance(catchDex, catchLevel, data, newId(), Date.now())
      const team = s.team.length < data.config.maxTeamSize ? [...s.team, i.id] : s.team
      return { ...s, box: [...s.box, i], team, pokedex: [...new Set([...s.pokedex, catchDex])] }
    }) && pushToast(`${data.species[catchDex]?.name} caught (Lv.${catchLevel})`, 'good')

  const setInstLevel = () =>
    inst &&
    mutateSave((s) => ({
      ...s,
      box: s.box.map((p) => (p.id === inst.id ? { ...p, level, xp: 0, currentHp: instanceMaxHp({ dex: p.dex, level }, data) } : p)),
    }))

  const setAllUpgrades = (max: boolean) =>
    mutateSave((s) => ({
      ...s,
      comboLevels: Object.fromEntries(COMBO_KEYS.map((k) => [k, max ? maxComboLevel(k, data) : 1])) as Record<ComboKey, number>,
      dieLevels: Object.fromEntries(POKE_TYPES.map((t) => [t, max ? maxDieLevel(t, data) : 1])) as Record<PokeType, number>,
    }))

  const hurtAndRewind = () => {
    mutateSave((s) => ({
      ...s,
      box: s.box.map((p) => ({ ...p, currentHp: Math.floor(instanceMaxHp(p, data) * 0.2) })),
      lastRegenTick: Date.now() - 2 * 3.6e6,
    }))
    tickRegen()
    pushToast('Team set to 20 % HP, then 2 h of regen applied (+10 %)', 'good', 4500)
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-3xl">Dev Tools</h2>
      <p className="text-base text-muted">These act on your own save only.</p>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Economy">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Gold">
              <NumInput className="w-32" value={gold} onChange={(v) => setGold(v ?? 0)} />
            </Field>
            <PixelButton size="sm" onClick={() => mutateSave((s) => ({ ...s, gold: Math.max(0, gold) }))}>
              Set gold
            </PixelButton>
            <PixelButton size="sm" onClick={() => setAllUpgrades(true)}>
              Max all upgrades
            </PixelButton>
            <PixelButton size="sm" onClick={() => setAllUpgrades(false)}>
              Reset upgrades
            </PixelButton>
          </div>
        </Panel>

        <Panel title="Progress">
          <div className="flex flex-wrap gap-2">
            <PixelButton size="sm" onClick={unlockAll}>
              Unlock all areas
            </PixelButton>
            <PixelButton size="sm" disabled={!area} onClick={fillGauge}>
              Fill {area?.name ?? 'current'} gauge
            </PixelButton>
            <PixelButton size="sm" onClick={() => mutateSave((s) => centerHeal(s, data))}>
              Heal everything
            </PixelButton>
            <PixelButton size="sm" onClick={hurtAndRewind}>
              Test regen (−2 h)
            </PixelButton>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <Field label="Force next encounter">
              <select className={inputCls} value={run.forceNext ?? ''} onChange={(e) => setForceNext((e.target.value || null) as ForceKind | null)}>
                <option value="">— normal —</option>
                <option value="wild">wild</option>
                <option value="trainer">trainer</option>
                <option value="center">center</option>
                <option value="gym">gym / Elite battle</option>
                <option value="boss">legendary boss</option>
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="Catch any Pokémon">
          <div className="flex flex-wrap items-end gap-2">
            <PokemonPicker className="min-w-[240px] flex-1" data={data} value={catchDex} onChange={setCatchDex} />
            <Field label="Level">
              <NumInput className="w-20" value={catchLevel} onChange={(v) => setCatchLevel(Math.max(1, Math.min(100, v ?? 1)))} />
            </Field>
            <PixelButton size="sm" variant="primary" onClick={catchOne}>
              Catch
            </PixelButton>
          </div>
        </Panel>

        <Panel title="Set a Pokémon's level">
          <div className="flex flex-wrap items-end gap-2">
            <select className={`${inputCls} flex-1`} value={inst?.id ?? ''} onChange={(e) => setInstId(e.target.value)}>
              {save.box.map((p) => (
                <option key={p.id} value={p.id}>
                  {data.species[p.dex]?.name} Lv.{p.level}
                  {save.team.includes(p.id) ? ' (team)' : ''}
                </option>
              ))}
            </select>
            <Field label="Level">
              <NumInput className="w-20" value={level} onChange={(v) => setLevel(Math.max(1, Math.min(100, v ?? 1)))} />
            </Field>
            <PixelButton size="sm" variant="primary" onClick={setInstLevel}>
              Set
            </PixelButton>
          </div>
        </Panel>

        <Panel title="Save file" className="lg:col-span-2">
          <div className="flex flex-wrap gap-2">
            <PixelButton
              size="sm"
              onClick={() =>
                void navigator.clipboard
                  .writeText(JSON.stringify(save))
                  .then(() => pushToast('Save copied', 'good'))
                  .catch(() => pushToast('Clipboard unavailable', 'bad'))
              }
            >
              Export (copy JSON)
            </PixelButton>
            <PixelButton
              size="sm"
              variant="danger"
              onClick={() => {
                if (!window.confirm('Reset your save? This cannot be undone.')) return
                deleteSave()
                navigate('/')
              }}
            >
              Reset save
            </PixelButton>
          </div>
          <textarea
            className={`${inputCls} mt-2 h-24 font-mono text-xs`}
            placeholder="Paste a save JSON to import…"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <PixelButton
            size="sm"
            disabled={!importText.trim()}
            onClick={() => {
              try {
                const r = parseSave(JSON.parse(importText))
                if (!r.ok) return pushToast(`Invalid: ${r.error.slice(0, 80)}`, 'bad')
                replaceSave(r.save)
                setImportText('')
                pushToast('Save imported', 'good')
              } catch {
                pushToast('Not valid JSON', 'bad')
              }
            }}
          >
            Import
          </PixelButton>
        </Panel>
      </div>
    </div>
  )
}
