// The region flavours' content (docs/62): Hoenn's and Galar's areas with weather, and Alola's island trials. The
// game's own, like the rivals' meetings (docs/61): the database holds the switches, and an admin's row can override
// any of it (game_config is deep-merged over these).
import type { AreaWeather, PokeType, TrialDef } from './types'

/** Hoenn's fixed weather (docs/62 §3), by area id. */
export const HOENN_WEATHER: Record<string, AreaWeather> = {
  // Routes 118 & 119: Route 119's rain, where the Weather Institute stands.
  '57a87398-8ee0-5924-b794-bb1ca29ed358': { fixed: 'rain' },
  // Fortree City & Routes 120–121: Route 120's rain.
  'e34791dd-2b08-51ef-9c9f-be18cea0524b': { fixed: 'rain' },
  // Route 111 Desert & Mirage Tower: the desert's sandstorm.
  '8ced3bb7-e9ea-59b5-9515-aed7d2ced0d7': { fixed: 'sand' },
  // Routes 113–115 & Meteor Falls: Route 113's falling ash.
  'aa7c054d-8c55-5640-b3d5-2731ca24a00c': { fixed: 'ash' },
  // Mt. Pyre & Routes 122–123: the summit's fog.
  '88858f3b-8429-567d-90ea-fd319448d274': { fixed: 'fog' },
  // Sootopolis City & the Cave of Origin: Groudon's sun and Kyogre's rain, a round each.
  '8e822a9a-e17c-56d4-9413-f55f279f136b': { alternate: ['sun', 'rain'] },
}

/** Galar's weather of the day (docs/62 §4), by area id: the Wild Area's odds, and Circhester's snow. */
export const GALAR_WEATHER: Record<string, AreaWeather> = {
  // The Wild Area: Rolling Fields & Dappled Grove.
  '98ab6c0a-a752-5157-8ce5-94208fcbbfdf': { daily: { clear: 35, overcast: 20, rain: 15, thunderstorm: 10, sun: 15, fog: 5 } },
  // Motostoke Outskirts & the Wild Area South (the Dusty Bowl's sand).
  'e7f76d12-ae38-5958-a173-c17897d81a5e': { daily: { clear: 25, overcast: 10, rain: 15, thunderstorm: 10, sun: 15, sand: 25 } },
  // Hammerlocke Hills & the Lake of Outrage.
  'c65845c5-b723-5a1b-922e-8aa6930e6aeb': {
    daily: { clear: 25, overcast: 10, rain: 15, thunderstorm: 10, sun: 10, snow: 15, fog: 15 },
  },
  // The Isle of Armor.
  '890cb77d-0fe5-5576-9b92-2ab68f0be295': { daily: { clear: 35, overcast: 5, rain: 15, thunderstorm: 10, sun: 20, sand: 10, fog: 5 } },
  // The Crown Tundra.
  '0c17194f-f7be-5221-91d0-68fcee8da9d9': { daily: { clear: 20, overcast: 15, sun: 10, snow: 40, fog: 15 } },
  // Steamdrift Way & Circhester: always snowing.
  '74411831-f7a6-5a6f-9252-63b5e0f1874e': { fixed: 'snow' },
}

/**
 * Alola's island trials (docs/62 §6): each captain's Totem, at its captain's ace's level, and the allies it calls; Vast
 * Poni Canyon's Kommo-o is a trial of its own, before Hapu's grand trial. Mina's stays a battle, as in the games. Each
 * gives its type's Z-Crystal (`crystal`), as the kahunas' grand trials do (`KAHUNA_CRYSTALS`): eighteen, one per type.
 */
export const TRIALS: TrialDef[] = [
  {
    id: 'trial-verdant-cavern',
    crystal: 'normal',
    areaId: 'd7bfc7c0-ab59-5608-88c7-5d395cdbe217',
    trainerId: '4f91ae65-c2ed-5625-8493-cc888560e844',
    captain: 'Ilima',
    place: 'the Verdant Cavern',
    totem: 735,
    level: 12,
    allies: [734, 734],
    allyLevel: 10,
  },
  {
    id: 'trial-brooklet-hill',
    crystal: 'water',
    areaId: 'ab9ebe55-a162-52ce-b648-cc84608f7f77',
    trainerId: '2d323fd2-b283-56cf-99fb-d525a90ba2ec',
    captain: 'Lana',
    place: 'Brooklet Hill',
    totem: 10127,
    level: 20,
    allies: [594, 594],
    allyLevel: 18,
  },
  {
    id: 'trial-wela-volcano',
    crystal: 'fire',
    areaId: '38846271-6caa-52ab-b474-600c585b98f2',
    trainerId: 'd8a8325d-a9dd-5865-b389-ded18cb9dcb9',
    captain: 'Kiawe',
    place: 'Wela Volcano Park',
    totem: 758,
    level: 22,
    allies: [757, 757],
    allyLevel: 20,
  },
  {
    id: 'trial-lush-jungle',
    crystal: 'grass',
    areaId: '5e9ea6d6-2b62-56a5-a737-d841a48684f6',
    trainerId: '4d870364-1d61-5516-a2f7-717f067720bf',
    captain: 'Mallow',
    place: 'the Lush Jungle',
    totem: 754,
    level: 24,
    allies: [753, 753],
    allyLevel: 22,
  },
  {
    id: 'trial-hokulani',
    crystal: 'electric',
    areaId: '5fb9f3eb-bdbe-5c45-8345-3f4a20d75f1d',
    trainerId: '018f1a21-bb29-56a5-a929-6228bbad679b',
    captain: 'Sophocles',
    place: 'the Hokulani Observatory',
    totem: 738,
    level: 29,
    allies: [737, 737],
    allyLevel: 27,
  },
  {
    id: 'trial-thrifty-megamart',
    crystal: 'ghost',
    areaId: '8b0339d9-7358-5cff-a342-49b1ae6dda36',
    trainerId: '1a82b30c-6585-5df3-bbd7-4aea039a82f4',
    captain: 'Acerola',
    place: 'the abandoned Thrifty Megamart',
    totem: 778,
    level: 33,
    allies: [93, 93],
    allyLevel: 31,
  },
  {
    id: 'trial-vast-poni-canyon',
    crystal: 'dragon',
    areaId: 'e7ae24d0-80a4-51d7-a9cb-c0df82d25286',
    // A gym row of its own, before Hapu's grand trial; she shows the way (migration 0117).
    trainerId: '7278511c-319e-5fc1-a053-0be766cb70fd',
    own: true,
    captain: 'Hapu',
    place: 'Vast Poni Canyon',
    totem: 784,
    level: 45,
    allies: [783, 783],
    allyLevel: 43,
  },
  // One trial per type (the user's call, 2026-11-01): the six types Alola's trials and grand trials don't give, each a
  // Totem of its area's in a gym row there only for it, greeted by someone of that type.
  {
    id: 'trial-heahea',
    crystal: 'flying',
    areaId: '87cba513-0bc5-55df-a781-9de73048528c',
    trainerId: '8cebb4a0-7553-5d00-904d-0461d1389075',
    own: true,
    captain: 'Kahili',
    place: 'the Heahea skies',
    totem: 733,
    level: 18,
    allies: [732, 732],
    allyLevel: 16,
  },
  {
    id: 'trial-hano-beach',
    crystal: 'poison',
    areaId: '0e1ccc24-1c60-56e1-9f03-4b3deda34951',
    trainerId: '23c7789e-eb83-55e8-96bb-9bb2097fe93d',
    own: true,
    captain: 'Plumeria',
    place: 'Hano Beach',
    totem: 748,
    level: 27,
    allies: [747, 747],
    allyLevel: 25,
  },
  {
    id: 'trial-malie-garden',
    crystal: 'bug',
    areaId: '7d3ee2f7-3442-5738-b2c6-d3037e514fec',
    trainerId: '65e861d9-c327-56f8-aa34-bd8710000c3a',
    own: true,
    captain: 'Guzma',
    place: 'Malie Garden',
    totem: 752,
    level: 28,
    allies: [284, 284],
    allyLevel: 26,
  },
  {
    id: 'trial-blush-mountain',
    crystal: 'steel',
    areaId: 'd6ba26d1-3dd2-51fc-b559-74c01d2ddba2',
    trainerId: '9f29379a-7508-5443-8710-c533da46baa5',
    own: true,
    captain: 'Molayne',
    place: 'Blush Mountain',
    totem: 777,
    level: 31,
    allies: [702, 702],
    allyLevel: 29,
  },
  {
    id: 'trial-haina-desert',
    crystal: 'psychic',
    areaId: '3463beea-946a-5c99-89d1-19dc707896e8',
    trainerId: 'ce72ec00-480b-588e-9ffb-178257855a46',
    own: true,
    captain: 'Faba',
    place: 'the Haina Desert',
    totem: 779,
    level: 33,
    allies: [343, 343],
    allyLevel: 31,
  },
  {
    id: 'trial-mount-lanakila',
    crystal: 'ice',
    areaId: 'db4e5701-dfdf-54dd-bfee-002c1fdcc391',
    trainerId: 'a8411dd0-0c2b-5f0f-ac1a-0556001dc88d',
    own: true,
    captain: 'Lillie',
    place: 'Mount Lanakila',
    totem: 10104,
    level: 52,
    allies: [10103, 10103],
    allyLevel: 50,
  },
]

/** The kahunas' grand trials and Mina's trial, battles of their own (docs/62 §6): the Z-Crystal each gives, by trainer id. */
export const KAHUNA_CRYSTALS: Record<string, PokeType> = {
  // Hala, Olivia, Nanu, Hapu.
  '6f841802-a4ca-5e58-bc31-2c5037791a07': 'fighting',
  '8ccda063-9222-5190-a949-145815db7a6f': 'rock',
  '4f0e8ccf-2756-5de1-a7c0-7412cb29daf5': 'dark',
  'c6106307-fd9e-50e1-aa2c-8edd1069cb8f': 'ground',
  // Mina's trial stays a battle with her (as in the games): the Fairium Z.
  'd88dbaef-893e-522d-b404-bb5c106568cd': 'fairy',
}
