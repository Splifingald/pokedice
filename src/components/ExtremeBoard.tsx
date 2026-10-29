// Extreme mode's board (docs/48): one per region, a strip of the regions open to the player over it. Best times first,
// then the runs still going by badges (src/lib/extremeBoard.ts ranks them). The only board in Extreme mode: no level,
// Pokédex, shiny or raid boards there.
import { useEffect, useState } from 'react'
import { regionCaseOf, type Region } from '@/engine'
import { useT } from '@/i18n/react'
import { avatarOf } from '@/lib/avatars'
import { fetchExtremeBoard, rankExtremeBoard, type ExtremeBoardRow } from '@/lib/extremeBoard'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useGame } from '@/store/game'
import { BoardRow } from './BoardRow'
import { raceTime } from './ExtremeRuns'
import { PixelIcon } from './icons'
import { Seg } from './Segmented'

/** How many places a region's board shows (and the player's own row, wherever it stands). */
const TOP = 100

type Load =
  { state: 'loading' } | { state: 'ready'; rows: ExtremeBoardRow[] } | { state: 'off' } | { state: 'error' }

export function ExtremeBoard({ regions, rows: given }: { regions: Region[]; rows?: ExtremeBoardRow[] }) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const signedIn = useGame((s) => s.auth.status === 'signed_in')
  const [region, setRegion] = useState(regions[0]?.id ?? 'kanto')
  const [load, setLoad] = useState<Load>(given ? { state: 'ready', rows: given } : { state: 'loading' })
  useEffect(() => {
    if (given) return setLoad({ state: 'ready', rows: given })
    if (!isSupabaseConfigured) return setLoad({ state: 'off' })
    let live = true
    fetchExtremeBoard()
      .then((rows) => live && setLoad(rows ? { state: 'ready', rows } : { state: 'off' }))
      .catch(() => live && setLoad({ state: 'error' }))
    return () => {
      live = false
    }
  }, [given])
  if (!regions.length) return null
  const ranked = load.state === 'ready' ? rankExtremeBoard(load.rows, region) : []
  const shown = ranked.filter((r, i) => i < TOP || r.isMe)
  const total = regionCaseOf(data, region, [], false)?.badges.length ?? 8
  return (
    <section className="flex flex-col gap-2" aria-labelledby="extreme-board">
      <h2 id="extreme-board" className="m-0 flex items-center gap-2 text-[26px] font-normal leading-none">
        <PixelIcon name="trophy" size={24} />
        {t('ui.xrun.board')}
      </h2>
      {regions.length > 1 && (
        <Seg
          label={t('ui.xrun.board')}
          value={region}
          onChange={(v) => setRegion(v)}
          className="overflow-x-auto"
          options={regions.map((r) => ({ id: r.id, label: r.name }))}
        />
      )}
      {!signedIn && isSupabaseConfigured && (
        <p className="m-0 font-pixel-sm text-[16px] leading-tight text-muted">{t('ui.xrun.boardSignIn')}</p>
      )}
      {load.state === 'loading' ? (
        <p className="m-0 font-pixel-sm text-[16px] text-muted">{t('ui.common.loading')}</p>
      ) : !shown.length ? (
        <p className="m-0 font-pixel-sm text-[16px] text-muted">{t('ui.xrun.boardEmpty')}</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {shown.map((r) => (
            <BoardRow
              key={`${r.name}-${r.rank}-${r.isMe}`}
              rank={r.rank}
              look={avatarOf(r.avatar).src}
              name={r.name}
              // No General upgrades in Extreme (docs/48): no golden names on its board.
              isMe={r.isMe}
              isFriend={!!r.friendId}
              team={r.team}
              value={r.bestMs != null ? raceTime(r.bestMs) : undefined}
              sub={
                r.bestMs == null
                  ? t('ui.xrun.boardRunning', { badges: t('ui.xrun.badges', { n: r.badges, total }) })
                  : undefined
              }
            />
          ))}
        </ol>
      )}
    </section>
  )
}
