// Kitchen sink (dev only): idle mode and the play styles (docs/36) — the style cards with each one picked (and none),
// a new game's question, the area's switch (AUTO-MODE and Idle mode, off and on, with Prof. Oak's tip), the note that
// stands in for a card the autopilot takes, and the rules (unlock and INFO).
import { useState, type ReactNode } from 'react'
import { AutoModeButton } from '@/components/AutoModeToggle'
import { IdleRulesModal, PlayStylePicker, PlayStylePrompt } from '@/components/IdleMode'
import { InfoButton } from '@/components/RulesModal'
import { PixelButton } from '@/components/PixelButton'
import { PLAY_STYLES, type PlayStyle } from '@/engine'
import { useT } from '@/i18n/react'
import { AutopilotNote } from '@/screens/area/AutopilotNote'

function Frame({ name, children, wide = false }: { name: string; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className={wide ? 'flex w-full max-w-xl flex-col gap-1' : 'flex w-[340px] max-w-full flex-col gap-1'}
    >
      <span className="font-pixel-sm text-[13px] text-muted">{name}</span>
      {children}
    </div>
  )
}

export function IdleBits() {
  const { t } = useT()
  const [pick, setPick] = useState<PlayStyle | null>('explored')
  const [rules, setRules] = useState<'unlock' | 'info' | null>(null)
  return (
    <>
      <Frame name={`PlayStylePicker · live (${pick ?? 'none'})`}>
        <PlayStylePicker value={pick} onChange={setPick} label={t('ui.playStyle.title')} />
      </Frame>
      <Frame name="PlayStylePicker · none picked">
        <PlayStylePicker value={null} onChange={() => {}} label={t('ui.playStyle.title')} />
      </Frame>
      {PLAY_STYLES.map((s) => (
        <Frame key={s} name={`PlayStylePicker · ${s}`}>
          <PlayStylePicker value={s} onChange={() => {}} label={t('ui.playStyle.title')} />
        </Frame>
      ))}
      <Frame name="PlayStylePrompt · a new game's question" wide>
        <div className="bg-parchment p-3 shadow-ring">
          <PlayStylePrompt onPick={() => {}} />
        </div>
      </Frame>
      <Frame name="AutoModeButton · AUTO-MODE off, on; Idle mode off, on; with Prof. Oak's tip">
        <div className="flex flex-col gap-2 bg-panel p-2 shadow-ring">
          <AutoModeButton on={false} onToggle={() => {}} />
          <AutoModeButton on onToggle={() => {}} />
          <AutoModeButton on={false} idle onToggle={() => {}} />
          <AutoModeButton on idle onToggle={() => {}} />
          <AutoModeButton on={false} tip onToggle={() => {}} />
        </div>
      </Frame>
      <Frame name="AutopilotNote · a card the autopilot takes by itself">
        <AutopilotNote />
      </Frame>
      <Frame name="Rules · unlock (Later / Let's go!) and INFO (OK)">
        <div className="flex flex-col gap-2">
          <PixelButton size="sm" onClick={() => setRules('unlock')}>
            Unlock pop-up
          </PixelButton>
          <InfoButton name={t('ui.playStyle.idle')} onClick={() => setRules('info')} />
        </div>
      </Frame>
      <IdleRulesModal
        open={rules != null}
        onClose={() => setRules(null)}
        onGo={rules === 'unlock' ? () => setRules(null) : undefined}
      />
    </>
  )
}
