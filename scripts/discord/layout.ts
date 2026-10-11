// The Pokédice Discord server as it should be (docs/22-DISCORD-SERVER.md): roles, categories, channels and their
// permissions, the server's safety settings, AutoMod, the Channels & Roles questions, the welcome and rules posts, and
// the webhooks the daily raid and the patch notes post through. `pnpm discord` compares the live server with this
// and lists the differences; `pnpm discord --apply` makes them. Edit this file to change the server, then run both.
//
// Matching: an existing role, category or channel counts as one of these when its name matches the name or an alias,
// ignoring case, accents, emoji and separators ("🎲・Général" matches "🎲-general"). A match takes the layout's exact
// name, emoji included (the user's rule: layout names, always an emoji in front). Nothing is ever deleted.
import { bits, type PermName } from './perms'

export const SITE = 'https://poke-dice.netlify.app'

export const COLORS = {
  ink: 0x24304f,
  gold: 0xffbe2e,
  red: 0xf2553f,
  green: 0x34c97a,
  sky: 0x4aa3df,
} as const

export type RoleKey = 'professor' | 'gymLeader' | 'raidPings' | 'patchPings' | 'eventPings'
/** Whom an overwrite is for: everyone, or one of the layout's roles. */
export type Who = 'everyone' | RoleKey

export interface RoleSpec {
  key: RoleKey
  name: string
  aliases?: string[]
  permissions: bigint
  color: number
  /** Listed apart in the member list. */
  hoist: boolean
  /** Anyone may @mention it. */
  mentionable: boolean
}

export interface OverwriteSpec {
  who: Who
  allow?: bigint
  deny?: bigint
}

export interface TagSpec {
  name: string
  emoji?: string
  /** Only moderators can put it on a post: a status, not a topic. */
  moderated?: boolean
}

export type ChannelKind = 'text' | 'announcement' | 'forum' | 'voice'

export interface ChannelSpec {
  key: string
  name: string
  kind: ChannelKind
  aliases?: string[]
  /** A text channel's topic; a forum's post guidelines. */
  topic?: string
  /** Seconds between two messages of one member. */
  slowmode?: number
  /** Voice: how many may join at once. */
  userLimit?: number
  /** Replace the category's overwrites for this channel (otherwise it stays synced with its category). */
  overwrites?: OverwriteSpec[]
  tags?: TagSpec[]
  defaultReaction?: string
  sort?: 'activity' | 'created'
  forumLayout?: 'list' | 'gallery'
  /** Shown to every new member (Onboarding's default channels). Opt-in channels say false. */
  onboardingDefault?: boolean
}

export interface CategorySpec {
  key: string
  name: string
  aliases?: string[]
  overwrites: OverwriteSpec[]
  channels: ChannelSpec[]
}

export interface MessageSpec {
  channel: string
  /** Leave it out while someone else has posted in the channel (your own rules stay the only rules). */
  onlyIfEmpty?: boolean
  /** Embeds in Discord's shape; `{#key}` becomes a channel mention, `{@&key}` a role mention. */
  embeds: {
    title: string
    description: string
    color: number
    fields?: { name: string; value: string; inline?: boolean }[]
    footer?: string
  }[]
}

export interface AutomodSpec {
  name: string
  /** 1 keyword, 3 spam, 4 keyword preset, 5 mention spam. */
  trigger: 1 | 3 | 4 | 5
  metadata?: Record<string, unknown>
  /** Mute the author this long, on top of blocking and alerting (keyword and mention rules only). */
  timeoutSeconds?: number
}

export interface PromptSpec {
  title: string
  options: { title: string; description?: string; emoji?: string; roles?: RoleKey[]; channels?: string[] }[]
}

export interface Layout {
  /** What every member may do anywhere unless a channel says otherwise (the @everyone role). */
  everyone: bigint
  roles: RoleSpec[]
  categories: CategorySpec[]
  /** Where `--archive-unmanaged` moves the channels this layout doesn't know: read-only, at the bottom. */
  archive: CategorySpec
  guild: {
    /** 0 none · 1 verified e-mail · 2 + on Discord for 5 minutes · 3 + member for 10 minutes · 4 verified phone. */
    verificationLevel: number
    /** 0 off · 1 members without roles · 2 everyone. */
    explicitContentFilter: number
    /** 0 all messages · 1 mentions only. */
    defaultNotifications: number
    /** Discord's own messages (joins, boosts) go here. */
    systemChannel: string
    /** Bits: 1 no join messages · 2 no boost messages · 4 no setup tips · 8 no "wave" button on joins. */
    systemChannelFlags: number
    rulesChannel: string
    updatesChannel: string
    safetyChannel: string
    description: string
  }
  automod: AutomodSpec[]
  /** Exempt from AutoMod's spam rules. */
  automodExempt: RoleKey[]
  /** Where AutoMod reports what it blocked. */
  automodAlerts: string
  onboarding: PromptSpec[]
  messages: MessageSpec[]
  /** Webhooks to make, and the .env.discord line their URL is written to. */
  webhooks: { channel: string; name: string; env: string }[]
  /** The role ids worth keeping in .env.discord, for the posters' pings. */
  roleEnv: Partial<Record<RoleKey, string>>
}

// ---------------------------------------------------------------------------------------------------------------------

const MEMBER: PermName[] = [
  'CREATE_INSTANT_INVITE',
  'CHANGE_NICKNAME',
  'VIEW_CHANNEL',
  'SEND_MESSAGES',
  'SEND_MESSAGES_IN_THREADS',
  'CREATE_PUBLIC_THREADS',
  'EMBED_LINKS',
  'ATTACH_FILES',
  'ADD_REACTIONS',
  'USE_EXTERNAL_EMOJIS',
  'USE_EXTERNAL_STICKERS',
  'READ_MESSAGE_HISTORY',
  'USE_APPLICATION_COMMANDS',
  'USE_EXTERNAL_APPS',
  'SEND_VOICE_MESSAGES',
  'SEND_POLLS',
  'CONNECT',
  'SPEAK',
  'STREAM',
  'USE_VAD',
  'USE_EMBEDDED_ACTIVITIES',
  'USE_SOUNDBOARD',
  'USE_EXTERNAL_SOUNDS',
  'REQUEST_TO_SPEAK',
]

const MODERATOR: PermName[] = [
  'KICK_MEMBERS',
  'BAN_MEMBERS',
  'MODERATE_MEMBERS',
  'MANAGE_MESSAGES',
  'MANAGE_THREADS',
  'MANAGE_NICKNAMES',
  'VIEW_AUDIT_LOG',
  'MUTE_MEMBERS',
  'DEAFEN_MEMBERS',
  'MOVE_MEMBERS',
  'MENTION_EVERYONE',
]

/** Members read and react; only the staff (and the webhooks) post. */
const READ_ONLY: OverwriteSpec[] = [
  { who: 'everyone', deny: bits('SEND_MESSAGES', 'SEND_MESSAGES_IN_THREADS', 'CREATE_PUBLIC_THREADS', 'CREATE_PRIVATE_THREADS') },
  { who: 'gymLeader', allow: bits('SEND_MESSAGES', 'SEND_MESSAGES_IN_THREADS') },
]

const STAFF_ONLY: OverwriteSpec[] = [
  { who: 'everyone', deny: bits('VIEW_CHANNEL') },
  { who: 'gymLeader', allow: bits('VIEW_CHANNEL') },
]

export const LAYOUT: Layout = {
  everyone: bits(...MEMBER),

  roles: [
    {
      key: 'professor',
      name: 'Professor',
      aliases: ['admin', 'administrator', 'administrateur', 'owner', 'dev', 'developer'],
      permissions: bits('ADMINISTRATOR'),
      color: COLORS.gold,
      hoist: true,
      mentionable: false,
    },
    {
      key: 'gymLeader',
      name: 'Gym Leader',
      aliases: ['moderator', 'moderateur', 'mod', 'mods', 'staff'],
      permissions: bits(...MODERATOR),
      color: COLORS.green,
      hoist: true,
      mentionable: true,
    },
    { key: 'raidPings', name: 'Raid Pings', permissions: 0n, color: 0, hoist: false, mentionable: false },
    { key: 'patchPings', name: 'Patch Notes Pings', permissions: 0n, color: 0, hoist: false, mentionable: false },
    { key: 'eventPings', name: 'Event Pings', permissions: 0n, color: 0, hoist: false, mentionable: false },
  ],

  categories: [
    {
      key: 'start',
      name: 'Start here',
      aliases: ['information', 'informations', 'info', 'infos', 'welcome', 'bienvenue'],
      overwrites: READ_ONLY,
      channels: [
        {
          key: 'welcome',
          name: '👋-welcome',
          kind: 'text',
          aliases: ['start-here', 'bienvenue', 'accueil', 'info', 'infos', 'information', 'informations'],
          topic: 'Start here: what Pokédice is, where to play it, and how to pick your pings.',
        },
        {
          key: 'rules',
          name: '📜-rules',
          kind: 'text',
          aliases: ['regles', 'reglement', 'server-rules'],
          topic: 'The server rules. Breaking them can get your messages removed, or you muted.',
        },
        {
          key: 'announcements',
          name: '📣-announcements',
          kind: 'announcement',
          aliases: ['annonces', 'news', 'announcement', 'annonce'],
          topic: 'News from the developer: big updates, events and maintenance. Get Event Pings in Channels & Roles.',
        },
        {
          key: 'patchNotes',
          name: '📝-patch-notes',
          kind: 'announcement',
          aliases: ['changelog', 'updates', 'patchnotes', 'mises-a-jour', 'maj'],
          topic: 'What changed in each update, posted automatically once it is live. Get Patch Notes Pings in Channels & Roles.',
        },
        {
          key: 'dailyRaid',
          name: '🔥-daily-raid',
          kind: 'announcement',
          aliases: ['raids', 'raid', 'raid-du-jour'],
          topic: "Today's raid Pokémon, posted at 00:00 UTC every day. Get Raid Pings in Channels & Roles.",
        },
      ],
    },
    {
      key: 'game',
      name: 'Pokédice',
      aliases: ['text-channels', 'salons-textuels', 'community', 'communaute', 'general', 'chat', 'discussion'],
      overwrites: [],
      channels: [
        {
          key: 'general',
          name: '🎲-general',
          kind: 'text',
          aliases: ['chat', 'general-chat', 'discussion', 'discussions', 'blabla'],
          topic: 'Talk about Pokédice and anything Pokémon, in English. French speakers have their own channel too.',
        },
        {
          key: 'help',
          name: '🙋-help',
          kind: 'forum',
          aliases: ['aide', 'questions', 'support', 'faq'],
          topic:
            'Ask how something works: one question per post, with a tag. Someone who knows will answer, and the post stays ' +
            'for the next player with the same question. Something broken? That goes in the bug reports forum.',
          tags: [
            { name: 'Battles', emoji: '⚔️' },
            { name: 'Catching', emoji: '🎯' },
            { name: 'Dice & upgrades', emoji: '🎲' },
            { name: 'Raids & events', emoji: '🔥' },
            { name: 'Account & saves', emoji: '💾' },
            { name: 'Answered', emoji: '✅', moderated: true },
          ],
          sort: 'activity',
          forumLayout: 'list',
        },
        {
          key: 'strategy',
          name: '🧠-strategy',
          kind: 'text',
          aliases: ['strategie', 'teams', 'team-building'],
          topic: 'Teams, dice upgrades, type coverage, and how to get past that one gym.',
        },
        {
          key: 'raidSquad',
          name: '🫂-raid-squad',
          kind: 'text',
          aliases: ['codes-ami', 'code-ami', 'find-friends', 'friend-codes', 'friends', 'amis', 'lfg'],
          topic:
            'Find raid partners: post your trainer name, add each other as friends in the game, and bring your teams to ' +
            "each other's raids.",
          slowmode: 30,
        },
        {
          key: 'showOff',
          name: '✨-show-off',
          kind: 'text',
          aliases: ['screenshots', 'captures', 'shinies', 'shiny', 'showcase', 'media'],
          topic: 'Shinies, legendaries, a finished Pokédex, a lucky roll: show it here. Screenshots welcome.',
        },
        {
          key: 'offTopic',
          name: '💬-off-topic',
          kind: 'text',
          aliases: ['flood', 'hors-sujet', 'random', 'offtopic'],
          topic: "Anything that isn't Pokédice.",
        },
        {
          key: 'fr',
          name: '🥖-français',
          kind: 'text',
          aliases: ['french-only', 'french', 'francais-only', 'fr'],
          topic: 'Discussion en français.',
          onboardingDefault: false,
        },
      ],
    },
    {
      key: 'feedback',
      name: 'Feedback',
      aliases: ['retours', 'support'],
      overwrites: [],
      channels: [
        {
          key: 'bugs',
          name: '🐛-bug-reports',
          kind: 'forum',
          aliases: ['bugs', 'bug', 'bug-report', 'signalements'],
          topic:
            'One bug per post. Say what you did, what happened and what you expected, your device and browser, and add a ' +
            'screenshot if you can. In the game, Settings → Contact the developer reaches the developer too.',
          tags: [
            { name: 'Battle', emoji: '⚔️' },
            { name: 'Catching', emoji: '🎯' },
            { name: 'Raids & events', emoji: '🔥' },
            { name: 'Save & sync', emoji: '💾' },
            { name: 'Display', emoji: '🖼️' },
            { name: 'Phone', emoji: '📱' },
            { name: 'Translation', emoji: '🌍' },
            { name: 'Confirmed', emoji: '🔎', moderated: true },
            { name: 'Fixed', emoji: '✅', moderated: true },
            { name: "Can't reproduce", emoji: '❔', moderated: true },
          ],
          sort: 'created',
          forumLayout: 'list',
        },
        {
          key: 'ideas',
          name: '💡-suggestions',
          kind: 'forum',
          aliases: ['ideas', 'idees', 'feedback', 'suggestion'],
          topic: 'One idea per post, with a tag. Like an idea? React 👍 on its first message: that is how ideas get counted.',
          tags: [
            { name: 'Gameplay', emoji: '🎮' },
            { name: 'Balance', emoji: '⚖️' },
            { name: 'Regions & Pokémon', emoji: '🗺️' },
            { name: 'Events', emoji: '🔥' },
            { name: 'Interface', emoji: '🖼️' },
            { name: 'Planned', emoji: '📌', moderated: true },
            { name: 'Done', emoji: '✅', moderated: true },
            { name: 'Not planned', emoji: '🚫', moderated: true },
          ],
          defaultReaction: '👍',
          sort: 'activity',
          forumLayout: 'list',
        },
      ],
    },
    {
      key: 'voice',
      name: 'Voice',
      aliases: ['voice-channels', 'salons-vocaux', 'vocal', 'vocaux'],
      overwrites: [],
      channels: [
        { key: 'lounge', name: '🎧 Lounge', kind: 'voice', aliases: ['general', 'salon', 'vocal'] },
        { key: 'raidRoom', name: '🐉 Raid Room', kind: 'voice', userLimit: 3 },
      ],
    },
    {
      key: 'staff',
      name: 'Staff',
      aliases: ['moderation', 'mods', 'admin', 'staff-only'],
      overwrites: STAFF_ONLY,
      channels: [
        { key: 'staffChat', name: '🔒-staff-chat', kind: 'text', aliases: ['staff', 'mods', 'moderation'], onboardingDefault: false },
        {
          key: 'modUpdates',
          name: '📬-mod-updates',
          kind: 'text',
          aliases: ['moderator-only', 'community-updates'],
          topic: "Discord's notices for Community servers.",
          onboardingDefault: false,
        },
        {
          key: 'modLog',
          name: '📋-mod-log',
          kind: 'text',
          aliases: ['logs', 'log', 'automod'],
          topic: 'What AutoMod blocked, and Discord safety alerts.',
          onboardingDefault: false,
        },
      ],
    },
  ],

  archive: {
    key: 'archive',
    name: 'Archive',
    aliases: ['archives'],
    overwrites: [{ who: 'everyone', deny: bits('SEND_MESSAGES', 'SEND_MESSAGES_IN_THREADS', 'CREATE_PUBLIC_THREADS', 'ADD_REACTIONS', 'CONNECT') }],
    channels: [],
  },

  guild: {
    verificationLevel: 2,
    explicitContentFilter: 2,
    defaultNotifications: 1,
    systemChannel: 'general',
    systemChannelFlags: 4 | 8,
    rulesChannel: 'rules',
    updatesChannel: 'modUpdates',
    safetyChannel: 'modLog',
    description: 'The community of Pokédice, a free fan-made Pokémon dice battler: raids, help, strategy and news.',
  },

  automod: [
    { name: 'Block spam', trigger: 3 },
    { name: 'Block mention spam', trigger: 5, metadata: { mention_total_limit: 5, mention_raid_protection_enabled: true }, timeoutSeconds: 600 },
    // 1 profanity · 2 sexual content · 3 slurs. Profanity is left out: its lists are English-only and catch banter.
    { name: 'Block flagged words', trigger: 4, metadata: { presets: [2, 3], allow_list: [] } },
  ],
  automodExempt: ['professor', 'gymLeader'],
  automodAlerts: 'modLog',

  onboarding: [
    {
      title: 'What should we ping you about?',
      options: [
        { title: 'The daily raid', description: "Today's raid Pokémon, every day at 00:00 UTC", emoji: '🔥', roles: ['raidPings'] },
        { title: 'Patch notes', description: 'Each update, once it is live', emoji: '📝', roles: ['patchPings'] },
        { title: 'Events', description: 'Live events, special raids and big news', emoji: '🎉', roles: ['eventPings'] },
      ],
    },
    {
      title: 'Do you speak French?',
      options: [{ title: 'Français', description: 'Le salon pour parler en français', emoji: '🥖', channels: ['fr'] }],
    },
  ],

  messages: [
    {
      channel: 'welcome',
      embeds: [
        {
          title: 'Welcome to Pokédice!',
          color: COLORS.gold,
          description:
            'Pokédice is a free, fan-made Pokémon dice battler you play in your browser: build a team, roll its type ' +
            'dice, catch them all region after region, and take on the daily raid with your friends.\n\n' +
            `**[Play now: ${SITE.replace('https://', '')}](${SITE})**`,
          fields: [
            { name: 'Start here', value: '{#rules} the rules\n{#announcements} news\n{#patchNotes} what each update changed\n{#dailyRaid} today\'s raid' },
            { name: 'Talk', value: '{#general} chat\n{#help} questions\n{#strategy} teams and dice\n{#raidSquad} find raid partners\n{#showOff} your best catches\n{#offTopic} anything else' },
            { name: 'Feedback', value: '{#bugs} something broke\n{#ideas} ideas and votes' },
            {
              name: 'Pings and languages',
              value: 'Open **Channels & Roles** at the top of the channel list to get pinged for raids, patch notes or events, and to join the French channel.',
            },
          ],
          footer: 'Pokédice is a non-commercial fan project, not affiliated with Nintendo, Game Freak, Creatures or The Pokémon Company.',
        },
      ],
    },
    {
      channel: 'rules',
      onlyIfEmpty: true,
      embeds: [
        {
          title: 'Rules',
          color: COLORS.red,
          description: [
            '**1. Be kind.** No harassment, hate or personal attacks. Disagree with ideas, not people.',
            '**2. Keep it family-friendly.** No NSFW, gore or slurs, in names and avatars too.',
            "**3. No spam or advertising.** No ads, invite links or DM advertising without a Gym Leader's OK.",
            '**4. Use the right channel.** Questions in {#help}, bugs in {#bugs}, ideas in {#ideas}.',
            '**5. Mark spoilers.** Late-game surprises go in ||spoiler tags|| outside {#strategy}.',
            '**6. Report exploits privately.** Found a way to cheat the leaderboard? Tell a Gym Leader or use Settings → Contact the developer, instead of posting it.',
            "**7. No ROMs or piracy.** Pokémon belongs to Nintendo; don't share ROMs or pirated games.",
            '**8. Follow Discord\'s rules:** the [Terms of Service](https://discord.com/terms) and the [Community Guidelines](https://discord.com/guidelines).',
          ].join('\n\n'),
          footer: 'Gym Leaders (the moderators) may remove messages, or mute or ban members, who break these rules.',
        },
      ],
    },
  ],

  webhooks: [
    { channel: 'dailyRaid', name: 'Pokédice Raids', env: 'DISCORD_RAID_WEBHOOK' },
    { channel: 'patchNotes', name: 'Pokédice Patch Notes', env: 'DISCORD_PATCH_WEBHOOK' },
  ],
  roleEnv: { raidPings: 'DISCORD_RAID_ROLE', patchPings: 'DISCORD_PATCH_ROLE', eventPings: 'DISCORD_EVENT_ROLE' },
}
