// Which build this page runs, and whether /version.json names another one. version.json holds the entry script's file
// name (vite.config.ts → buildVersion), so a rebuild of unchanged code is not a new build.

/** This page's entry script, as version.json writes it ('assets/index-<hash>.js'); null in dev, where there is none. */
export function pageBuild(doc: Pick<Document, 'querySelectorAll'> = document): string | null {
  for (const el of Array.from(doc.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'))) {
    const m = /\/(assets\/index-[^/?#]+\.js)(?:[?#]|$)/.exec(el.src || el.getAttribute('src') || '')
    if (m) return m[1]!
  }
  return null
}

/** A newer build is out: version.json names an entry, and it isn't the one this page loaded. */
export function isNewBuild(remote: string | undefined, current: string | null): boolean {
  return !!remote && !!current && remote !== current
}
