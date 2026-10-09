import type { Config } from 'tailwindcss'
import { DAYBREAK_TYPES, PALETTE, STATUS_COLORS } from './src/theme/colors'

const typeTokens = Object.fromEntries(Object.entries(DAYBREAK_TYPES).map(([k, v]) => [`type-${k}`, v]))
const statusTokens = Object.fromEntries(Object.entries(STATUS_COLORS).map(([k, v]) => [`st-${k}`, v]))

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        parchment: PALETTE.parchment,
        ink: PALETTE.ink,
        panel: PALETTE.panel,
        paper: PALETTE.paper,
        shadow: PALETTE.shadow,
        line: PALETTE.line,
        lip: PALETTE.lip,
        gold: PALETTE.gold,
        'gold-light': PALETTE.goldLight,
        'gold-pale': PALETTE.goldPale,
        accent: PALETTE.accent,
        danger: PALETTE.danger,
        'danger-light': PALETTE.dangerLight,
        muted: PALETTE.muted,
        faint: PALETTE.faint,
        good: PALETTE.good,
        'good-pale': PALETTE.goodPale,
        'hp-green': PALETTE.hpGreen,
        'hp-yellow': PALETTE.hpYellow,
        'hp-red': PALETTE.hpRed,
        'hp-trail': PALETTE.hpTrail,
        ...typeTokens,
        ...statusTokens,
      },
      fontFamily: {
        // Jersey only, everywhere (sans/serif/mono included so no utility or preflight default reaches a system font),
        // then the pixel CJK face for Japanese, Korean and Chinese characters (src/index.css). Jersey 20 for titles,
        // names, buttons and most text; Jersey 15 for labels, numbers and paragraphs.
        pixel: ['"Jersey 20"', '"Jersey 15"', 'var(--font-cjk)'],
        'pixel-sm': ['"Jersey 15"', '"Jersey 20"', 'var(--font-cjk)'],
        sans: ['"Jersey 20"', '"Jersey 15"', 'var(--font-cjk)'],
        serif: ['"Jersey 20"', '"Jersey 15"', 'var(--font-cjk)'],
        mono: ['"Jersey 15"', '"Jersey 20"', 'var(--font-cjk)'],
      },
      fontSize: {
        // Daybreak's scale: labels 15, small 17, base 20, large 22, button 22, titles 30–40.
        label: ['15px', '1.2'],
        small: ['17px', '1.2'],
        body: ['20px', '1.2'],
        large: ['22px', '1.15'],
        btn: ['22px', '1'],
        title: ['30px', '1'],
        display: ['40px', '1'],
      },
      borderRadius: {
        px2: '2px',
      },
      boxShadow: {
        hard: '0 4px 0 0 #24304f66',
        'hard-sm': '0 2px 0 0 #24304f66',
        // A flat 2px ink ring drawn inside the box (chips, cards, inputs): no layout shift.
        ring: 'inset 0 0 0 2px #24304f',
        'ring-line': 'inset 0 0 0 2px #b6c3d9',
        card: 'inset 0 0 0 2px #24304f, inset 0 -4px 0 #dfe7f2',
      },
      screens: {
        xs: '360px',
      },
    },
  },
  plugins: [],
} satisfies Config
