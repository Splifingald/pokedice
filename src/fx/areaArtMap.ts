// Generated from the Visual Lab's background plan (assets/area-art.json, by orderIndex) and the measured pictures.
// Keyed by area id: areas can come from the remote config, so the picture never depends on bannerUrl or the database.
// A new area needs a line here, or it keeps its painted scene.
import type { ArtGeometry } from './areaArt'

/** Area id → its picture in public/area-art/. */
export const AREA_ART: Readonly<Record<string, string>> = {
  '3585c2a5-43bc-50c9-9818-e148404cabf8': 'meadow', // 1 Route 1 (Kanto)
  '9cd5143b-e280-5a1f-85d4-d7f9933616b1': 'flowers', // 2 Routes 22 & 2 (Kanto)
  '41f856c1-6df1-53e1-96b5-463362d595a6': 'forest', // 3 Viridian Forest (Kanto)
  '829a4b14-5248-5410-8b66-60d96d873160': 'hills', // 4 Route 3 (Kanto)
  '665e8d04-8cda-5960-9a8a-0e843c5a095e': 'cave', // 5 Mt. Moon (Kanto)
  'e378fb03-6702-51fd-89ba-18ffc912a300': 'lake', // 6 Route 4 & Nugget Bridge (Kanto)
  'bec52d1b-4c7c-5503-810a-5d4b8e5336ec': 'meadow', // 7 Routes 5 & 6 (Kanto)
  '1df761a4-cf28-58ca-88f5-17f794f27b79': 'cave', // 8 Diglett's Cave & Route 11 (Kanto)
  '1ef28784-b335-528e-afea-f89700680d7e': 'hills', // 9 Routes 9 & 10 (Kanto)
  'f319e2ef-f0d1-5f2d-a7cb-cf92aeb8bca7': 'deepcave', // 10 Rock Tunnel (Kanto)
  '8cf87ee3-f7a5-568e-bc22-54f643572535': 'evening', // 11 Routes 7 & 8 (Kanto)
  '1e08b1b8-cda6-5046-a40f-5041361f6736': 'haunted', // 12 Pokémon Tower (Kanto)
  'ff3f0086-1b99-559e-a646-e88006eec749': 'flowers', // 13 Routes 12–15 (Kanto)
  'e7d8c094-5b1f-51d5-b205-3951e8be98ab': 'evening', // 14 Cycling Road (Kanto)
  '2238f26a-2629-5f28-af07-e74cb41d5f7a': 'marsh', // 15 Safari Zone (Kanto)
  '0451cbfb-2955-5b42-a816-3e6affb72c35': 'modern', // 16 Silph Co. (Kanto)
  '6be7fc24-0db6-59e6-b9f0-81cbefc90ab4': 'sea', // 17 Sea Routes 19 & 20 (Kanto)
  '51bb91b2-9c10-508c-bd4d-0f9e39e3f30d': 'icecave', // 18 Seafoam Islands (Kanto)
  'cff05c73-329a-55d0-a476-ba7c5683e6ae': 'volcano', // 19 Pokémon Mansion (Kanto)
  '6d47ad48-bf44-5cb5-83fd-8db581b4a715': 'beach', // 20 Route 21 (Kanto)
  '6ce5603a-9b36-52df-b8bc-3e9efb0686c3': 'deepcave', // 21 Victory Road (Kanto)
  'bbe7e459-a138-5106-bd01-fce7ff422e7f': 'league', // 22 Indigo Plateau (Kanto)
  '35c40458-61da-5321-adda-6df33b930671': 'deepcave', // 23 Victory Road II (Kanto)
  '2737f8c1-713a-54d8-986e-30b92f7c4a8f': 'champion', // 24 Indigo Plateau II (Kanto)
  'bf32fe1a-051d-517b-83c3-55bd24b8e077': 'a25', // 25 Power Plant (Kanto)
  'a5d11263-453f-5181-9a73-2c30df79d3fc': 'a26', // 26 Cerulean Cave (Kanto)
  '050ff505-ff8e-5251-8499-842a2cfc2986': 'lair-island', // 27 Faraway Island (Kanto)
  'b64f2ae7-b9ae-5707-b904-f1e31aa66253': 'industrial', // 28 Rocket Hideout (Kanto)
  '522e114b-852b-543a-8d79-8cc34d598b13': 'meadow', // 29 Route 29 (Johto)
  'a0e6d0b2-4cfe-5607-9ed0-2b716d31b88c': 'forest', // 30 Routes 30 & 31 (Johto)
  '557feec9-d7ee-5e34-91fd-8eaa4e805e85': 'oldtown', // 31 Violet City & Sprout Tower (Johto)
  '1a6ff054-0850-54a9-8471-e828a46154b4': 'flowers', // 32 Route 32 (Johto)
  '49426aac-676d-55e9-94b7-e26f2162510b': 'cave', // 33 Union Cave (Johto)
  '6f00f916-60e4-5daa-9906-c2204de369a1': 'cave', // 34 Route 33 & Slowpoke Well (Johto)
  'a42af576-01f0-52af-affe-cddce559f5a2': 'village', // 35 Azalea Town (Johto)
  '5fba87f3-6e88-5d47-8f6c-549021a0c04e': 'oldforest', // 36 Ilex Forest (Johto)
  '30af3925-076e-5c88-a6c7-fba28a4ed035': 'meadow', // 37 Route 34 & the Day Care (Johto)
  '058038e0-b19e-5156-9e27-c57aa3b653fc': 'modern', // 38 Goldenrod City (Johto)
  '61bfb445-9bdc-5e47-9c3a-f379bd33a06b': 'flowers', // 39 Routes 35–37 (Johto)
  '3aa36df1-1d3e-533b-8f85-32ca0b970b16': 'flowers', // 40 National Park (Johto)
  '2d2bfbee-476c-56e7-b814-4d73b9c1425c': 'oldtown', // 41 Ecruteak City & the Burned Tower (Johto)
  '464335aa-aa23-5f1b-907f-62440757a77b': 'farm', // 42 Routes 38 & 39 (Johto)
  '60d0afeb-b310-5dda-bf4e-91025ae51ad6': 'harbour', // 43 Olivine City & the Lighthouse (Johto)
  'f4f7c889-a1bb-5903-b75b-c62dd683c6ec': 'sea', // 44 Routes 40 & 41 (Johto)
  '28f66e14-e4f6-59ca-96fe-c196fc53fe9e': 'harbour', // 45 Cianwood City (Johto)
  'bcb0a995-0b15-59b4-baad-07e16f5d19b6': 'lake', // 46 Routes 42 & 43 and the Lake of Rage (Johto)
  '9046f263-c9c8-537c-9548-133e08237781': 'industrial', // 47 Mahogany Town & the Team Rocket HQ (Johto)
  'ca2e6708-ff90-579a-b978-f769f97c6dff': 'icecave', // 48 Route 44 & the Ice Path (Johto)
  'ea9344ea-61b4-5aca-9ddd-e52557730ec5': 'deepcave', // 49 Blackthorn City & the Dragon's Den (Johto)
  '28453b26-704e-599c-b5ab-7763047b0cf7': 'mountain', // 50 Victory Road (Johto)
  '1ab44ea6-29c0-51c0-9a1f-e1a4b77cfc74': 'league', // 51 Indigo Plateau (Johto)
  '5b386fa9-4a0a-4291-bddb-19e899fd366a': 'mountain', // 52 Victory Road II (Johto)
  '82775277-caba-462e-8209-c08d46b403e6': 'champion', // 53 Indigo Plateau II (Johto)
  '9f511e0a-42ac-51b1-90ca-8c1458531603': 'a54', // 54 Mt. Silver (Johto)
  '523fcbeb-9bdf-593a-ae8d-be7afecb0b5e': 'lair-ruins', // 55 Ruins of Alph (Johto)
  'c9033734-407c-5a87-84b3-70a02e6a4c2e': 'lair-sea', // 56 Whirl Islands (Johto)
  '35e0b2d1-6c24-53e4-85b2-31b5fb0c31c3': 'a57', // 57 Bell Tower (Johto)
  '100e6644-3f5b-553a-ad22-e26551b04edc': 'lair-shrine', // 58 Ilex Shrine (Johto)
  '452de5bd-1879-54d0-b89d-499f7b6f940e': 'meadow', // 59 Route 101 (Hoenn)
  '29ae1e5e-9afc-5ba5-a5b3-90dac51b1e48': 'meadow', // 60 Routes 102 & 103 (Hoenn)
  '46ffd645-c925-5620-baaf-674f78b67fe6': 'forest', // 61 Petalburg Woods & Route 104 (Hoenn)
  'cfef731e-5724-5d76-bec7-3710316f6eac': 'modern', // 62 Rustboro City (Hoenn)
  'ad471a2a-c699-586e-9108-65f5b557fa95': 'cave', // 63 Route 116 & Rusturf Tunnel (Hoenn)
  '87839b2d-8083-5d78-b526-40049ff2e2c2': 'deepcave', // 64 Dewford Town & Granite Cave (Hoenn)
  'ae5875f0-198e-58a6-bd22-7418d51270e3': 'sea', // 65 Routes 105–107 (Hoenn)
  '18c36b75-2a63-5861-803e-176c1afd1f05': 'harbour', // 66 Slateport City & Route 110 (Hoenn)
  'f4125979-a6a1-5086-9a5a-5314568b77a9': 'modern', // 67 Mauville City (Hoenn)
  '8ced3bb7-e9ea-59b5-9515-aed7d2ced0d7': 'desert', // 68 Route 111 Desert & Mirage Tower (Hoenn)
  '35ba43d5-ed6e-5add-a1ce-4f1d20e34cf4': 'volcano', // 69 Route 112, Fiery Path & Mt. Chimney (Hoenn)
  '5d36bbd8-0ebe-56b8-9af3-df45a293a3e1': 'volcano', // 70 Lavaridge Town (Hoenn)
  'aa7c054d-8c55-5640-b3d5-2731ca24a00c': 'crystal', // 71 Routes 113–115 & Meteor Falls (Hoenn)
  '109eb63a-8a3a-5aef-9927-2ec9f4a4a959': 'village', // 72 Petalburg City (Hoenn)
  '57a87398-8ee0-5924-b794-bb1ca29ed358': 'jungle', // 73 Routes 118 & 119 (Hoenn)
  'e34791dd-2b08-51ef-9c9f-be18cea0524b': 'forest', // 74 Fortree City & Routes 120–121 (Hoenn)
  'd5fe2203-9a4f-5874-99c6-005b01b42ece': 'meadow', // 75 Safari Zone (Hoenn)
  '88858f3b-8429-567d-90ea-fd319448d274': 'haunted', // 76 Mt. Pyre & Routes 122–123 (Hoenn)
  '0935501c-7f1e-5cf5-a84f-0b04fc538632': 'industrial', // 77 The Magma & Aqua Hideouts (Hoenn)
  'b4cfbd96-a745-5dbb-9187-d225cf3b6059': 'cave', // 78 Lilycove City, Route 124 & Shoal Cave (Hoenn)
  'f4f5da0f-eca7-5aa5-a902-aa3f27d8910a': 'beach', // 79 Mossdeep City & the Space Center (Hoenn)
  '707bb825-6657-5025-b3b2-422458b071d9': 'sea', // 80 Routes 125–128 & Seafloor Cavern (Hoenn)
  '8e822a9a-e17c-56d4-9413-f55f279f136b': 'crystal', // 81 Sootopolis City & the Cave of Origin (Hoenn)
  'c3397515-cd10-59d4-b70a-949ef766c59d': 'mountain', // 82 Victory Road (Hoenn)
  'a95b1329-0b92-511e-905b-f6616ed8f907': 'league', // 83 Ever Grande City (Hoenn)
  '85a77bc1-218c-5ffe-bff2-9a4504072faf': 'frontier', // 84 The Battle Frontier (Hoenn)
  'b0784a3a-46f3-51de-996b-f3a6010141e6': 'lair-volcano', // 85 The Cave of Origin Depths (Hoenn)
  '5af7e2b7-7a2b-5daf-829c-d42bc662e84e': 'lair-sea', // 86 The Seafloor Cavern Depths (Hoenn)
  '4ef12821-79bb-5aa1-ad96-5bd2fbba093f': 'lair-summit', // 87 Sky Pillar (Hoenn)
  '50d4d570-cbd0-5dc9-8960-4f3f133ad2f3': 'lair-ruins', // 88 The Sealed Chambers I (Hoenn)
  '4f067b32-23ad-4fdb-970e-8ec6c48882f8': 'lair-ruins', // 89 The Sealed Chambers II (Hoenn)
  '45ea179f-8401-4a89-b643-2e2b4689af6e': 'lair-ruins', // 90 The Sealed Chambers III (Hoenn)
  'a66abe47-712e-5312-9c87-9164d69f7ffa': 'lair-island', // 91 Southern Island (Hoenn)
  '07e40731-d45b-4e84-8c81-df5470d2f0c3': 'lair-island', // 92 Southern Island II (Hoenn)
  '57008453-b26b-5c52-a88e-e777d39ab364': 'a93', // 93 Birth Island (Hoenn)
  '561fdbd4-4692-5d12-890d-83f8e41bc326': 'lake', // 94 Route 201 & Lake Verity (Sinnoh)
  '1b43a2bf-9d92-581b-b8f1-4885d6795888': 'modern', // 95 Route 202 & Jubilife City (Sinnoh)
  'fab6629b-411f-55b4-8900-9372ffcdbb3e': 'cave', // 96 Route 203 & Oreburgh Gate (Sinnoh)
  'cf8b7fa9-6488-5afe-956e-8c5dfcb4c7d4': 'mine', // 97 Oreburgh City & the Mine (Sinnoh)
  '4af1e90d-318f-5fda-802f-531ebcdbf0a0': 'flowers', // 98 Route 204 & the Ravaged Path (Sinnoh)
  '0c90a15f-5054-5e52-ba55-e310e78d4a49': 'oldforest', // 99 Eterna Forest (Sinnoh)
  'f1b74d14-47e6-57e9-a15f-9cc5610e3687': 'oldtown', // 100 Eterna City & the Galactic Building (Sinnoh)
  'eb01f9bc-a3e2-5fdb-ade9-343b5c0c04b9': 'hills', // 101 Cycling Road & Routes 206–207 (Sinnoh)
  '84e74f22-b8fc-5658-8f2d-c2cf1751b4f8': 'deepcave', // 102 Mt. Coronet South (Sinnoh)
  'b98a27bb-00b4-5fbc-9ef2-63d1f22b024e': 'modern', // 103 Hearthome City (Sinnoh)
  '6c54a30a-d5cc-5311-ae07-d9b0dfac5db2': 'crystal', // 104 Route 209 & the Solaceon Ruins (Sinnoh)
  'ec3bf8b4-c54c-5891-8c31-d22a029fa3b2': 'modern', // 105 Veilstone City & the Galactic HQ (Sinnoh)
  '67b3b539-dd5b-5c9a-96d4-60e4d8b8d188': 'marsh', // 106 Route 212 & Pastoria City (Sinnoh)
  '132bb05f-9768-59fb-89de-b25ecb1acc45': 'marsh', // 107 The Great Marsh (Sinnoh)
  '110c8267-ee16-5a44-960f-620d6055d6ca': 'farm', // 108 Route 205 & the Valley Windworks (Sinnoh)
  'dd760e2c-72d3-5597-8de3-f42318e46551': 'village', // 109 Celestic Town & Route 210 (Sinnoh)
  'e6d578d7-c61e-5b49-8f01-994d8f56116d': 'harbour', // 110 Canalave City & Iron Island (Sinnoh)
  'ffd172b1-9ee2-54a8-bc39-a66661a7e0b8': 'lake', // 111 Lake Valor & Lake Acuity (Sinnoh)
  'bbdca5af-2024-5c0c-8278-c7c5966a5be4': 'snowtown', // 112 Routes 216 & 217 and Snowpoint City (Sinnoh)
  '8e755a0e-8270-5685-857c-629ea1b7d9c5': 'lair-summit', // 113 Mt. Coronet North & Spear Pillar (Sinnoh)
  '8a262e15-6f51-5cad-a9aa-5408de0c5ea0': 'harbour', // 114 Sunyshore City (Sinnoh)
  '463df9e2-3191-591e-889c-f3a8c82e6c0a': 'deepcave', // 115 Victory Road (Sinnoh)
  '5dc66787-c27b-5d67-8d66-4df0f1aa1041': 'league', // 116 The Pokémon League (Sinnoh)
  'aa2f848e-f405-4eff-ab71-02e3a5120b9f': 'deepcave', // 117 Victory Road II (Sinnoh)
  'f3ff4c29-01d6-4036-80c1-1ef6263d3eaf': 'champion', // 118 The Pokémon League II (Sinnoh)
  '87abcf50-112f-54af-bfe1-5ff516c00b58': 'volcano', // 119 The Fight Area & Routes 225–226 (Sinnoh)
  '43ad7294-47a6-5c1c-b068-5743d4eb5562': 'frontier', // 120 The Battle Frontier (Sinnoh)
  '69b5c894-3545-5b3a-91b0-b3aeadadc5a9': 'a121', // 121 The Old Chateau (Sinnoh)
  '2c96595d-9064-52e8-be08-f39fe15acac3': 'a122', // 122 The Lakes of Sinnoh (Sinnoh)
  '9e01bf6d-a07a-5d1c-85c2-6f93074b9dbb': 'a123', // 123 Turnback Cave (Sinnoh)
  'c7c4f1ed-d879-5651-aaed-13063bfa32c0': 'lair-volcano', // 124 Stark Mountain (Sinnoh)
  '10a7f721-2f52-58c4-bba1-728e2f88d763': 'lair-frozen', // 125 Snowpoint Temple (Sinnoh)
  '1bef9b55-6556-5a47-b728-8dc5dba851c7': 'a126', // 126 Fullmoon Island (Sinnoh)
  '5e2e78f9-5ad7-5e3c-a9f2-518a4c11799c': 'a127', // 127 Newmoon Island (Sinnoh)
  '75d4e417-4ae4-523a-bc44-d1efa9e5ed5e': 'a128', // 128 The Seabreak Path (Sinnoh)
  'fc27382b-919d-50d0-9f21-23dd16cf99d0': 'a129', // 129 Flower Paradise (Sinnoh)
  'df1bb846-fc11-590f-afec-45ef39b63deb': 'a130', // 130 The Hall of Origin (Sinnoh)
  'cea12419-b0af-5a2b-9cfa-d51329086fc7': 'meadow', // 501 Route 1 & Nuvema Town (Unova)
  '6d06789c-ace9-5bb1-880c-f7a9116c6f24': 'village', // 502 Route 2 & Accumula Town (Unova)
  '3f289f62-39f8-523b-aa25-5b6614b247aa': 'village', // 503 Striaton City & the Dreamyard (Unova)
  '02d13ccb-081f-5e58-9fff-ec6dc0947235': 'meadow', // 504 Route 3 & Wellspring Cave (Unova)
  '312f59ac-29ce-58ee-aa2d-cf59c8592337': 'forest', // 505 Nacrene City & Pinwheel Forest (Unova)
  'ffe54f64-88c9-5ead-aa12-389b4742ce69': 'modern', // 506 Skyarrow Bridge & Castelia City (Unova)
  '54da008e-5400-5829-8024-4b6589e0e959': 'desert', // 507 Route 4, the Desert Resort & Relic Castle (Unova)
  '5ffc3386-33f5-58fd-b471-f27ebfa6cbcb': 'modern', // 508 Nimbasa City & Route 5 (Unova)
  '8b1e0609-a1b6-5392-ba40-54c23b592aac': 'harbour', // 509 Driftveil City & Route 6 (Unova)
  'db0475ed-7547-5350-a42a-7d25d3ea324b': 'crystal', // 510 Chargestone Cave (Unova)
  'a703817b-8a2f-5bdb-8e08-898f6db6e1b5': 'hills', // 511 Mistralton City & Route 7 (Unova)
  'c442130a-bc84-533f-88c9-05d2bfd35e1c': 'haunted', // 512 Celestial Tower (Unova)
  'ddf0658d-99fb-5fef-ab31-90dab5f39fb6': 'mine', // 513 Twist Mountain (Unova)
  'e22227a1-ae4f-5c8f-aa5a-141aeef63db6': 'marsh', // 514 Icirrus City & the Moor of Icirrus (Unova)
  '2f688337-989f-54f8-a724-4b7acb8958f8': 'snow', // 515 Dragonspiral Tower (Unova)
  'bb60e243-3c86-5c3a-ad23-572ba44840f8': 'modern', // 516 Route 9 & Opelucid City (Unova)
  '9c6c6d9c-030c-55ba-9294-e9125e8ef539': 'deepcave', // 517 Route 10 & Victory Road (Unova)
  '8c87ed3a-c021-57b6-b866-cc6e71877c0e': 'league', // 518 The Pokémon League (Unova)
  '888beadb-3aa2-57cc-82bc-cca9bd51f42a': 'deepcave', // 519 Victory Road II (Unova)
  '414d148c-76c2-5c1a-9e8d-aa1a0b60a154': 'champion', // 520 The Pokémon League II (Unova)
  '03b22d5c-9bdd-5024-80bb-7dfcaa848dc7': 'beach', // 521 Routes 11–14 & Undella Town (Unova)
  'a79ba3e6-ec33-5480-8a4e-d7175eb8fb9a': 'a522', // 522 Black City & White Forest (Unova)
  '285d4dfb-dd01-59eb-a632-0602a135a88e': 'a551', // 551 Liberty Garden (Unova)
  'f014aa64-1215-5a78-be22-b1ee72f0d1e7': 'a552', // 552 The Castelia Café (Unova)
  '2064be7d-daf4-56ee-a5c2-8a805ccac0d5': 'lair-summit', // 553 Dragonspiral Tower's Summit (Unova)
  '091a1797-95f5-58f3-b34a-065f86b07d54': 'a554', // 554 The Swords of Justice (Unova)
  'a536039f-e897-5697-a75e-15d8060e96e3': 'a555', // 555 The Moor of Icirrus Spring (Unova)
  '3a951f35-e83d-5ac1-b2a3-2cfe91620fb4': 'lair-shrine', // 556 The Abundant Shrine (Unova)
  'e3ab5fdf-99ee-5feb-b6fd-1d47352b267e': 'lair-lab', // 557 The P2 Laboratory (Unova)
  '1f3afed9-f2be-5b47-82c5-e281ba2584ae': 'lair-frozen', // 558 The Giant Chasm (Unova)
  '37bf35aa-eb76-5a07-944f-353d0d0cd32e': 'village', // 601 Routes 1 & 2 and Aquacorde Town (Kalos)
  'ae77e7e6-96fd-5e67-adc9-01bcbef2f943': 'forest', // 602 Santalune Forest (Kalos)
  '24403e0e-ced3-55a1-9d15-b2f1b46b486b': 'village', // 603 Route 3 & Santalune City (Kalos)
  '2be87c2d-54b0-5ab8-888a-43f7bfc5da5e': 'flowers', // 604 Routes 4 & 22 and Lumiose City South (Kalos)
  '45a1953c-7b1e-5408-9205-00d75f9dc980': 'village', // 605 Route 5 & Camphrier Town (Kalos)
  'bdfbef78-d8fc-5fca-a7c6-1d1a60ab2653': 'flowers', // 606 Route 6 & Parfum Palace (Kalos)
  '77afa3c1-7785-5e6f-a3cc-f249ec9af432': 'flowers', // 607 Route 7 & the Connecting Cave (Kalos)
  'dd2c1bae-80b9-5100-9e1e-554927bca8d3': 'beach', // 608 Route 8 & Ambrette Town (Kalos)
  'fb474cad-f3fc-547b-a69c-48a752c5866c': 'cave', // 609 Route 9, the Glittering Cave & Cyllage City (Kalos)
  '539298c8-926d-56a3-bf8e-e8635db096da': 'hills', // 610 Route 10 & Geosenge Town (Kalos)
  '56e3832c-f06c-5d1d-821d-ec94d7b75286': 'crystal', // 611 Route 11, Reflection Cave & Shalour City (Kalos)
  '070ee8ad-f4e1-5b18-b2a6-a1ff5fdcb226': 'harbour', // 612 Route 12, Azure Bay & Coumarine City (Kalos)
  '0f04ef44-9fa0-57a3-b121-3b883b80e4b3': 'badlands', // 613 Route 13 & the Kalos Power Plant (Kalos)
  '6e410147-d926-5e1e-b132-47d7a9470438': 'modern', // 614 Lumiose City (Kalos)
  'a70959b8-95b3-5534-9d93-01262a0e1179': 'marsh', // 615 Route 14 & Laverre City (Kalos)
  '05803fd7-2ba3-5891-81b7-368dc894de79': 'haunted', // 616 Routes 15 & 16 and the Lost Hotel (Kalos)
  'b882b6d6-bf43-51e2-9320-acd5a9852333': 'icecave', // 617 Dendemille Town, Route 17 & the Frost Cavern (Kalos)
  '3ae2af61-1847-5729-b5e9-a6773211e792': 'hills', // 618 Route 18 & Anistar City (Kalos)
  '29ab296e-d543-5dbd-b987-937db9ec59c0': 'industrial', // 619 Lysandre Labs & the Team Flare Secret HQ (Kalos)
  'e2e8a0d9-9b0a-564b-9f4a-cead9f3ff959': 'marsh', // 620 Route 19 & Couriway Town (Kalos)
  '5f1d1580-7189-5144-996a-2b9ba2765e22': 'oldforest', // 621 Route 20, the Pokémon Village & Snowbelle City (Kalos)
  'cebf8471-cd94-534a-a781-98297581743e': 'deepcave', // 622 Route 21 & Victory Road (Kalos)
  'd3464556-7bcd-5708-9a13-415e0326fb75': 'league', // 623 The Pokémon League (Kalos)
  '13fcad9d-8c4b-56d3-bced-9ef61c93745f': 'deepcave', // 624 Victory Road II (Kalos)
  '7213c40c-c1d8-5cbc-89f9-5b65c3e52fa2': 'champion', // 625 The Pokémon League II (Kalos)
  'a3a909e6-bd11-52cd-8d21-bc6a6aa8992d': 'frontier', // 626 Kiloude City & the Battle Maison (Kalos)
  'cb642e3e-986b-5430-b507-7baf6cc0567b': 'meadow', // 627 The Friend Safari (Kalos)
  '3a1aeecf-7492-5b10-a8ca-909a574d61f5': 'a651', // 651 The Team Flare Secret HQ Depths (Kalos)
  'f8ebca1d-a9ef-50a3-bfc7-88349041117d': 'a652', // 652 Terminus Cave (Kalos)
  '64740605-3951-57d0-9217-1d9ad7752eff': 'lair-crystal', // 653 The Diamond Domain (Kalos)
  '532b27a7-bfb1-5b03-ae0f-a611995dffa2': 'a654', // 654 Hoopa's Ring (Kalos)
  '9394fdfc-182a-5c7d-92a2-3fb38c339f28': 'lair-volcano', // 655 The Nebel Plateau (Kalos)
  '19484a4c-fd2d-539b-a375-e0683e90424b': 'tropical', // 701 Route 1 & Hau'oli Outskirts (Alola)
  'b0476bf1-2815-53f6-9483-6d984dfa938a': 'modern', // 702 Hau'oli City & the Cemetery (Alola)
  'd7bfc7c0-ab59-5608-88c7-5d395cdbe217': 'cave', // 703 Route 2 & the Verdant Cavern (Alola)
  'ef57b168-56a6-55c7-ad15-a09d319e487b': 'flowers', // 704 Route 3 & Melemele Meadow (Alola)
  'a3fa05ff-904e-5994-98aa-134ee66e5f80': 'crystal', // 705 Ten Carat Hill & Kala'e Bay (Alola)
  '55e5bb0d-c6b3-5177-9533-a04e905f005b': 'tropical', // 706 Route 1 South & Iki Town (Alola)
  '87cba513-0bc5-55df-a781-9de73048528c': 'farm', // 707 Heahea City & Routes 4–6 (Alola)
  'ab9ebe55-a162-52ce-b648-cc84608f7f77': 'marsh', // 708 Brooklet Hill (Alola)
  '38846271-6caa-52ab-b474-600c585b98f2': 'volcano', // 709 Routes 7 & 8 and Wela Volcano Park (Alola)
  '5e9ea6d6-2b62-56a5-a737-d841a48684f6': 'jungle', // 710 Lush Jungle (Alola)
  '40914a04-5443-58e5-bcdf-051cc9de5dd7': 'haunted', // 711 Memorial Hill, Akala Outskirts & Konikoni City (Alola)
  '0e1ccc24-1c60-56e1-9f03-4b3deda34951': 'beach', // 712 Hano Beach & Aether Paradise (Alola)
  '7d3ee2f7-3442-5738-b2c6-d3037e514fec': 'oldtown', // 713 Malie City & Malie Garden (Alola)
  '5fb9f3eb-bdbe-5c45-8345-3f4a20d75f1d': 'mountain', // 714 Route 10 & Mount Hokulani (Alola)
  'd6ba26d1-3dd2-51fc-b559-74c01d2ddba2': 'hills', // 715 Routes 11 & 12 and Blush Mountain (Alola)
  '3463beea-946a-5c99-89d1-19dc707896e8': 'desert', // 716 Routes 13 & 14, Haina Desert & Tapu Village (Alola)
  '8b0339d9-7358-5cff-a342-49b1ae6dda36': 'haunted', // 717 Routes 15 & 16 and the Thrifty Megamart (Alola)
  '15d60999-b4a3-5a6e-bee2-7a1ff9e278e6': 'haunted', // 718 Route 17 & Po Town (Alola)
  'a13dcc18-e146-5423-b54d-c0a5869ddad2': 'industrial', // 719 Aether Paradise (Alola)
  'b629fa00-cb91-5390-9500-2240f2dc5ceb': 'harbour', // 720 Seafolk Village, Poni Wilds & Ancient Poni Path (Alola)
  'e7ae24d0-80a4-51d7-a9cb-c0df82d25286': 'badlands', // 721 Exeggutor Island & Vast Poni Canyon (Alola)
  'db4e5701-dfdf-54dd-bfee-002c1fdcc391': 'snow', // 722 Mount Lanakila (Alola)
  'af565afe-bfc6-516a-8a4c-bba17bb1ff48': 'league', // 723 The Pokémon League (Alola)
  '5d2b50d3-a648-5479-a687-067ca5f833f4': 'snow', // 724 Mount Lanakila II (Alola)
  '62903307-8361-5503-9f7c-216d94b03a27': 'champion', // 725 The Pokémon League II (Alola)
  '30233749-91cd-5ba0-8e62-f4ea0042de40': 'frontier', // 726 Poni Gauntlet & the Battle Tree (Alola)
  'e22d5bee-8d04-5f99-ab7f-157785f0a30b': 'beach', // 727 The Poké Pelago (Alola)
  'a33bf12e-2ad9-5a79-bfe7-6224579f9a32': 'sunne-moone', // 751 The Lakes of the Sunne and Moone (Alola)
  '16780c62-8411-5637-abec-7257a04e2e3c': 'sunne-moone', // 752 The Altar of the Sunne and Moone (Alola)
  'fa01d16e-8669-5542-be05-f5d8d16395d1': 'a753', // 753 Ultra Megalopolis (Alola)
  '65b4d722-2dfa-5a76-826b-4978a2ee9279': 'a754', // 754 The Ruins of the Guardians (Alola)
  '8fbfe77e-17f1-52c8-9232-cde4de4c111d': 'ultra-space', // 755 Ultra Space: the Deep Sea & the Jungle (Alola)
  'e54b0cd7-f0a7-5d43-850f-5488e781eefc': 'ultra-space', // 756 Ultra Space: the Desert & the Plant (Alola)
  '85752149-2f14-5e91-a6c1-226e6db35f80': 'ultra-space', // 757 Ultra Space: the Crater & the Forest (Alola)
  '4c3e26b2-3163-556e-b4d4-d628e1ff4120': 'ultra-space', // 758 Ultra Space: the Ruin (Alola)
  '63160939-79ac-5244-ae50-7f7fc8c37c5f': 'a759', // 759 Poni Grove (Alola)
  'ad40171a-6414-5510-bafe-44d13217d218': 'ultra-space', // 760 The Ultra Recon Squad (Alola)
  '28487bdf-d4f4-5fc9-860e-accef6b9677f': 'a761', // 761 Magearna's Workshop (Alola)
  'e8c9b515-3421-5bdb-ade2-b101f1e6885d': 'a762', // 762 Ten Carat Hill's Farthest Hollow (Alola)
  '4a29a297-7cb0-5f5d-b6f0-f36210ff02e4': 'a763', // 763 The Blush Mountain Storm (Alola)
  'bf277850-73f7-569e-8657-fa5298161229': 'a764', // 764 The Mystery Box (Alola)
  '1db6ed36-e9f3-5b41-bc01-056f64328d72': 'farm', // 801 Postwick, Route 1 & the Slumbering Weald (Galar)
  '2774ec8e-d49b-5a76-9937-a9dc9035f877': 'village', // 802 Wedgehurst & Route 2 (Galar)
  '98ab6c0a-a752-5157-8ce5-94208fcbbfdf': 'meadow', // 803 The Wild Area: Rolling Fields & Dappled Grove (Galar)
  '832605a6-8fd7-5d03-9507-1f3da93819d2': 'mine', // 804 Motostoke, Route 3 & the Galar Mine (Galar)
  '1a1d8cd3-309b-5135-a5bf-cce7726d9285': 'farm', // 805 Route 4 & Turffield (Galar)
  '37cbfa7a-7d0a-5bf2-90b0-18bfd311fb20': 'harbour', // 806 Route 5 & Hulbury (Galar)
  '902e5ba8-0792-587d-ace6-eef95a49b627': 'mine', // 807 Galar Mine No. 2 & Motostoke Stadium (Galar)
  'e7f76d12-ae38-5958-a173-c17897d81a5e': 'hills', // 808 Motostoke Outskirts & the Wild Area South (Galar)
  '3b798c52-789e-5e63-a333-102f529ad855': 'badlands', // 809 Hammerlocke & Route 6 (Galar)
  '765886e8-1c97-5169-b8ff-dde63b64dd57': 'badlands', // 810 Stow-on-Side (Galar)
  '716b4c9b-cb31-5a1e-97a1-d8c3be45b074': 'oldforest', // 811 Glimwood Tangle & Ballonlea (Galar)
  '754c266f-20b0-5367-a889-82c082de70f3': 'hills', // 812 Routes 7 & 8 (Galar)
  '74411831-f7a6-5a6f-9252-63b5e0f1874e': 'snowtown', // 813 Steamdrift Way & Circhester (Galar)
  'cab2b223-9f4a-59bb-bc3d-b4ff4a58cf07': 'snow', // 814 Route 9 & Spikemuth (Galar)
  'c65845c5-b723-5a1b-922e-8aa6930e6aeb': 'lake', // 815 Hammerlocke Hills & the Lake of Outrage (Galar)
  'e8a36a96-5c86-5e7d-a5f5-0c845ab2dbe8': 'snow', // 816 Route 10 & Wyndon (Galar)
  '272fe5aa-fa73-5178-a416-4998e8b4a478': 'industrial', // 817 Rose Tower & the Energy Plant (Galar)
  '3610c6e0-5fc7-5aab-8b2c-a59be219db55': 'league', // 818 Wyndon Stadium & the Champion Cup (Galar)
  'eb428b97-a163-5cfd-995d-706c0ff73f0b': 'meadow', // 819 The Wild Area II (Galar)
  'c7cc6447-9d47-544e-bc63-ac241b69d06c': 'champion', // 820 The Champion Cup II (Galar)
  '890cb77d-0fe5-5576-9b92-2ab68f0be295': 'tropical', // 821 The Isle of Armor (Galar)
  '0c17194f-f7be-5221-91d0-68fcee8da9d9': 'snow', // 822 The Crown Tundra (Galar)
  'd8f06e4c-6ffd-5b94-9149-43231e89927f': 'a823', // 823 The Max Lair (Galar)
  '7d1a416a-9b25-5028-b602-c59fee3c07f9': 'a824', // 824 The Space-Time Rift (Galar)
  '96249330-8b71-592c-9f49-55e62a34c1a3': 'a851', // 851 The Energy Plant Summit (Galar)
  '684730bd-a885-5020-bb88-197e9d5d60d7': 'a852', // 852 The Slumbering Weald's Depths (Galar)
  'ee242291-8416-583c-a0b0-6ed4d7b16b60': 'a853', // 853 The Master Dojo (Galar)
  '8312c104-010a-5c23-8520-4c355292b850': 'lair-ruins', // 854 The Split-Decision Ruins (Galar)
  '94ab9674-c4da-5094-9f7c-f9dcfec326b9': 'a855', // 855 The Crown Shrine (Galar)
  '4aed8f3a-c216-5713-ac05-5a66d5c6998e': 'a856', // 856 The Forest of Focus (Galar)
  '79ae0fff-8541-541b-9370-4a50b19cec73': 'a857', // 857 The Crimson Mirelands (Galar)
  'e8936c27-eded-53f7-ad42-8c6eea16f5f6': 'a858', // 858 Dyna Tree Hill (Galar)
  '9736bc36-2a22-5136-a6c3-0968cbffb987': 'beach', // 901 Cabo Poco, the Poco Path & the Inlet Grotto (Paldea)
  'c3e62acf-0be6-50e4-9276-deee4b898a92': 'meadow', // 902 Los Platos & South Province (Area One) (Paldea)
  '5b5c0485-3a57-5a7f-8710-0d2d270a1f8b': 'modern', // 903 Mesagoza & South Province (Area Two) (Paldea)
  '6a5018d6-00f7-5b1d-9f19-941dd6158856': 'hills', // 904 South Province (Area Three) & Cortondo (Paldea)
  '5ac63cdb-d119-59e2-a364-509db7798bc2': 'flowers', // 905 South Province (Area Six) & Artazon (Paldea)
  '39632d00-434b-5ba5-ada5-38b1a69af1d4': 'badlands', // 906 West Province (Area One) & the Segin Squad's Base (Paldea)
  'dd5fe776-47af-5400-9bd9-ab1c71958d2f': 'modern', // 907 East Province (Areas One & Two) & Levincia (Paldea)
  '4bd4ee06-1d09-54d6-a3b8-749099e52f76': 'volcano', // 908 The Schedar Squad's Base & East Province (Area Three) (Paldea)
  '806671c7-1a49-543d-bea9-38f1c6cf3b60': 'desert', // 909 The Asado Desert & Cascarrafa (Paldea)
  '01e87fe2-a8e9-5bad-a655-2843642473ef': 'oldforest', // 910 Tagtree Thicket & the Navi Squad's Base (Paldea)
  'd8f76401-f8d1-576d-8219-9c19b5de5053': 'evening', // 911 West Province (Area Two) & Medali (Paldea)
  'b18bf51d-b8f7-59b4-9a5f-38ced8a75ae7': 'snowtown', // 912 The Dalizapa Passage & Montenevera (Paldea)
  '18ca0857-2794-5c43-bcf6-830d95db6f96': 'crystal', // 913 The Alfornada Cavern & Alfornada (Paldea)
  '329c3ea6-7942-5784-b1bf-adc6f7ced8dd': 'snow', // 914 Glaseado Mountain (Paldea)
  '8809e938-32cd-5da7-89b1-4ef9331712d7': 'mountain', // 915 North Province (Area Three) & the Ruchbah Squad's Base (Paldea)
  '6cd30361-f010-5325-a309-28a7ffed28f7': 'cave', // 916 North Province (Area Two) & the Caph Squad's Base (Paldea)
  '2157b46b-a121-543b-9cca-b18fdc85d65e': 'lake', // 917 Casseroya Lake (Paldea)
  '825f26fc-0e43-5fda-8a4b-07c0a044507d': 'league', // 918 The Pokémon League (Paldea)
  'c9bca81d-c26f-5579-9b74-9123bea95976': 'evening', // 919 The Way Home (Paldea)
  '514b38ad-7e5d-5723-be67-fda18c2470e0': 'a920', // 920 Area Zero (Paldea)
  'cd6e3688-d7e8-509f-a438-abf66eea0692': 'a921', // 921 The Land of Kitakami (Paldea)
  '699f35ef-aeef-503a-ad2a-4eeacf00845e': 'blueberry', // 922 Blueberry Academy & the BB League (Paldea)
  'bda155ba-8676-5610-a304-3aa1a309a8f5': 'blueberry', // 923 The Terarium (Paldea)
  'de407c38-0217-5037-a688-18d5199f1d1b': 'lair-lab', // 951 The Zero Lab (Paldea)
  '3306e59f-b7a1-5696-8a98-3122162d0320': 'a952', // 952 The Shrines of Ruin (Paldea)
  '81a9b321-6fb5-5285-b71f-327d8b52b391': 'a953', // 953 Loyalty Plaza (Paldea)
  'c565e910-b4c6-5271-9bee-9ff2795d0615': 'a954', // 954 Oni Mountain & the Crystal Pool (Paldea)
  'a9d3ca76-7fd7-5428-9cd4-78123a2c0e5b': 'lair-crystal', // 955 The Paradox Sightings (Paldea)
  '679952cf-16ca-5cf8-82f9-e57b382d4c71': 'lair-crystal', // 956 The Area Zero Underdepths (Paldea)
  '168b74c9-3359-5581-a214-1f5be8da9b3e': 'a957', // 957 Kitakami Hall (Paldea)
}

/**
 * Each picture, measured in the Home scene's 288 × 276 art pixels: the horizon (null where the picture has no clear
 * one: the lists then cut the middle and the battle takes the bottom), the box the team walks in, and the water the
 * swimmers keep to, only where the picture clearly has some.
 */
export const ART_GEOMETRY: Readonly<Record<string, ArtGeometry>> = {
  // The Day Care's yard (not an area: dayCarePicture() in areaArt.ts): the lawn under the fence, the pond bottom left.
  daycare: { horizon: 118, walk: [24, 168, 264, 262], pond: { x: 76, y: 223, rx: 52, ry: 16 } },
  a121: { horizon: 142, walk: [24, 168, 264, 266] },
  a122: { horizon: 124, walk: [24, 178, 264, 266], pond: { x: 200, y: 148, rx: 50, ry: 12 } },
  a123: { horizon: 113, walk: [24, 152, 264, 266] },
  a126: { horizon: 137, walk: [24, 176, 264, 266] },
  a127: { horizon: 136, walk: [30, 170, 258, 262] },
  a128: { horizon: 104, walk: [24, 150, 264, 266] },
  a129: { horizon: 123, walk: [36, 160, 252, 266] },
  a130: { horizon: null, walk: [60, 190, 228, 266] },
  a25: { horizon: 166, walk: [40, 186, 248, 266] },
  a26: { horizon: 130, walk: [24, 182, 264, 266] },
  a522: { horizon: 168, walk: [30, 190, 250, 266] },
  a54: { horizon: 127, walk: [30, 160, 258, 266] },
  a551: { horizon: 110, walk: [60, 165, 250, 262] },
  a552: { horizon: null, walk: [40, 200, 248, 266] },
  a554: { horizon: 143, walk: [40, 196, 250, 266], pond: { x: 185, y: 150, rx: 36, ry: 6 } },
  a555: { horizon: 137, walk: [40, 160, 264, 266], pond: { x: 98, y: 168, rx: 40, ry: 7 } },
  a57: { horizon: null, walk: [44, 206, 244, 266] },
  a651: { horizon: 166, walk: [40, 186, 248, 262] },
  a652: { horizon: 146, walk: [30, 196, 258, 266] },
  a654: { horizon: 153, walk: [40, 180, 250, 266] },
  a753: { horizon: 168, walk: [40, 190, 250, 266] },
  a754: { horizon: 149, walk: [36, 176, 252, 266] },
  a759: { horizon: 150, walk: [40, 180, 250, 266] },
  a761: { horizon: 143, walk: [44, 168, 246, 262] },
  a762: { horizon: 139, walk: [36, 170, 252, 262] },
  a763: { horizon: 129, walk: [24, 160, 264, 266] },
  a764: { horizon: 162, walk: [40, 186, 240, 266] },
  a823: { horizon: 102, walk: [36, 150, 252, 262] },
  a824: { horizon: 170, walk: [40, 196, 250, 266] },
  a851: { horizon: 139, walk: [36, 166, 252, 266] },
  a852: { horizon: 152, walk: [40, 180, 250, 266] },
  a853: { horizon: 153, walk: [40, 172, 248, 266] },
  a855: { horizon: 170, walk: [40, 196, 250, 266] },
  a856: { horizon: 154, walk: [36, 182, 252, 266], pond: { x: 95, y: 162, rx: 55, ry: 9 } },
  a857: { horizon: 152, walk: [36, 176, 252, 266] },
  a858: { horizon: 118, walk: [40, 160, 250, 266] },
  a920: { horizon: null, walk: [40, 214, 250, 266] },
  a921: { horizon: 128, walk: [24, 160, 264, 262] },
  a93: { horizon: 128, walk: [40, 186, 250, 266] },
  a952: { horizon: 116, walk: [36, 160, 252, 266] },
  a953: { horizon: 150, walk: [40, 186, 244, 266] },
  a954: { horizon: 137, walk: [40, 170, 250, 262] },
  a957: { horizon: 153, walk: [44, 180, 244, 266] },
  badlands: { horizon: 121, walk: [36, 160, 252, 266] },
  beach: { horizon: 124, walk: [60, 176, 260, 266], pond: { x: 48, y: 158, rx: 44, ry: 14 } },
  blueberry: { horizon: 158, walk: [40, 186, 248, 262] },
  cave: { horizon: 130, walk: [56, 172, 230, 262], pond: { x: 94, y: 138, rx: 46, ry: 9 } },
  champion: { horizon: 176, walk: [44, 196, 244, 266] },
  crystal: { horizon: 123, walk: [36, 160, 252, 266] },
  deepcave: { horizon: 98, walk: [40, 150, 248, 262] },
  desert: { horizon: 123, walk: [36, 160, 252, 266] },
  evening: { horizon: 137, walk: [24, 186, 264, 262] },
  farm: { horizon: 139, walk: [24, 176, 196, 262] },
  flowers: { horizon: 110, walk: [24, 150, 264, 236], pond: { x: 50, y: 187, rx: 46, ry: 14 } },
  forest: { horizon: 136, walk: [40, 176, 248, 266] },
  frontier: { horizon: 156, walk: [36, 180, 252, 266] },
  harbour: { horizon: null, walk: [76, 192, 254, 264], pond: { x: 200, y: 150, rx: 40, ry: 10 } },
  haunted: { horizon: 129, walk: [36, 176, 252, 266] },
  hills: { horizon: 144, walk: [40, 186, 252, 266] },
  icecave: { horizon: 143, walk: [44, 172, 248, 266] },
  industrial: { horizon: 144, walk: [44, 170, 244, 266] },
  jungle: { horizon: 150, walk: [40, 180, 248, 266], pond: { x: 85, y: 160, rx: 40, ry: 10 } },
  'lair-crystal': { horizon: 139, walk: [36, 152, 252, 262], pond: { x: 182, y: 222, rx: 66, ry: 14 } },
  'lair-frozen': { horizon: 120, walk: [44, 156, 244, 262] },
  'lair-island': { horizon: 140, walk: [56, 176, 228, 262] },
  'lair-lab': { horizon: 126, walk: [40, 160, 244, 262] },
  'lair-ruins': { horizon: 162, walk: [40, 196, 244, 266] },
  'lair-sea': { horizon: 136, walk: [30, 186, 200, 262], pond: { x: 97, y: 146, rx: 66, ry: 12 } },
  'lair-shrine': { horizon: 146, walk: [44, 186, 250, 266] },
  'lair-summit': { horizon: null, walk: [44, 196, 248, 266] },
  'lair-volcano': { horizon: 142, walk: [40, 170, 250, 266] },
  lake: { horizon: 106, walk: [40, 180, 252, 266], pond: { x: 120, y: 153, rx: 80, ry: 9 } },
  league: { horizon: null, walk: [40, 200, 248, 266] },
  marsh: { horizon: 103, walk: [40, 176, 248, 262] },
  meadow: { horizon: 83, walk: [44, 150, 252, 266] },
  mine: { horizon: 150, walk: [36, 176, 236, 264] },
  modern: { horizon: 164, walk: [44, 190, 244, 266] },
  mountain: { horizon: 158, walk: [40, 186, 252, 262] },
  oldforest: { horizon: 166, walk: [44, 190, 248, 262] },
  oldtown: { horizon: 142, walk: [50, 176, 214, 264] },
  sea: { horizon: null, walk: [50, 196, 236, 266], pond: { x: 144, y: 150, rx: 110, ry: 20 } },
  snow: { horizon: 124, walk: [44, 176, 248, 262] },
  snowtown: { horizon: 128, walk: [36, 180, 252, 266], pond: { x: 69, y: 146, rx: 56, ry: 13 } },
  tropical: { horizon: 124, walk: [56, 170, 236, 264] },
  'ultra-space': { horizon: 146, walk: [40, 176, 252, 264] },
  village: { horizon: 172, walk: [36, 196, 252, 266] },
  volcano: { horizon: 128, walk: [44, 170, 250, 262] },
}
