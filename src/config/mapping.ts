// Supabase rows (snake_case, flat pools) ↔ the bundle (camelCase, pools nested in areas).
import type {
  Area,
  BundleRaw,
  ComboUpgradeRow,
  DiceTypeDef,
  DieUpgradeRow,
  ItemDef,
  Species,
  Trainer,
  TypeChartRow,
  Region,
} from '@/engine/types'

export const TABLES = [
  'type_chart',
  'dice_types',
  'pokemon',
  'areas',
  'area_wild_pool',
  'trainers',
  'area_trainer_pool',
  'area_loot_pool',
  'combo_upgrades',
  'die_upgrades',
  'items',
  'game_config',
  'regions',
] as const
export type TableName = (typeof TABLES)[number]
export type Row = Record<string, unknown>
export type TableRows = Record<TableName, Row[]>

/** Primary key columns per table — used for upserts, deletes and dirty tracking in admin. */
export const PRIMARY_KEYS: Record<TableName, string[]> = {
  type_chart: ['attacking', 'defending'],
  dice_types: ['type'],
  pokemon: ['dex'],
  areas: ['id'],
  area_wild_pool: ['id'],
  trainers: ['id'],
  area_trainer_pool: ['id'],
  area_loot_pool: ['id'],
  combo_upgrades: ['combo_key', 'level'],
  die_upgrades: ['die_type', 'level'],
  items: ['key'],
  game_config: ['key'],
  regions: ['id'],
}

const num = (v: unknown) => (v === null || v === undefined ? v : Number(v)) as number

export function rowsToBundle(r: TableRows): BundleRaw {
  const wildBy = new Map<string, Area['wildPool']>()
  for (const w of r.area_wild_pool) {
    const list = wildBy.get(String(w.area_id)) ?? []
    list.push({
      id: String(w.id),
      dex: num(w.dex),
      weight: num(w.weight),
      minLevel: num(w.min_level),
      maxLevel: num(w.max_level),
    })
    wildBy.set(String(w.area_id), list)
  }
  const trainerBy = new Map<string, Area['trainerPool']>()
  for (const t of r.area_trainer_pool) {
    const list = trainerBy.get(String(t.area_id)) ?? []
    list.push({ id: String(t.id), trainerId: String(t.trainer_id), weight: num(t.weight) })
    trainerBy.set(String(t.area_id), list)
  }
  const lootBy = new Map<string, Area['lootPool']>()
  for (const l of r.area_loot_pool ?? []) {
    const list = lootBy.get(String(l.area_id)) ?? []
    list.push({
      id: String(l.id),
      itemKey: String(l.item_key),
      weight: num(l.weight),
      unique: !!l.unique_find,
      minQty: num(l.min_qty),
      maxQty: num(l.max_qty),
    })
    lootBy.set(String(l.area_id), list)
  }
  return {
    typeChart: r.type_chart.map((x): TypeChartRow => ({
      attacking: x.attacking as TypeChartRow['attacking'],
      defending: x.defending as TypeChartRow['defending'],
      multiplier: num(x.multiplier),
    })),
    diceTypes: r.dice_types.map((x): DiceTypeDef => ({
      type: x.type as DiceTypeDef['type'],
      label: String(x.label),
      color: String(x.color),
      faces: x.faces as DiceTypeDef['faces'],
      description: x.description == null ? '' : String(x.description),
      upgradeable: !!x.upgradeable,
      countsForMajority: !!x.counts_for_majority,
      sortOrder: num(x.sort_order),
    })),
    pokemon: r.pokemon.map((x): Species => ({
      dex: num(x.dex),
      name: String(x.name),
      type1: x.type1 as Species['type1'],
      type2: (x.type2 as Species['type2']) ?? null,
      baseHp: num(x.base_hp),
      maxHp: num(x.max_hp),
      speed: num(x.speed),
      spriteUrl: String(x.sprite_url),
      dice: x.dice as Species['dice'],
      rerolls: num(x.rerolls),
      catchValue: x.catch_value == null ? 5 : num(x.catch_value),
      evolutions: (x.evolutions as Species['evolutions']) ?? [],
      milestones: (x.milestones as Species['milestones']) ?? [],
      notes: (x.notes as string | null) ?? null,
    })),
    // A database from before regions has no rows here: compileGameData then falls back to Kanto alone.
    regions: (r.regions ?? []).map((x): Region => ({
      id: String(x.id),
      name: String(x.name),
      orderIndex: num(x.order_index),
      dexRange: x.dex_range as Region['dexRange'],
      starters: (x.starters as number[]) ?? [],
      starterLevel: num(x.starter_level ?? 5),
      leagueAreaId: String(x.league_area_id),
      nextRegion: (x.next_region as string | null) ?? null,
      enabled: x.enabled !== false,
    })),
    areas: r.areas.map((x): Area => ({
      id: String(x.id),
      orderIndex: num(x.order_index),
      regionId: (x.region_id as string | null) ?? 'kanto',
      name: String(x.name),
      bannerUrl: (x.banner_url as string | null) ?? null,
      roundsToClear: x.rounds_to_clear == null ? null : num(x.rounds_to_clear),
      minLevel: num(x.min_level),
      maxLevel: num(x.max_level),
      encounterWeights: x.encounter_weights as Area['encounterWeights'],
      backtrackMultiplier: num(x.backtrack_multiplier),
      legendaryBoss: (x.legendary_boss as Area['legendaryBoss']) ?? null,
      scalesToTeam: !!x.scales_to_team,
      // Only when set, so bundled areas without it round-trip unchanged.
      ...(x.scale_offsets != null && { scaleOffsets: x.scale_offsets as NonNullable<Area['scaleOffsets']> }),
      easyMode: !!x.easy_mode,
      enemyUpgradeLevel: x.enemy_upgrade_level == null ? null : num(x.enemy_upgrade_level),
      battleBackground: (x.battle_background as Area['battleBackground'] | undefined) ?? null,
      hidden: !!x.hidden,
      unlockConditions: (x.unlock_conditions as Area['unlockConditions']) ?? null,
      gyms: (x.gyms as string[] | null) ?? [],
      wildPool: wildBy.get(String(x.id)) ?? [],
      trainerPool: trainerBy.get(String(x.id)) ?? [],
      lootPool: lootBy.get(String(x.id)) ?? [],
    })),
    trainers: r.trainers.map((x): Trainer => ({
      id: String(x.id),
      name: String(x.name),
      spriteUrl: (x.sprite_url as string | null) ?? null,
      team: x.team as Trainer['team'],
      role: (x.role as Trainer['role'] | null) ?? 'trainer',
      badge: (x.badge as string | null) ?? null,
      upgradeLevel: x.upgrade_level == null ? null : num(x.upgrade_level),
      battleBackground: (x.battle_background as Trainer['battleBackground'] | undefined) ?? null,
      ...(x.rival_of != null && { rivalOf: num(x.rival_of) }),
      ...(Array.isArray(x.items) && x.items.length > 0 && { items: (x.items as unknown[]).map(String) }),
    })),
    upgrades: {
      combos: r.combo_upgrades.map((x): ComboUpgradeRow => ({
        comboKey: x.combo_key as ComboUpgradeRow['comboKey'],
        level: num(x.level),
        bonus: num(x.bonus),
        cost: num(x.cost),
      })),
      dice: r.die_upgrades.map((x): DieUpgradeRow => ({
        dieType: x.die_type as DieUpgradeRow['dieType'],
        level: num(x.level),
        bonus: num(x.bonus),
        cost: num(x.cost),
      })),
    },
    items: r.items.map((x): ItemDef => ({
      key: String(x.key),
      name: String(x.name),
      description: (x.description as string | null) ?? null,
      spriteUrl: (x.sprite_url as string | null) ?? null,
      price: num(x.price),
      effect: x.effect as ItemDef['effect'],
      inShop: x.in_shop == null ? true : !!x.in_shop,
      shopBadges: x.shop_badges == null ? 0 : num(x.shop_badges),
      // Only when set, so bundled items without them round-trip unchanged.
      ...(x.shop_area != null && { shopArea: String(x.shop_area) }),
      ...(x.region != null && { region: String(x.region) as ItemDef['region'] }),
      ...(x.once_only ? { unique: true } : {}),
    })),
    config: Object.fromEntries(r.game_config.map((x) => [String(x.key), x.value])),
  }
}

export function bundleToRows(b: BundleRaw): TableRows {
  return {
    type_chart: b.typeChart.map((x) => ({
      attacking: x.attacking,
      defending: x.defending,
      multiplier: x.multiplier,
    })),
    dice_types: b.diceTypes.map((x) => ({
      type: x.type,
      label: x.label,
      color: x.color,
      faces: x.faces,
      description: x.description,
      upgradeable: x.upgradeable,
      counts_for_majority: x.countsForMajority,
      sort_order: x.sortOrder,
    })),
    pokemon: b.pokemon.map((x) => ({
      dex: x.dex,
      name: x.name,
      type1: x.type1,
      type2: x.type2,
      base_hp: x.baseHp,
      max_hp: x.maxHp,
      speed: x.speed,
      sprite_url: x.spriteUrl,
      dice: x.dice,
      rerolls: x.rerolls,
      catch_value: x.catchValue,
      evolutions: x.evolutions,
      milestones: x.milestones,
      notes: x.notes ?? null,
    })),
    regions: (b.regions ?? []).map((x) => ({
      id: x.id,
      name: x.name,
      order_index: x.orderIndex,
      dex_range: x.dexRange,
      starters: x.starters,
      starter_level: x.starterLevel,
      league_area_id: x.leagueAreaId,
      next_region: x.nextRegion,
      enabled: x.enabled,
    })),
    areas: b.areas.map((x) => ({
      id: x.id,
      order_index: x.orderIndex,
      region_id: x.regionId ?? 'kanto',
      name: x.name,
      banner_url: x.bannerUrl,
      rounds_to_clear: x.roundsToClear,
      min_level: x.minLevel,
      max_level: x.maxLevel,
      encounter_weights: x.encounterWeights,
      backtrack_multiplier: x.backtrackMultiplier,
      legendary_boss: x.legendaryBoss,
      scales_to_team: x.scalesToTeam,
      scale_offsets: x.scaleOffsets ?? null,
      easy_mode: x.easyMode,
      enemy_upgrade_level: x.enemyUpgradeLevel,
      battle_background: x.battleBackground ?? null,
      hidden: x.hidden,
      unlock_conditions: x.unlockConditions,
      gyms: x.gyms,
    })),
    area_wild_pool: b.areas.flatMap((a) =>
      a.wildPool.map((w) => ({
        id: w.id,
        area_id: a.id,
        dex: w.dex,
        weight: w.weight,
        min_level: w.minLevel,
        max_level: w.maxLevel,
      })),
    ),
    trainers: b.trainers.map((x) => ({
      id: x.id,
      name: x.name,
      sprite_url: x.spriteUrl,
      team: x.team,
      role: x.role,
      badge: x.badge,
      upgrade_level: x.upgradeLevel,
      battle_background: x.battleBackground ?? null,
      rival_of: x.rivalOf ?? null,
      items: x.items ?? [],
    })),
    area_trainer_pool: b.areas.flatMap((a) =>
      a.trainerPool.map((t) => ({ id: t.id, area_id: a.id, trainer_id: t.trainerId, weight: t.weight })),
    ),
    area_loot_pool: b.areas.flatMap((a) =>
      (a.lootPool ?? []).map((l) => ({
        id: l.id,
        area_id: a.id,
        item_key: l.itemKey,
        weight: l.weight,
        unique_find: l.unique,
        min_qty: l.minQty,
        max_qty: l.maxQty,
      })),
    ),
    combo_upgrades: b.upgrades.combos.map((x) => ({
      combo_key: x.comboKey,
      level: x.level,
      bonus: x.bonus,
      cost: x.cost,
    })),
    die_upgrades: b.upgrades.dice.map((x) => ({
      die_type: x.dieType,
      level: x.level,
      bonus: x.bonus,
      cost: x.cost,
    })),
    items: b.items.map((x) => ({
      key: x.key,
      name: x.name,
      description: x.description,
      sprite_url: x.spriteUrl,
      price: x.price,
      effect: x.effect,
      in_shop: x.inShop ?? true,
      shop_badges: x.shopBadges ?? 0,
      shop_area: x.shopArea ?? null,
      region: x.region ?? null,
      once_only: x.unique ?? false,
    })),
    game_config: Object.entries(b.config).map(([key, value]) => ({ key, value })),
  }
}

/** Minimal sanity check before hot-swapping remote content in. */
export function isPlayableBundle(b: BundleRaw): boolean {
  return (
    b.pokemon.length > 0 &&
    b.areas.length > 0 &&
    b.diceTypes.length > 0 &&
    b.areas.some((a) => a.wildPool.length > 0) &&
    // Content from before rounds (v1.10) has no round counts: no area could ever clear.
    b.areas.some((a) => a.roundsToClear != null)
  )
}
