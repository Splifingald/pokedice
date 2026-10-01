# Pokédice — Simplified Chinese, Japanese & Korean Plan

> **Status: built** (`ja`, `ko`, `zh-Hans`). Where this document and the code disagree, the code is right. What
> changed in the building:
>
> - **The font comes from npm, not GitHub.** GitHub is not reachable from the build sandbox; fontsource publishes the
>   full Fusion Pixel 12px builds (`@fontsource/fusion-pixel-12px-proportional-{jp,kr,sc}`, dev dependencies).
>   `pnpm i18n:fonts` (`scripts/i18n-fonts.ts`, with `subset-font`) cuts one file per language. §2.2 and §2.3 became
>   **one** file per language, not two: the sheet's characters plus the language's standard set (JIS X 0208 /
>   KS X 1001 / GB 2312), every kana and every KS X 1001 Hangul — 234 / 179 / 218 KB, covering players' names too.
>   `src/i18n/cjk-chars.json` records the sheet's characters at build time; the i18n test fails when the sheet uses one
>   the committed font lacks.
> - **One known gap:** Fusion Pixel has no `鳅` (Barboach's Chinese name, 泥泥鳅). That glyph falls back to a system font.
> - **No size floor or line-height change was needed.** The smallest size in the app is `text-xs` (12 px), Fusion's
>   native size. The CJK face is drawn at the same font size as Jersey (no `size-adjust`): ideographs stand ~1.5× a
>   Jersey capital, which reads well at every size checked.
> - **A font stack resolves once, where it is declared.** `--font-cjk` is set by `:lang()`, but an element with its own
>   `lang` inside a page of another language inherits the page's resolved stack. The Settings language buttons
>   re-declare `font-pixel` so 日本語 / 한국어 / 简体中文 each draw in their own face (the layout test checks it).
> - **Korean particles are resolved in code** (`src/i18n/ko.ts`): templates write `{name}이(가)`, and `tIn` picks 이 or 가
>   from the name it received. Particles after Latin letters keep both forms.
> - **Trainer names were wider than §3.2 assumed.** 442 Sinnoh/Unova trainers didn't split into class + name, so they
>   stayed in English in every language. 26 classes were added (Galactic Grunt, Veteran, Worker…), `Lance II`-style
>   rematches now read the `Lance` row, and the 53 leaders/Elite Four/champions/villains got name rows.
> - **Region names are translated** (`region.*` rows, localized in `localizeGameData`): カントー, 관동, 关都…
> - **Translation status:** every cell is filled, without native review yet. Least certain: Korean and Chinese place
>   names for Hoenn, Sinnoh and especially Unova (several are best guesses), and a few Sinnoh Battle Frontier / minor
>   character names (Thorton, Argenta, Darach, Palmer, Buck, Marley).
>
> The rest of this document is the plan as written.

Target codes: **`zh-Hans`**, **`ja`**, **`ko`** (BCP 47, like `pt-BR`), labelled `简体中文`, `日本語`, `한국어`.

---

## 0. What was found before planning

| Finding | Consequence |
| --- | --- |
| The only fonts are Jersey 15/25, subset to `latin` and `latin-ext`. Tailwind's `fontFamily` lists name nothing else. | Every CJK character falls through to whatever system font the browser picks — mixed styles, mixed metrics, blurry next to the pixel art. **A pixel CJK font is the main task.** |
| Players' names and the leaderboard already show other players' names in Jersey. | A CJK name typed today (in any language) already falls back to a system font. The font work fixes that too. |
| `e2e/layout.spec.ts` checks "every text is Jersey" through `getComputedStyle().fontFamily`. | It would pass while CJK glyphs silently fall back (the computed family still says Jersey). The test has to check the real face (§2.4). |
| PokeAPI has official `ja` / `ja-hrkt`, `ko` and `zh-hans` names for all 649 species and all 49 items. | `pnpm i18n:names` fills ~700 rows per language once the codes are mapped (§3.1). Names are free. |
| PokeAPI has no area, badge or trainer-class names. | Those ~240 rows are written by hand from the official names (Bulbapedia lists them per language). |
| Trainer names are "kept as they are" (Brock stays Brock in fr/es/de/it/pt). | Wrong in CJK: every gym leader has an official local name (タケシ / 웅 / 小刚). The rows exist already; the rule changes, not the code. |
| `detectLang()` matches the full tag, then the part before the first `-`. | `zh-CN` → `zh` → nothing. Chinese needs an alias table (§1.2). |
| `tPlural` picks `.one`/`.other` on `count === 1`. | CJK has no plural: both cells get the same text. No code change. |
| Every sentence is a template with `{placeholders}`, so word order is free. | Most of the UI translates cleanly — except where the code joins fragments itself (§4). |
| `toLocaleString(getLang())` formats ₽ and numbers. | Works with `ja`, `ko`, `zh-Hans` as is. |
| `e2e/layout.spec.ts` now runs every screen at 360×640 in every language of `LANGS`. | Adding the codes adds the layout check for free. |

---

## 1. Plumbing (small)

### 1.1 Language list

`src/i18n/langs.ts`: add `'zh-Hans', 'ja', 'ko'` to `LANGS` and their labels. Three columns in `strings.csv`. The zod
save schema, the Settings panel and the CSV reader all follow `LANGS` already.

### 1.2 Browser detection

Chinese tags don't share a prefix with the sheet code. Add an alias step to `detectLang()` before the base-language
fallback:

| Browser tag | Picks |
| --- | --- |
| `zh`, `zh-CN`, `zh-SG`, `zh-Hans`, `zh-Hans-*` | `zh-Hans` |
| `zh-TW`, `zh-HK`, `zh-MO`, `zh-Hant*` | **English** until `zh-Hant` ships (see §6) — Simplified is readable there but not what those players expect. |
| `ja-JP` / `ko-KR` | `ja` / `ko` (base match already works) |

Test it in `tests/i18n.test.ts` next to the `pt-BR` cases.

### 1.3 `<html lang>`

Already set from the store. It matters more now: it is what lets CSS pick the right font variant (§2.2) and the right
line breaking (§4.3), and what makes screen readers switch voice.

---

## 2. The font (the real work)

### 2.1 Which font

| Candidate | Licence | Covers | Notes |
| --- | --- | --- | --- |
| **Fusion Pixel Font** (12 px) | OFL 1.1 | SC, TC, JP, KR — one build per locale | **Recommended.** Built on Ark Pixel + Galmuri + others; ships `zh_hans`, `ja`, `ko` variants with the right glyph shapes for each (Han unification: 直, 骨, 写… differ between Chinese and Japanese). |
| Ark Pixel (12 px) | OFL 1.1 | SC/TC/JP/KR, but incomplete Hanzi | Fusion is its superset. |
| Galmuri (11/9 px) | OFL 1.1 | Korean complete, kana, partial Hanzi | Good Korean-only choice if Fusion's Hangul looks off. |
| DotGothic16 (Google Fonts) | OFL 1.1 | Japanese (JIS), partial SC | Easy to load, but not really pixel-sized and weak on Chinese. |
| Zpix | free for **non-commercial** use | SC/TC/JP | Licence is a risk if the project ever changes; avoid. |

Pick Fusion Pixel 12 px, and do a side-by-side against Jersey 25 at the game's real sizes before committing (the
x-heights and stroke weights have to sit together on one line: "Lv.5 ピカチュウ").

### 2.2 Loading it without costing anyone else

- **Subset to the sheet.** `strings.csv` is the only source of on-screen text (plus player names, §2.3). A script —
  `pnpm i18n:fonts`, next to `i18n:names` — collects the unique characters of each CJK column and writes one woff2 per
  locale into `public/fonts/` (`pyftsubset` from fonttools, or `subset-font` on npm). Expect ~2,000–2,500 Hanzi for
  Chinese, fewer for Japanese (much of it kana), ~1,000 syllables for Korean → roughly **150–350 KB per locale**,
  versus several MB for the full font.
- **One `@font-face` per locale, all under one family name** (`'Pokedice CJK'`), each with a `unicode-range` limited
  to CJK blocks (U+3000–30FF, U+3400–9FFF, U+AC00–D7AF, U+FF00–FFEF…). The browser downloads a file only when a
  glyph in that range is on screen, so English/French/… players never fetch it.
- Pick the variant with `:lang()`: `:lang(ja) { --cjk: 'Pokedice CJK JA' }`, etc., and append `var(--cjk)` to every
  Tailwind `fontFamily` list **after** Jersey. Latin letters, digits, ₽ and "Lv." keep drawing in Jersey; only the
  CJK glyphs fall through to the pixel CJK face.
- A test (vitest) re-reads the sheet and fails if any character of a CJK column is missing from the committed subset
  (keep a `*.chars.txt` next to each font, written by the script, rather than parsing the font in the test). Editing
  the sheet without re-running `pnpm i18n:fonts` then fails CI instead of showing tofu.

### 2.3 Player names

Names typed by players (own name, leaderboard, Versus) are not in the sheet. Two options:

1. Also subset the **2,500 most common Hanzi + all kana + all 2,350 KS X 1001 Hangul** into a separate "names"
   file, loaded under the same family with a lower priority. Covers almost every real name for ~400 KB extra,
   downloaded only when such a name appears.
2. Leave rare characters to the system font. Acceptable for names only.

Recommend (1); it also fixes CJK names for players using the game in English today.

### 2.4 Sizes and the layout test

- A 12 px pixel font is only crisp at 12, 24, 36 px. Jersey is used at many sizes (`text-lg`, `text-2xl`, `text-sm`,
  tiny Jersey 15 captions). Under `:lang(zh-Hans|ja|ko)`, map the sizes to the nearest multiple of 12 and set a
  **12 px floor** (dense Hanzi below 12 px are unreadable); audit the ~27 `text-xs`/tiny-caption sites.
- Line height: CJK wants ~1.4–1.6; Jersey lines are tighter. Raise `leading` under `:lang()` for body copy (`.copy`).
- `e2e/layout.spec.ts`: replace the computed-`fontFamily` check with one that looks at the **rendered** face for CJK
  text (e.g. `document.fonts.check('12px "Pokedice CJK"', text)` plus a check that the CJK font file was requested),
  so fallback to a system font is caught.

---

## 3. Names (mostly automatic)

### 3.1 `pnpm i18n:names`

The script already matches PokeAPI codes case-insensitively (`zh-hans` → `zh-Hans`). Add a small source map for
Japanese:

| Sheet | PokeAPI | Why |
| --- | --- | --- |
| `zh-Hans` | `zh-hans` | direct |
| `ko` | `ko` | direct |
| `ja` | `ja`, then `ja-hrkt` | `ja` is the kanji-mode text, `ja-hrkt` the kana-only mode; they are often identical (Potion is `キズぐすり` in both) but `ja` is what the modern games show when they differ. Species are katakana in both. |

Check the output for items PokeAPI names with generation-specific spellings (e.g. old abbreviations like the Italian
"Revitalizz. Max").

### 3.2 Hand-written content rows (~240 per language)

Areas (149), badges (40), trainer classes (53), trainer names (38). Official names exist for all of Kanto, Johto,
Hoenn and Sinnoh in all three languages. For **Unova in Simplified Chinese**, some names only exist from the later
unified Chinese localisation and the official website — have a native reviewer confirm them.

**Trainer names change rule for CJK:** translate them (タケシ, カスミ… / 웅, 이슬… / 小刚, 小霞…), including
`Tate & Liza` → フウとラン / 풍과 란 / 小枫与小南. Update the sheet comment (`kept as they are` → "kept in Latin
languages, official names in CJK").

Generic trainers are `<class> <given name>` joined with a space by `localizeTrainerName()`. Japanese and Korean games
write exactly that (`たんパンこぞう ケンタ`), Chinese too (`短裤小子 健太`), so the join can stay. The invented given
names (Kent, Rick…) stay in Latin for v1; localising them would need a name row per trainer.

---

## 4. Code that assumes a Latin script

### 4.1 Fragments the code joins itself

| Where | What | CJK fix |
| --- | --- | --- |
| `BattleHistory.tsx` | Row = Pokémon name + separate fragment (`sentOut`, `fainted`, `attacked {target}`…) | Works as a two-column log. Translate fragments as short predicates (`が倒れた`, `쓰러졌다`, `倒下了`), no code change. |
| `BattleHistory.tsx:189,195`, `text.ts:16`, `Area.tsx:130`, `CasinoView.tsx:144`, `DiceSet.tsx:17` | `.join(', ')` | Add a `ui.common.listSep` row (`, ` / `、` / `、` / `, `) — or use `Intl.ListFormat(getLang())`, which already knows `、` and `和`. |
| `CatchView.tsx:217` | `{who} {name}` with `who` = "The wild" / "The legendary" | Fine: `野生の{name}` needs `theWild` = `野生の` and the template `{who}{name}` without a space — templates own the space, so it's just data. |
| `VictoryView.tsx:77` | `{shiny}{name}` with `shinyPrefix` | Data only (`色違いの`). |

Rule for translators: **spaces around placeholders are part of the template** — CJK templates usually have none.

### 4.2 Search

`Team.tsx`, `Pokedex.tsx`, `SearchSelect.tsx` match with `toLowerCase().includes()`. For Japanese, fold
hiragana → katakana on both sides (species are katakana; players type hiragana), and full-width → half-width digits
for `#025`. Korean and Chinese need nothing more.

### 4.3 Line breaking

- Korean breaks between words, not syllables: `:lang(ko) { word-break: keep-all; }`.
- Chinese/Japanese break anywhere by default, which is right; add `line-break: strict` so a line never starts with
  `。`, `、`, `ー` or a small kana.
- The `truncate` names (`Char…` in the team strip) show 4–5 CJK characters — enough for most names; check at 360 px.

### 4.4 Input (IME)

`SearchSelect.tsx` handles `onKeyDown`: ignore Enter while `e.nativeEvent.isComposing`, otherwise confirming a kana →
kanji conversion selects a result. Same check for the new-game name field if it ever submits on Enter. `maxLength={12}`
is fine (the games allow 5–6 CJK characters).

### 4.5 Terminology glossary (before any UI translation)

Fix the official terms first so ~1,000 UI rows stay consistent:

| English | 日本語 | 한국어 | 简体中文 |
| --- | --- | --- | --- |
| Pokémon | ポケモン | 포켓몬 | 宝可梦 |
| Pokédex | ポケモン図鑑 | 포켓몬 도감 | 宝可梦图鉴 |
| Poké Ball | モンスターボール | 몬스터볼 | 精灵球 |
| Pokémon Center | ポケモンセンター | 포켓몬센터 | 宝可梦中心 |
| Poké Mart | フレンドリィショップ | 프렌들리숍 | 友好商店 |
| Day Care | 育て屋 | 키우미집 | 培育屋 |
| Gym Leader | ジムリーダー | 체육관 관장 | 道馆馆主 |
| Elite Four | 四天王 | 사천왕 | 四天王 |
| Champion | チャンピオン | 챔피언 | 冠军 |
| HP / Lv. | HP / Lv. | HP / Lv. | HP / Lv. |
| Types | ノーマル, ほのお, みず… | 노말, 불꽃, 물… | 一般, 火, 水… |

Game-specific words (die, reroll, round, combo names, Upgrades) have no official term: decide them once, in the
glossary, with a native speaker. Keep **₽** as the currency sign (it is in the templates, so a translator could
change it, but one symbol across languages keeps screenshots and the leaderboard consistent).

---

## 5. Translation

~1,315 hand rows per language (UI 1,024 + content ~290), names automatic. Suggested flow per language:

1. Glossary (§4.5) agreed with a native speaker.
2. Machine draft of the UI rows, constrained by the glossary, placeholders and edge spaces checked by script (the same
   check used for `it`/`pt`/`pt-BR`: identical `{vars}` set, identical leading/trailing spaces).
3. Native review **in the running game** at 360 px — tone (Japanese: plain/polite form as in the games; Korean: 해요체;
   Chinese: concise, game-style), truncation, line breaks.

---

## 6. Order of work and estimates

| # | Step | Size | Acceptance |
| --- | --- | --- | --- |
| 1 | Font pipeline (§2): pick, subset script, `@font-face` + `:lang()`, size floor, char-coverage test, real-face layout check | 2–3 days | A CJK string renders in the pixel face at every size; English pages download no CJK font. |
| 2 | Plumbing (§1) + names script map (§3.1) + list separator / search folding / IME / line breaking (§4) | 1 day | `pnpm test` + `e2e/layout.spec.ts` green with the three columns filled with placeholders. |
| 3 | `zh-Hans` content + UI | 2–3 days + review | No empty cell; native review signed off. |
| 4 | `ja` content + UI | 2–3 days + review | Same. |
| 5 | `ko` content + UI | 2–3 days + review | Same. |
| 6 | (optional) `zh-Hant` | ~1 day | PokeAPI has `zh-hant` names; most UI rows convert from `zh-Hans` with OpenCC, then review for Taiwan/Hong Kong terms. Then route `zh-TW`/`zh-HK` to it (§1.2). |

Steps 1–2 are shared and must land first; the three languages can then ship independently, each as soon as its
column is full (the "no empty cell" test stops a half-translated column from shipping).
