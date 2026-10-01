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
        // Jersey only, everywhere (sans/serif/mono included so no utility or preflight default reaches a system font),
        // then the pixel CJK face for Japanese, Korean and Chinese characters (src/index.css).
        pixel: ['"Jersey 25"', '"Jersey 15"', 'var(--font-cjk)'],
        'pixel-sm': ['"Jersey 15"', '"Jersey 25"', 'var(--font-cjk)'],
        sans: ['"Jersey 25"', '"Jersey 15"', 'var(--font-cjk)'],
        serif: ['"Jersey 25"', '"Jersey 15"', 'var(--font-cjk)'],
        mono: ['"Jersey 15"', '"Jersey 25"', 'var(--font-cjk)'],
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
