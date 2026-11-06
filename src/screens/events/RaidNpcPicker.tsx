// The NPC partners pop-up (docs/24): START with empty friend slots, in the day's raid or a progression raid, offers four
// NPC trainers with three Pokémon each, and the player picks as many as there are empty slots. The four come from a
// seed kept in the save, so a reload shows the same four; the next try brings four new ones (store/raidBattle.ts).
import { useState } from 'react'
import { raidRecommended, type RaidNpcOption } from '@/engine'
import { Modal } from '@/components/Modal'
import { PixelButton } from '@/components/PixelButton'
import { RecommendedThumb } from '@/components/RecommendedThumb'
import { MiniSprite } from '@/components/SpriteImg'
import { TrainerSprite } from '@/components/TrainerArt'
import { TypeBadge } from '@/components/TypeBadge'
import { useT } from '@/i18n/react'
import { pushToast, useGame } from '@/store/game'
import { cx } from '@/theme/util'
import { PortalRaidBanner, useTearIn } from './PortalRaid'
import { NightmareRaidBanner } from './NightmareRaid'
import { useShadowIn } from '@/components/Nightmare'

/** Someone already in the group: you, or a friend bringing their team. */
export interface GroupMember {
  name: string
  look: string | null
}

export function RaidNpcPicker({
  open,
  offer,
  need,
  group,
  level,
  onBack,
  onStart,
  initial = [],
  boss,
  portal,
  nightmare,
}: {
  open: boolean
  offer: RaidNpcOption[]
  /** The empty slots: how many to pick. */
  need: number
  group: GroupMember[]
  /** The level the NPCs' Pokémon fight at (the raid's team cap). */
  level: number
  onBack: () => void
  onStart: (picked: RaidNpcOption[]) => void
  /** Picked from the start (the kitchen sink's states). */
  initial?: number[]
  /** The raid Pokémon: the green thumb on the NPCs' Pokémon worth bringing against it. */
  boss?: number
  /**
   * Giratina's raid (docs/15 §27), its raid Pokémon's dex: the pop-up in the Distortion World's violet night, the portal
   * and that Pokémon distorted as its banner, tearing in as it opens.
   */
  portal?: number
  /**
   * Darkrai's raid (docs/15 §29), its raid Pokémon's dex: the pop-up in the moonlit night, the full moon and that
   * Pokémon as its banner, coming out of the shadow as it opens.
   */
  nightmare?: number
}) {
  const { t, tPlural } = useT()
  const data = useGame((s) => s.data)
  const [picked, setPicked] = useState<number[]>(initial)
  const tear = useTearIn(open && portal != null)
  const shade = useShadowIn(open && nightmare != null)
  const left = need - picked.length
  const nameOf = (o: RaidNpcOption, i: number) => o.owner ?? t('ui.raid.npcName', { n: i + 1 })
  const toggle = (i: number) =>
    setPicked((cur) => {
      if (cur.includes(i)) return cur.filter((x) => x !== i)
      if (cur.length >= need) {
        pushToast(tPlural('ui.raid.npcPick.full', need), 'info')
        return cur
      }
      return [...cur, i]
    })
  return (
    <Modal
      open={open}
      onClose={onBack}
      title={tPlural('ui.raid.npcPick.title', need)}
      className={cx(
        'max-w-md',
        portal != null && 'dw-scope dw-modal',
        tear,
        nightmare != null && 'nm-scope nm-modal',
        shade,
      )}
      banner={
        portal != null ? (
          <PortalRaidBanner mon={portal} className="h-[112px]" />
        ) : nightmare != null ? (
          <NightmareRaidBanner mon={nightmare} className="h-[112px]" />
        ) : undefined
      }
    >
      <div className="grid gap-3">
        {/* The group as it will start: you and your friends, then the slots the picks fill. */}
        <ol className="m-0 flex list-none justify-center gap-2 p-0" aria-label={t('ui.raid.groupTitle')}>
          {group.map((m, i) => (
            <li
              key={`g${i}`}
              className="grid h-[52px] w-12 place-items-end overflow-hidden bg-well shadow-ring"
              title={m.name}
            >
              <TrainerSprite src={m.look} size={48} alt={m.name} />
            </li>
          ))}
          {Array.from({ length: need }, (_, i) => {
            const o = picked[i] != null ? offer[picked[i]!] : null
            return (
              <li
                key={`s${i}`}
                className={cx(
                  'grid h-[52px] w-12 place-items-end overflow-hidden',
                  o
                    ? 'bg-gold-pale shadow-card-gold'
                    : 'bg-well shadow-ring-line outline-dashed outline-2 -outline-offset-[7px] outline-shadow',
                )}
              >
                {o ? (
                  <TrainerSprite src={o.look} size={48} alt={nameOf(o, picked[i]!)} />
                ) : (
                  <span className="sr-only">{t('ui.raid.npcPick.emptySlot')}</span>
                )}
              </li>
            )
          })}
        </ol>
        <p className="copy m-0 text-[18px]">{tPlural('ui.raid.npcPick.body', need)}</p>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
          {offer.map((o, i) => {
            const at = picked.indexOf(i)
            const names = o.team.map((d) => data.species[d]?.name ?? '').join(', ')
            return (
              <li key={i} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={at >= 0}
                  aria-label={t('ui.raid.npcPick.card', { name: nameOf(o, i), team: names, level })}
                  onClick={() => toggle(i)}
                  className={cx(
                    'relative grid h-full w-full content-start gap-1.5 px-1.5 pb-2 pt-1.5 text-left',
                    at >= 0 ? 'bg-gold-pale shadow-card-gold' : 'bg-paper shadow-card',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="grid h-11 w-10 shrink-0 place-items-end overflow-hidden bg-well shadow-ring-line">
                      <TrainerSprite src={o.look} size={40} />
                    </span>
                    <b className="min-w-0 flex-1 text-[17px] font-normal leading-[1.05] [overflow-wrap:anywhere]">
                      {nameOf(o, i)}
                    </b>
                    {at >= 0 && (
                      <span className="light-scope grid h-6 w-6 shrink-0 place-items-center bg-night text-[16px] leading-none text-gold-light">
                        {at + 1}
                      </span>
                    )}
                  </span>
                  <span className="grid grid-cols-3 gap-0.5" aria-hidden>
                    {o.team.map((d, k) => {
                      const s = data.species[d]
                      return (
                        <span key={k} className="grid min-w-0 justify-items-center gap-0.5">
                          <span className="relative">
                            <MiniSprite dex={d} size={32} className="-my-1" />
                            {boss != null && raidRecommended(data, { dex: d, level }, boss, level) && (
                              <RecommendedThumb overlay size={12} />
                            )}
                          </span>
                          {s && <TypeBadge type={s.type1} size="sm" />}
                        </span>
                      )
                    })}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">
          {t('ui.raid.npcPick.note', { level })}
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2.5">
          <PixelButton size="lg" onClick={onBack}>
            {t('ui.common.back')}
          </PixelButton>
          <PixelButton
            variant="primary"
            size="lg"
            disabled={left > 0}
            onClick={() => left === 0 && onStart(picked.map((i) => offer[i]!))}
          >
            {left > 0 ? tPlural('ui.raid.npcPick.more', left) : t('ui.raid.npcStart')}
          </PixelButton>
        </div>
      </div>
    </Modal>
  )
}
