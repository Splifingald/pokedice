import type { Config } from 'tailwindcss'
import { PALETTE, TYPE_COLORS } from './src/theme/colors'

const typeTokens = Object.fromEntries(
  Object.entries(TYPE_COLORS).map(([k, v]) => [`type-${k}`, v]),
)

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: PALETTE.parchment,
        ink: PALETTE.ink,
        panel: PALETTE.panel,
        shadow: PALETTE.shadow,
        gold: PALETTE.gold,
        danger: PALETTE.danger,
        'danger-light': PALETTE.dangerLight,
        muted: PALETTE.muted,
        good: PALETTE.good,
        'hp-green': PALETTE.hpGreen,
        'hp-yellow': PALETTE.hpYellow,
        'hp-red': PALETTE.hpRed,
        ...typeTokens,
      },
      fontFamily: {
        pixel: ['"Jersey 25"', 'ui-monospace', 'monospace'],
        'pixel-sm': ['"Jersey 15"', '"Jersey 25"', 'ui-monospace', 'monospace'],
        body: ['"Atkinson Hyperlegible Next"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: {
        px2: '2px',
      },
      boxShadow: {
        hard: '4px 4px 0 0 #2a2438',
        'hard-sm': '2px 2px 0 0 #2a2438',
      },
      screens: {
        xs: '360px',
      },
    },
  },
  plugins: [],
} satisfies Config
