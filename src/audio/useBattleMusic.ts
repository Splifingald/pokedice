// The battle music's one switch-board (docs/38 §5): a fight screen mounts it with a line, saying whether the fight is
// still on (`playing`: off once its result card shows). It plays with Sound on and the player's Music setting
// on, at the player's volume; it fades out at the result card and when the screen goes.
import { useEffect } from 'react'
import { soundOn } from '@/save/storage'
import { useGame } from '@/store/game'
import { MUSIC_VOLUME, setMusicVolume, startMusic, stopMusic } from './music'

export function useBattleMusic(playing: boolean) {
  const on = useGame((s) => playing && soundOn(s.settings) && s.settings.music !== false)
  const volume = useGame((s) => s.settings.musicVolume ?? MUSIC_VOLUME)
  useEffect(() => {
    if (!on) return
    // Read when it starts; later changes go through `setMusicVolume` without starting over.
    startMusic(useGame.getState().settings.musicVolume ?? MUSIC_VOLUME)
    return () => stopMusic()
  }, [on])
  useEffect(() => setMusicVolume(volume), [volume])
}
