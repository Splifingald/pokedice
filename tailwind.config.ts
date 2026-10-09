import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'
import { DAYBREAK_TYPES, PALETTE, STATUS_COLORS, THEMES } from './src/theme/colors'

const typeTokens = Object.fromEntries(Object.entries(DAYBREAK_TYPES).map(([k, v]) => [`type-${k}`, v]))
const statusTokens = Object.fromEntries(Object.entries(STATUS_COLORS).map(([k, v]) => [`st-${k}`, v]))

/** '#24304f' → '36 48 79', the form `rgb(var(--c-ink) / <alpha-value>)` needs. */
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')
const vars = (theme: Record<string, string>) =>
  Object.fromEntries(Object.entries(theme).map(([k, v]) => [`--c-${k}`, rgb(v)]))
/** The themed colours (src/theme/colors.ts THEMES): a CSS variable each, so `bg-ink/55` still works. */
const themed = Object.fromEntries(
  Object.keys(THEMES.light).map((k) => [k, `rgb(var(--c-${k}) / <alpha-value>)`]),
)
const c = (k: keyof typeof THEMES.light) => `rgb(var(--c-${k}))`
const SILHOUETTE = { light: 'brightness(0) opacity(0.75)', dark: 'brightness(0) invert(1) opacity(0.3)' }

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // `dark:` for the rare one-off that needs its own dusk value; the tokens already follow the theme.
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ...themed,
        gold: PALETTE.gold,
        accent: PALETTE.accent,
        night: PALETTE.night,
        crimson: PALETTE.crimson,
        forest: PALETTE.forest,
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
        hard: `0 4px 0 0 ${PALETTE.night}66`,
        'hard-sm': `0 2px 0 0 ${PALETTE.night}66`,
        // A flat 2px outline drawn inside the box (chips, cards, inputs): no layout shift.
        ring: `inset 0 0 0 2px ${c('edge')}`,
        'ring-thin': `inset 0 0 0 1px ${c('edge')}`,
        'ring-line': `inset 0 0 0 2px ${c('shadow')}`,
        'ring-line-thin': `inset 0 0 0 1px ${c('shadow')}`,
        // A card: the outline and its bottom lip.
        card: `inset 0 0 0 2px ${c('edge')}, inset 0 -4px 0 ${c('lip')}`,
        // The gold-ringed card: selected, the lead, the one to look at.
        'card-gold': `inset 0 0 0 2px ${c('edge')}, inset 0 0 0 4px ${PALETTE.gold}`,
        'card-gold-lip': `inset 0 0 0 2px ${c('edge')}, inset 0 0 0 4px ${PALETTE.gold}, inset 0 -6px 0 ${c('gold-light')}`,
        // A card on a gold tint: the outline and a gold lip.
        'card-warm': `inset 0 0 0 2px ${c('edge')}, inset 0 -4px 0 ${c('gold-light')}`,
        // An input: the outline and a lip along the top.
        field: `inset 0 0 0 2px ${c('edge')}, inset 0 3px 0 ${c('lip')}`,
        // A 2px outline outside the box, and a 2px ledge under it.
        halo: `0 0 0 2px ${c('edge')}`,
        ledge: `0 2px 0 ${c('edge')}`,
      },
      screens: {
        xs: '360px',
      },
    },
  },
  plugins: [
    // The theme's variables: light on :root, dark under [data-theme=dark] (src/theme/theme.ts sets it). A bright fill
    // (gold, the HP colours, `.light-scope`) brings the light values back for what is drawn on it, so its text stays
    // navy in both themes. :where() keeps all of it at zero specificity: any text-* utility still wins.
    plugin(({ addBase }) =>
      addBase({
        // An uncaught Pokémon: a dark shape on a light card, a pale one on a dark card.
        ':root': { ...vars(THEMES.light), '--silhouette': SILHOUETTE.light, 'color-scheme': 'light' },
        ':root[data-theme="dark"]': {
          ...vars(THEMES.dark),
          '--silhouette': SILHOUETTE.dark,
          'color-scheme': 'dark',
        },
        ':where([data-theme="dark"]) :where(.light-scope, .bg-gold, .bg-hp-green, .bg-hp-yellow)': {
          ...vars(THEMES.light),
          '--silhouette': SILHOUETTE.light,
          color: `rgb(var(--c-ink))`,
        },
      }),
    ),
  ],
} satisfies Config
