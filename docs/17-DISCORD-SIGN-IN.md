# Pokédice — Discord sign-in: setup guide

> **What this gives:** players can sign in with **Discord** as well as Google. Either one opens everything the cloud
> does: the cloud save, the leaderboard, Versus, Contact the developer and, once built, friends ([docs/16](16-FRIENDS-PLAN.md)).
>
> **Time:** about 15 minutes. **No new environment variable and no Netlify change:** the Discord secret lives in
> Supabase only. The game itself still only needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
>
> **When:** the game is ready for it (built 10 Oct 2026, docs/16 phase 0). It offers Discord as soon as parts 1–3 are
> done, and goes on offering Google alone until then. Part 4 checks the setup on its own; part 5 in the game.

## What you need

- The Supabase project from `/setup`, with Google sign-in already working.
- A Discord account with a **verified e-mail** (Discord → User Settings → My Account).
- Your Supabase project URL, `https://<project-ref>.supabase.co` (Supabase → Project Settings → API). Below,
  `<project-ref>` stands for yours.
- The game's logo as a PNG of at least 512 × 512 (export `public/favicon.svg`).

---

## 1. Discord Developer Portal: create the application

1. Open <https://discord.com/developers/applications> and sign in.
2. **New Application** → name it `Pokédice` → tick the Developer Terms of Service → **Create**.
3. **General Information**:
   - **App Icon**: upload the logo PNG.
   - **Description**: "A dice battler over the Pokémon, in a Game Boy Color look."
   - Optional: **Privacy Policy URL** and **Terms of Service URL**, if the site has them.
   - **Save Changes**.

The name and the icon are what players see on Discord's "Authorize" screen, so make them recognisable.

## 2. Discord: OAuth2 credentials and the redirect

1. Left menu → **OAuth2**.
2. Under **Client information**:
   - copy the **Client ID**;
   - **Client Secret** → **Reset Secret** → confirm (and type your 2FA code if your account asks) → **Copy**. Discord
     shows it once. If you lose it, reset it again and paste the new one into Supabase (step 3.2).
3. Under **Redirects** → **Add Redirect** → paste exactly:

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   → **Save Changes**.

   This is **Supabase's** callback, the same one Google uses. It is not the Netlify URL and not localhost. Discord
   compares it character for character: `https`, no trailing slash. (If Supabase Auth runs on a custom domain, use that
   domain's `/auth/v1/callback`.)
4. Leave **Public Client** off: Supabase keeps the secret on its side. No bot is needed, and no scopes to pick: the
   **OAuth2 URL Generator** isn't used. Supabase asks for `identify` and `email` itself.

> **The Client Secret never goes in the repository, `.env.local` or Netlify.** It goes in Supabase only.

## 3. Supabase: turn Discord on

1. Supabase dashboard → your project → **Authentication** → **Sign In / Providers**.
2. In the provider list → **Discord** → switch **Enable Sign in with Discord** on → paste the **Client ID** and the
   **Client Secret** → **Save**.
3. The same panel shows the **Callback URL (for OAuth)**. Check that it is exactly what you put in Discord at 2.3.
4. Same page, top section (**User Signups**) → switch **Allow manual linking** on → **Save**. That lets a player who
   already backs up with Google add Discord to the same account from Settings, and the reverse. Without it, linking
   fails with "Manual linking is disabled".
5. **Authentication → URL Configuration**: nothing new, Google needed the same. Check that it still has:
   - **Site URL**: your Netlify URL;
   - **Redirect URLs**: `https://<your-site>/**` and `http://localhost:5173/**` (`/setup`, step 6);
   - if you test on Netlify deploy previews, also `https://*--<site-name>.netlify.app/**`.

## 4. Check it works, before the game has a Discord button

The game signs in with PKCE, so this test goes around the game and only checks Discord ↔ Supabase.

1. In a private window, open (with your project ref, and your Netlify URL instead of localhost if you prefer):

   ```
   https://<project-ref>.supabase.co/auth/v1/authorize?provider=discord&redirect_to=http://localhost:5173/
   ```

2. Discord asks: **"Pokédice wants to access your account"**: your username, avatar and banner, and your e-mail
   address → **Authorize**.
3. You land back on the site with `#access_token=…` in the address bar. The page may not even load (no dev server
   running): the address bar is what matters. The game ignores this sign-in, because it expects its own PKCE flow.
   That is normal. Close the private window.
4. Supabase → **Authentication → Users**:
   - **Your Discord e-mail is your Google e-mail**: there is no new user. Your existing user now lists **discord**
     among its providers. Supabase links accounts with the same verified e-mail automatically, so you keep your save
     and your admin rights.
   - **A different e-mail**: there is a new user with provider **discord**. If it was only a test, delete it (row → `⋯`
     → **Delete user**). That is safe for a user with no save; deleting a user also deletes their save.
5. An error page instead? See [Troubleshooting](#troubleshooting).

## 5. In the game

- Title screen or trainer menu → **CONNECT** → **Continue with Discord** → **Authorize** → you are back in the game,
  signed in, and the save syncs as it does with Google.
- **Settings → Connected accounts** → **LINK** next to the provider you don't use yet → you come back with both listed.
- `/setup` → **Verify** shows "Discord sign-in is on". It reads Supabase's public auth settings.
- The CONNECT chooser only offers Discord while Supabase reports it on. The button never shows before parts 1–3 are
  done, and switching Discord off in Supabase hides it again.

---

## How accounts work with two ways in

For support questions, and for Admin → Messages.

| Situation | Result |
| --- | --- |
| The same verified e-mail on Google and on Discord | One account, one save, linked automatically the first time. |
| Different e-mails, linked from Settings | One account, one save. Either button signs in. |
| Different e-mails, never linked | **Two separate accounts**: two saves, and two places on the leaderboard. The game doesn't merge saves. |
| Linking a Discord account that already has its own Pokédice account | Refused ("Identity is already linked to another user"). The player keeps playing it with Discord alone, or you delete that user in Supabase (its save goes with it) and they link again. |
| Unlinking | Settings → **UNLINK**, only while both are linked: the last way in can't be removed. |
| What other players see | The in-game trainer name and look only. Never the Discord username, the Google name, an e-mail or a profile picture. |
| Admin rights | `is_admin()` checks the account's e-mail, whichever provider signed in. Supabase only takes an e-mail Discord reports as verified (for an unverified one it asks for a confirmation e-mail first), so a Discord account can carry the admin e-mail only if its owner controls that inbox. To stop depending on e-mails at all, pin `is_admin()` to your user id ([docs/16 §2.5](16-FRIENDS-PLAN.md#25-admin-rights)). |

---

## Troubleshooting

| What you see | Why, and the fix |
| --- | --- |
| Discord's page: **"Invalid OAuth2 redirect_uri"** | The redirect in Discord isn't Supabase's callback, character for character (2.3). |
| `Unsupported provider: provider is not enabled` | Discord isn't switched on and saved in Supabase (3.2). |
| Back on the site with `error_description=Error getting user email from external provider` | The Discord account has no verified e-mail. Discord → User Settings → My Account → verify it, then try again. |
| "Unverified email with discord", and a confirmation e-mail arrives | Same cause: confirm the e-mail, then sign in again. |
| `invalid_client`, or Discord sign-in stops working after it worked | The Client Secret was reset in Discord. Paste the new one into Supabase (3.2). |
| You land on the Site URL instead of the page you started from | That origin is missing from Authentication → URL Configuration → Redirect URLs (3.5). |
| "Manual linking is disabled" when linking in Settings | Switch on **Allow manual linking** (3.4). |
| "Identity is already linked to another user" | That Discord account already has its own Pokédice account: see the table above. |
| The game shows no Discord button | Either the build predates phase 0, or Supabase reports Discord off. `/setup` → Verify says which. |
