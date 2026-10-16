-- Twice as many of every evolution item that only an area gives (a one-time find, never sold by a Mart). Each of
-- these finds was one copy per save, so a player who evolved the normal Pokémon had nothing left for its shiny.
-- Every such find gets a twin: a second one-time find of the same item in the same area, copied from the live row
-- (weight, quantity). A new id rather than a bigger quantity, so saves that already made the first find still get
-- the second one. Built from the admin export of 2026-10-16: 47 finds; the stones the Marts sell (Fire, Water,
-- Thunder, Leaf, Moon) are left as they are, as are the Haunted Hollow finds its own Mart sells. A find the admin
-- has removed since gets no twin. Then `configVersion` + 1. Safe to run again.
begin;
insert into area_loot_pool (id, area_id, item_key, weight, unique_find, min_qty, max_qty)
select v.id::uuid, p.area_id, p.item_key, p.weight, true, p.min_qty, p.max_qty
from (values
  ('6103946d-0233-5538-a737-7b41662bc6b4', '64decf63-3a05-5c91-8f8e-117d5062a128'), -- johto · Blackthorn City & the Dragon's Den · dragon-scale
  ('350ed9d2-cb4b-5775-9999-c582721ccf41', 'ec8bd83e-c2fb-5643-aba2-9762680b365d'), -- johto · Goldenrod City · up-grade
  ('9fc0ead3-5a69-5723-98b1-862fd02e570e', '56de34a6-12ad-5ea7-8258-2f709ce1343f'), -- johto · National Park · sun-stone
  ('1a45841a-a31c-516f-b31a-f7305622e213', '4157f1e4-6e9e-53fb-9bda-c86d04150ec1'), -- johto · Olivine City & the Lighthouse · metal-coat
  ('744c8929-d05e-5d2d-a8dc-1d50eec13e15', 'ab4b1cad-ba12-52a5-82f3-15074060c2d5'), -- johto · Route 33 & Slowpoke Well · kings-rock
  ('bb0b3ffa-7b2f-58e5-9b17-a83b397a6192', '061fb4a4-9158-5169-95e3-5ddfc4bb25b5'), -- hoenn · Lilycove City, Route 124 & Shoal Cave · deep-sea-scale
  ('da7884dd-734e-556b-ab34-c7830a4b3814', 'de1ba3a9-3db0-5b40-bcd3-eb75b6331a2e'), -- hoenn · Lilycove City, Route 124 & Shoal Cave · deep-sea-tooth
  ('7a72dc91-f75e-5798-a5a3-90954603a8b6', 'e8d4da9e-63d8-51d6-9fd6-c1bad6392c74'), -- hoenn · Mossdeep City & the Space Center · sun-stone
  ('3c739f96-06ac-539b-8aab-6c1fbb69d9ca', 'c427a2a4-5731-5627-99f6-b2769b77c4f1'), -- hoenn · Routes 113–115 & Meteor Falls · dragon-scale
  ('9bf824c7-a46a-5f9c-ac9e-06e872e9a6db', '6a492c6f-2984-4bf3-9b9a-311eb728c322'), -- sinnoh · Canalave City & Iron Island · metal-coat
  ('f1f1fa4a-a9c8-558a-a143-c5cc4510cda1', '21a9a9ad-79fd-59f4-9b04-4124409065da'), -- sinnoh · Canalave City & Iron Island · protector
  ('e96d896c-d095-5d45-a316-49ff79388089', 'ebf2f15b-6ec9-5f39-86e8-209df3b12108'), -- sinnoh · Cycling Road & Routes 206–207 · razor-fang
  ('350c623c-fc1a-569a-9907-31630023fef4', 'd8dd891f-1b7a-5b85-9c7a-90ed52ca3e29'), -- sinnoh · Mt. Coronet South · dawn-stone
  ('646dbfae-78be-5475-b926-736fa4539beb', 'ee50d5c8-f7f2-5944-8774-32ed9219001d'), -- sinnoh · Route 205 & the Valley Windworks · electirizer
  ('68d3202f-80ae-5a5d-9d90-e7fd1c9bf356', 'f81bb425-66b7-51d5-8de4-f8ec2ea74ad0'), -- sinnoh · Route 209 & the Solaceon Ruins · oval-stone
  ('aa8b8301-b0ec-57ac-b4a3-a9b8c3e52728', 'cdf52d3a-b615-5db7-8efa-dfbf54ddd252'), -- sinnoh · Route 209 & the Solaceon Ruins · shiny-stone
  ('d8bef3ec-f48f-594d-81d3-c2108a065e12', 'ddfef721-10c5-5ced-a9fc-893ab46de4e7'), -- sinnoh · The Fight Area & Routes 225–226 · magmarizer
  ('6c7a6e01-077b-5388-9fd7-8b7be984df75', 'f846732e-d82e-5511-b3ac-881405a77a8f'), -- sinnoh · Veilstone City & the Galactic HQ · dubious-disc
  ('3ca0f4ee-92e0-5775-a4de-64fc22021756', 'c92fa8c1-65cf-532c-8d31-88d6e957cf63'), -- sinnoh · Veilstone City & the Galactic HQ · dusk-stone
  ('ca328be4-6ac7-59ef-915d-0f9a438b619e', '28429eb6-f446-5974-8aac-d3507196b6fd'), -- sinnoh · Victory Road · razor-claw
  ('0bf2301c-e239-5b00-beb8-738c6ada7d06', '7b59b2bc-8959-5227-af22-9bfc25439a96'), -- sinnoh · Victory Road · reaper-cloth
  ('c40f4ec9-5b8c-50cd-8461-a54110790338', 'c8be14b8-5e07-5786-86cb-00659036f8c1'), -- unova · Celestial Tower · dusk-stone
  ('c145e00d-ffb8-591f-ac56-749c7fdefb68', '3bab56de-f8e1-5bd0-b364-9a6baf3fa704'), -- unova · Nimbasa City & Route 5 · shiny-stone
  ('8cf6777b-b107-5f98-ad17-f52c235f1788', '3cd499d8-12b6-5e27-8f64-a1e6ee1c7757'), -- unova · Route 4, the Desert Resort & Relic Castle · sun-stone
  ('672fb358-ca43-58df-a40f-f550aa96398c', 'c14146b0-64b2-57d0-8e14-d82effa5f4ca'), -- kalos · Route 14 & Laverre City · shiny-stone
  ('117d18d5-494a-51a2-b13b-bdc336c011a3', 'bdc0b03d-c1ad-59b1-ba83-bbf51174e831'), -- kalos · Route 19 & Couriway Town · razor-fang
  ('76138398-acbc-58af-a774-1c7c79144cf1', '421d9c76-ae75-500b-8acf-f7950d94a25f'), -- kalos · Route 7 & the Connecting Cave · sachet
  ('44d85ef8-1db0-5763-b743-d139cb04572f', '5a9b5953-6519-5640-9fde-137564faccfe'), -- kalos · Route 7 & the Connecting Cave · whipped-dream
  ('fbe305e3-718c-5b3a-9f34-6dacaafbc5f8', '13b1302a-f0ff-5e90-a1a8-a79f3a854628'), -- kalos · Route 9, the Glittering Cave & Cyllage City · sun-stone
  ('aab5741c-d8e6-5841-bd52-ffffe6b92c96', '5b308945-e5a2-58e8-8919-f0ca8cdf7a9f'), -- kalos · Routes 15 & 16 and the Lost Hotel · dusk-stone
  ('45a164fb-6f18-5331-b222-d7848d17c212', '62149101-b25d-585d-82f6-0cfc012bc84b'), -- alola · Mount Lanakila · ice-stone
  ('6a43d1a4-d57c-5a5d-92be-4bc31679b123', '72fe8015-36a0-5597-bff4-0a62da1d29f2'), -- galar · Glimwood Tangle & Ballonlea · cracked-pot
  ('42e2575a-4550-54c9-9f1a-e4ec8e9de859', 'fff32190-254e-5564-9a92-ae4451c8e67b'), -- galar · Route 5 & Hulbury · sweet-apple
  ('227a98de-3f24-52b6-b381-edad49c644b6', 'befef9a6-6602-58e7-9fc0-3226107fe890'), -- galar · Route 5 & Hulbury · tart-apple
  ('2723d108-0b49-50c6-8307-d1794f13dbc1', 'fb21cb5c-9c45-5406-a826-a68f367d6895'), -- galar · Steamdrift Way & Circhester · ice-stone
  ('cde56f84-2467-5df5-9a1a-94cf7d3f32a9', 'a1c7c0c1-0c98-5512-aa23-1acdd0fcfd67'), -- galar · The Isle of Armor · galarica-cuff
  ('9243f062-ac38-5f62-9693-e83ef53a2fd5', '0a561b0f-65c8-5684-8e9b-3d0178685763'), -- galar · The Isle of Armor · galarica-wreath
  ('b39ced9e-bdf1-5434-833c-78c278256636', '3c53b478-388a-5b4d-a75d-9c85035b5a93'), -- galar · The Isle of Armor · scroll-of-darkness
  ('ecd30aa3-903d-504e-bfd0-7f9572fd5e10', '0ff16527-b9ba-5626-b192-8da0b6b11b1b'), -- galar · The Space-Time Rift · black-augurite
  ('8da3e762-b4d9-5b18-9ce3-2a5c48fc0a1e', 'e76f2770-8355-5a16-8eb5-03632fe61a4d'), -- galar · The Space-Time Rift · peat-block
  ('264bad96-ee9e-59fb-9540-3e47ce91b4c4', '598ff38d-5695-5f64-b865-d15b4b84e8e0'), -- galar · The Space-Time Rift · sun-stone
  ('95d0c53a-8e6d-5ba1-af25-191994a5d5b7', '65061c00-6539-5b06-9fea-04bb900f535a'), -- paldea · Blueberry Academy & the BB League · metal-alloy
  ('f8357dea-0602-53c4-bcaf-1cf1be874f98', '6d46f38c-e593-529c-b252-5968103630cd'), -- paldea · Glaseado Mountain · ice-stone
  ('6444be41-818d-5f8a-b200-4bd2d10a74e9', '9e19cf40-48ac-518b-810b-1c2c75125153'), -- paldea · The Land of Kitakami · syrupy-apple
  ('cad2cf15-4dd2-5582-8f77-5045d81b894c', 'e46672fb-7a95-570b-a744-c1328713c68d'), -- paldea · The Land of Kitakami · unremarkable-teacup
  ('a731beee-1aa6-5b2e-be00-51e2a2a2158a', 'b0e7093e-b32c-5eb3-b58a-799dfc9ce74d'), -- paldea · The Schedar Squad's Base & East Province (Area Three) · auspicious-armor
  ('b86eca7c-f99f-5511-bfeb-1aef57cb5b08', 'a99766c4-90e0-5e04-a4ba-92b79634e496')  -- paldea · The Schedar Squad's Base & East Province (Area Three) · malicious-armor
) v (id, original_id)
join area_loot_pool p on p.id = v.original_id::uuid and p.unique_find
on conflict (id) do nothing;
insert into game_config (key, value) values ('configVersion', '1'::jsonb) on conflict (key) do update set value = to_jsonb(coalesce((game_config.value #>> '{}')::int, 0) + 1);
commit;
