// Kitchen sink: the Support me pop-up (side menu / Settings → SUPPORT ME), with the Discord row and without it (no
// invite link set in the admin).
import { useState } from 'react'
import { PixelButton } from '@/components/PixelButton'
import { SupportView } from '@/components/SupportModal'

const KOFI = 'https://ko-fi.com/example'
const DISCORD = 'https://discord.gg/example'

export function SupportBits() {
  const [open, setOpen] = useState<null | 'full' | 'noDiscord'>(null)
  const close = () => setOpen(null)
  return (
    <div className="flex flex-wrap gap-2">
      <PixelButton size="sm" onClick={() => setOpen('full')}>
        Support me
      </PixelButton>
      <PixelButton size="sm" onClick={() => setOpen('noDiscord')}>
        Support me, no Discord link
      </PixelButton>
      <SupportView
        open={!!open}
        onClose={close}
        kofi={KOFI}
        discord={open === 'noDiscord' ? null : DISCORD}
      />
    </div>
  )
}
