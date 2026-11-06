// Kitchen sink: a computer's fight (the user's call, 2026-10-28): the Bag's column (items to use, the one picked, this
// turn's used, empty) and the team's (the one in battle, a status, a K.O., an item's "on whom", a switch's pick, the
// call after a K.O.), with the save's own team and bag.
import { useState } from 'react'
import { instanceMaxHp, instanceStats, monName, teamOf, usableIn, type Battler } from '@/engine'
import { effectText } from '@/i18n/text'
import { BagColumn, TeamColumn, type BagEntry } from '@/screens/battle/BattleSides'
import { useGame } from '@/store/game'

export function BattleSidesBits() {
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const [aim, setAim] = useState<string | null>(null)
  const [pick, setPick] = useState('')
  if (!save) return <p className="text-lg">The columns show with a save.</p>
  // The team as a fight's: the lead in battle, the second burned at half HP, the last K.O. (with three or more).
  const team: Battler[] = teamOf(save).map((p, i, all) => {
    const maxHp = instanceMaxHp(p, data)
    const out = all.length > 2 && i === all.length - 1
    return {
      uid: p.id,
      dex: p.dex,
      name: monName(p, data),
      level: p.level,
      types: [data.species[p.dex]?.type1 ?? 'normal'],
      dice: instanceStats(p, data).dice,
      maxHp,
      hp: out ? 0 : i === 1 ? Math.ceil(maxHp / 2) : maxHp,
      status: i === 1 ? { burn: { stacks: 1, turns: 2 } } : {},
    } as Battler
  })
  const entries: BagEntry[] = Object.entries(save.inventory)
    .filter(([k, n]) => n > 0 && usableIn(data.items[k], 'battle'))
    .map(([k, n]) => ({
      key: k,
      item: data.items[k]!,
      count: n,
      useful: data.items[k]!.effect.kind !== 'revive' || team.some((b) => b.hp <= 0),
      does: effectText(data.items[k]!),
    }))
  const lead = team[0]?.uid
  const able = new Set(team.filter((b) => b.hp > 0 && b.uid !== lead).map((b) => b.uid))
  const col = 'flex h-[420px] w-[300px] max-w-full flex-col gap-1'
  return (
    <div className="flex flex-wrap gap-4">
      <div className={col}>
        <b className="text-lg">The Bag: tap an item to pick it</b>
        <BagColumn
          entries={entries}
          open
          used={false}
          aim={aim}
          onPick={(k) => setAim((v) => (v === k ? null : k))}
          className="flex-1"
        />
      </div>
      <div className={col}>
        <b className="text-lg">This turn&apos;s item used</b>
        <BagColumn entries={entries} open={false} used aim={null} onPick={() => {}} className="flex-1" />
      </div>
      <div className={col}>
        <b className="text-lg">An empty Bag</b>
        <BagColumn entries={[]} open used={false} aim={null} onPick={() => {}} className="flex-1" />
      </div>
      <div className={col}>
        <b className="text-lg">The team: in battle, a status, a K.O.</b>
        <TeamColumn
          team={team}
          hpOf={(b) => b.hp}
          onField={(b) => b.uid === lead}
          canSwitch
          calling={false}
          onPick={(b) => setPick(b.uid)}
          aim={null}
          foe={['water']}
          className="flex-1"
        />
      </div>
      <div className={col}>
        <b className="text-lg">An item picked: on whom (the Bag above picks it)</b>
        <TeamColumn
          team={team}
          hpOf={(b) => b.hp}
          onField={(b) => b.uid === lead}
          canSwitch={false}
          calling={false}
          onPick={() => {}}
          aim={{
            item: aim ?? 'potion',
            helps: (b) => b.hp > 0 && b.hp < b.maxHp,
            whyNot: (b) => (b.hp <= 0 ? 'ui.sheet.itemFainted' : 'ui.sheet.itemFull'),
            onUse: () => setAim(null),
            onCancel: () => setAim(null),
          }}
          className="flex-1"
        />
      </div>
      <div className={col}>
        <b className="text-lg">The switch&apos;s pick, and the call after a K.O.</b>
        <TeamColumn
          team={team}
          hpOf={(b) => b.hp}
          onField={(b) => b.uid === lead}
          canSwitch
          calling
          onPick={() => {}}
          aim={null}
          pick={{ value: pick && able.has(pick) ? pick : ([...able][0] ?? ''), able, onChange: setPick }}
          className="flex-1"
        />
      </div>
    </div>
  )
}
