// Korean particles change with the word before them: 피카츄가 but 이상해씨가, 꼬부기를 but 파이리를… A template can't know
// which name it will get, so the sheet writes both forms — `{name}이(가)` — and this picks one once the name is in.

/** Pairs written `with-batchim(without)`: 이(가), 을(를), 은(는), 과(와), 아(야), 으로(로). */
const PAIRS: Record<string, [string, string]> = {
  '이(가)': ['이', '가'],
  '을(를)': ['을', '를'],
  '은(는)': ['은', '는'],
  '과(와)': ['과', '와'],
  '아(야)': ['아', '야'],
  '으로(로)': ['으로', '로'],
}

/** Final consonant of the last syllable: 0 none, 8 is ㄹ. Digits read as Sino-Korean numbers. Null when unknown. */
function batchim(c: string): number | null {
  const code = c.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28
  // 0 영, 1 일, 2 이, 3 삼, 4 사, 5 오, 6 육, 7 칠, 8 팔, 9 구
  const digit = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0][code - 48]
  return digit ?? null
}

/** Resolves every `X(Y)` particle pair after a Hangul syllable or a digit; anything else keeps both forms. */
export function josa(text: string): string {
  return text.replace(/([^\s(])(이\(가\)|을\(를\)|은\(는\)|과\(와\)|아\(야\)|으로\(로\))/g, (all, prev: string, pair: string) => {
    const b = batchim(prev)
    if (b == null) return all
    const [withB, without] = PAIRS[pair]!
    const useWith = pair === '으로(로)' ? b !== 0 && b !== 8 : b !== 0
    return prev + (useWith ? withB : without)
  })
}
