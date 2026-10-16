// Small worlds' preview on Home (docs/21 §9): before a world starts, its square stands greyed in the slot the world will
// take, with a countdown to the start and a gauge over the preview's window (the world's colour, red in the last hour,
// blinking in the last five minutes; a still stripe pattern where motion is calmed). No Pokémon on it: the world
// isn't there yet. A tap says when it starts. The engine (engine/worldPreview.ts) decides when it shows and every
// number; this file only draws them.
import { previewState, worldPreviewFor, type PreviewPhase, type SmallWorld } from '@/engine'
import { Chip } from '@/components/Chip'
import { useT } from '@/i18n/react'
import { clockTo, dayTime, timeLeft } from '@/lib/format'
import { useMotion } from '@/lib/motion'
import { pushToast, useGame } from '@/store/game'
import { useWorld, worldName } from '@/store/worlds'
import { HeadTag, WidgetRows, WIDGET_BANNER_H } from '@/screens/home/Widget'
import { cx } from '@/theme/util'
import { bannerUrl } from './shared'
import { WorldSquare, WorldTag, worldVars } from './world'

/**
 * The preview's gauge: the world's main colour filling toward the start; red, then blinking red. Where motion is calmed
 * (the OS asking, or animations off: `calm`) the blink is still red stripes instead; `still` forces that (the kitchen
 * sink shows both).
 */
export function PreviewGauge({
  fill,
  phase,
  still,
  className,
}: {
  fill: number
  phase: PreviewPhase
  still?: boolean
  className?: string
}) {
  const calm = useMotion().calm
  return (
    <span
      className={cx(
        'wp-gauge relative block h-1.5 w-full',
        phase !== 'normal' && 'hot',
        phase === 'blink' && 'wp-blinking',
        (still ?? calm) && 'still',
        className,
      )}
      aria-hidden
    >
      <i
        className="absolute inset-y-0 left-0 block"
        style={{ width: `${Math.max(0, Math.min(1, fill)) * 100}%` }}
      />
    </span>
  )
}

/**
 * The preview's square, on the live square's frame (the same rows, so it is the size of every square beside it): the
 * world's picture greyed, WORLD and SOON, "Starts in" and the clock ticking down, the name, the gauge and the date it
 * opens. Red from the last hour.
 */
export function WorldPreviewSquareView({
  world,
  now,
  still,
  onClick,
}: {
  world: SmallWorld
  now: number
  /** The calm gauge whatever the motion setting (the kitchen sink). */
  still?: boolean
  onClick: () => void
}) {
  const { t } = useT()
  const data = useGame((s) => s.data)
  const { left, fill, phase } = previewState(world, now)
  const name = worldName(world, data)
  const date = dayTime(Date.parse(world.start))
  const hot = phase !== 'normal'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('ui.world.preview.label', { name, time: timeLeft(left), date })}
      data-phase={phase}
      className="pixel-panel lv-square w-square wp-square relative isolate flex min-w-0 flex-col gap-[5px] overflow-hidden px-2.5 pb-2.5 pt-2 text-left"
      style={worldVars(world)}
    >
      <span className="lv-pic absolute inset-0 -z-10 block overflow-hidden bg-night" aria-hidden>
        {world.banner && (
          <img
            src={bannerUrl(world.banner)}
            alt=""
            className="pixelated absolute inset-0 h-full w-full object-cover grayscale"
          />
        )}
        {/* Greyed and dimmed, so the clock reads on any picture: the world isn't open yet. */}
        <span className="absolute inset-0 bg-night/40" />
      </span>
      <span className="flex w-full min-w-0 items-center gap-1.5 text-[19px] leading-none">
        <WorldTag />
        <HeadTag>
          <Chip tone={hot ? 'red' : 'dark'} className="uppercase tracking-[0.04em]">
            {t('ui.world.preview.tag')}
          </Chip>
        </HeadTag>
      </span>
      <span
        className="grid w-full content-center justify-items-center gap-1"
        style={{ aspectRatio: `288 / ${WIDGET_BANNER_H}` }}
        aria-hidden
      >
        <span className="lv-ink font-pixel-sm text-[15px] leading-none">
          {t('ui.world.preview.startsIn')}
        </span>
        <span
          className={cx(
            'lv-ink whitespace-nowrap text-[24px] leading-none tabular-nums',
            hot && 'text-[#ffb3a8]',
          )}
        >
          {clockTo(left)}
        </span>
      </span>
      <WidgetRows
        top={<span className="lv-ink truncate text-[20px] leading-none">{name}</span>}
        meter={<PreviewGauge fill={fill} phase={phase} still={still} />}
        // On the picture, art in both themes: the gold stays Daybreak's light gold at dusk too (light-scope).
        bottom={
          <span className={cx('light-scope lv-ink', hot ? 'text-[#ffb3a8]' : 'text-gold-light')}>
            {t('ui.world.opens', { date })}
          </span>
        }
      />
    </button>
  )
}

/**
 * Home's world slot, first among the event squares: the world that's open (its square), and the next one in its
 * preview window, greyed, until it starts. Both read the same clock, ticking every second, so at the start the preview
 * gives its place to the world's square on the same tick, with no reload.
 */
export function WorldSlot() {
  const { t } = useT()
  const save = useGame((s) => s.save)
  const data = useGame((s) => s.data)
  const { world, now } = useWorld(1000)
  if (!save || now == null) return null
  const preview = worldPreviewFor(save, data, now)
  return (
    <>
      {world && <WorldSquare world={world} now={now} />}
      {preview && preview.id !== world?.id && (
        <WorldPreviewSquareView
          world={preview}
          now={now}
          // It hasn't started: nothing to enter yet, so a tap says when it does (as a locked square says what opens it).
          onClick={() =>
            pushToast(
              t('ui.world.preview.toast', {
                name: worldName(preview, data),
                time: timeLeft(previewState(preview, now).left),
              }),
            )
          }
        />
      )}
    </>
  )
}
