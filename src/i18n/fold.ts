/**
 * Folds text for a forgiving search: full-width letters and digits become plain ones (NFKC turns `＃０２５` into
 * `#025` and half-width katakana into full-width), case is dropped, and hiragana become katakana — Japanese species
 * names are katakana, but players type them in hiragana.
 */
export function searchFold(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .trim()
}
