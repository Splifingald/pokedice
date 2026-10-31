// The legendary cinematics (docs/53): each legend's own entrance, by its dex. The raid intro plays a raid legend's
// (its words timed on its reveal); the battle plays a boss's (the name card and the send-out on its cues).
import type { BossCinema } from './boss'
import type { Cinema } from './kit'
import { articunoCinema } from './articuno'
import { moltresCinema } from './moltres'
import { celebiCinema } from './celebi'
import { enteiCinema } from './entei'
import { gyaradosCinema } from './gyarados'
import { hoohCinema } from './hooh'
import { lugiaCinema } from './lugia'
import { mewCinema } from './mew'
import { mewtwoCinema } from './mewtwo'
import { raikouCinema } from './raikou'
import { suicuneCinema } from './suicune'
import { zapdosCinema } from './zapdos'
import { arceusCinema, arceusRaidCinema } from './arceus'
import { darkraiCinema } from './darkrai'
import { manaphyCinema } from './manaphy'
import { phioneCinema } from './phione'
import { shayminCinema } from './shaymin'
import { victiniCinema } from './victini'
import { diancieCinema } from './diancie'
import { hoopaCinema } from './hoopa'
import { magearnaCinema } from './magearna'
import { marshadowCinema } from './marshadow'
import { meltanCinema } from './meltan'
import { volcanionCinema } from './volcanion'
import { xerneasCinema } from './xerneas'
import { yveltalCinema } from './yveltal'
import { zeraoraCinema } from './zeraora'
import { zygardeCinema } from './zygarde'
import { azelfCinema, mespritCinema, uxieCinema } from './lakes'
import { cresseliaCinema } from './cresselia'
import { dialgaCinema, palkiaCinema } from './spearPillar'
import { giratinaCinema } from './giratina'
import { heatranCinema } from './heatran'
import { regigigasCinema } from './regigigas'
import { cosmogCinema } from './cosmog'
import { lunalaCinema } from './lunala'
import { necrozmaCinema } from './necrozma'
import { solgaleoCinema } from './solgaleo'
import { tapuBuluCinema, tapuFiniCinema, tapuKokoCinema, tapuLeleCinema } from './tapu'
import { ultraBeastCinema } from './ultraBeast'
import { zacianCinema, zamazentaCinema } from './heroes'
import { eternatusCinema } from './eternatus'
import { kubfuCinema } from './kubfu'
import { regidragoCinema, regielekiCinema } from './splitruins'
import { calyrexCinema, glastrierCinema, spectrierCinema } from './crowntundra'
import { enamorusCinema } from './enamorus'
import { articunoGalarCinema, moltresGalarCinema, zapdosGalarCinema } from './galarbirds'
import { zarudeCinema } from './zarude'
import { regiceCinema, regirockCinema, registeelCinema } from './regis'
import { latiasCinema, latiosCinema } from './eon'
import { kyogreCinema } from './kyogre'
import { groudonCinema } from './groudon'
import { rayquazaCinema } from './rayquaza'
import { jirachiCinema } from './jirachi'
import { deoxysCinema } from './deoxys'
import { chienpaoCinema, chiyuCinema, tingluCinema, wochienCinema } from './ruin'
import { koraidonCinema } from './koraidon'
import { miraidonCinema } from './miraidon'
import { fezandipitiCinema, munkidoriCinema, okidogiCinema } from './loyal'
import { ogerponCinema } from './ogerpon'
import { terapagosCinema } from './terapagos'
import { ancientParadoxCinema, futureParadoxCinema } from './paradox'
import { pecharuntCinema } from './pecharunt'
import { cobalionCinema, terrakionCinema, virizionCinema } from './swords'
import { landorusCinema, thundurusCinema, tornadusCinema } from './forces'
import { reshiramCinema, zekromCinema } from './dragonspiral'
import { kyuremCinema } from './kyurem'
import { keldeoCinema } from './keldeo'
import { meloettaCinema } from './meloetta'
import { genesectCinema } from './genesect'

export { wordsAt } from './kit'
export type { Cinema, CinemaParams } from './kit'

/** The raids' cinematics: Kanto's legends first (the user's call, 2026-10-31: the rest once these are approved). */
export const RAID_CINEMAS: Readonly<Record<number, Cinema>> = {
  // The red Gyarados of the Lake of Rage (the user's call: with the legends).
  130: gyaradosCinema,
  144: articunoCinema,
  145: zapdosCinema,
  146: moltresCinema,
  150: mewtwoCinema,
  249: lugiaCinema,
  250: hoohCinema,
  377: regirockCinema,
  378: regiceCinema,
  379: registeelCinema,
  380: latiasCinema,
  381: latiosCinema,
  382: kyogreCinema,
  383: groudonCinema,
  384: rayquazaCinema,
  480: uxieCinema,
  481: mespritCinema,
  482: azelfCinema,
  483: dialgaCinema,
  484: palkiaCinema,
  485: heatranCinema,
  486: regigigasCinema,
  487: giratinaCinema,
  488: cresseliaCinema,
  // Arceus's daily raid (its boss fight has its own, below).
  493: arceusRaidCinema,
  638: cobalionCinema,
  639: terrakionCinema,
  640: virizionCinema,
  641: tornadusCinema,
  642: thundurusCinema,
  643: reshiramCinema,
  644: zekromCinema,
  645: landorusCinema,
  646: kyuremCinema,
  716: xerneasCinema,
  717: yveltalCinema,
  718: zygardeCinema,
  785: tapuKokoCinema,
  786: tapuLeleCinema,
  787: tapuBuluCinema,
  788: tapuFiniCinema,
  789: cosmogCinema,
  791: solgaleoCinema,
  792: lunalaCinema,
  800: necrozmaCinema,
  888: zacianCinema,
  889: zamazentaCinema,
  890: eternatusCinema,
  891: kubfuCinema,
  894: regielekiCinema,
  895: regidragoCinema,
  896: glastrierCinema,
  897: spectrierCinema,
  898: calyrexCinema,
  905: enamorusCinema,
  1001: wochienCinema,
  1002: chienpaoCinema,
  1003: tingluCinema,
  1004: chiyuCinema,
  1007: koraidonCinema,
  1008: miraidonCinema,
  1014: okidogiCinema,
  1015: munkidoriCinema,
  1016: fezandipitiCinema,
  1017: ogerponCinema,
  1024: terapagosCinema,
  // The Paradox Pokémon share a rift: into the past, or into the future (the user's call, as the Ultra Beasts).
  ...Object.fromEntries([1009, 1020, 1021].map((d) => [d, ancientParadoxCinema])),
  ...Object.fromEntries([1010, 1022, 1023].map((d) => [d, futureParadoxCinema])),
  // The Galarian birds, by their forms' dex (as legendRaidScenes.ts keys them).
  10169: articunoGalarCinema,
  10170: zapdosGalarCinema,
  10171: moltresGalarCinema,
  // The Ultra Beasts share one Ultra Wormhole (the user's call: not legendaries, one opening for all).
  ...Object.fromEntries(
    [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806].map((d) => [d, ultraBeastCinema]),
  ),
}

/** The bosses' cinematics, on the battle stage with the name card and the send-out: Mew first. */
export const BOSS_CINEMAS: Readonly<Record<number, BossCinema>> = {
  151: mewCinema,
  243: raikouCinema,
  244: enteiCinema,
  245: suicuneCinema,
  251: celebiCinema,
  385: jirachiCinema,
  386: deoxysCinema,
  489: phioneCinema,
  490: manaphyCinema,
  491: darkraiCinema,
  492: shayminCinema,
  493: arceusCinema,
  494: victiniCinema,
  647: keldeoCinema,
  648: meloettaCinema,
  649: genesectCinema,
  719: diancieCinema,
  720: hoopaCinema,
  721: volcanionCinema,
  801: magearnaCinema,
  802: marshadowCinema,
  807: zeraoraCinema,
  808: meltanCinema,
  893: zarudeCinema,
  1025: pecharuntCinema,
}
