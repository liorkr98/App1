# Starting a new app

The template exists so that app #2 costs a day of setup, not a week. This is
the whole process.

---

## 1. Clone

From the template repo root:

```bash
npm run new-app -- --name "מתווך פרו" --slug broker-pro --bundle com.lior.brokerpro
```

Creates a sibling directory named after the slug. Add `--dir <path>` to put it
somewhere else.

**What the script does**

| Step | Detail |
|---|---|
| Copy | Everything except `node_modules`, `.git`, `.expo`, `ios`, `android`, `dist`, `coverage`, `package-lock.json` and **`.env`** |
| Identity | Rewrites the identity block at the top of `app.config.ts` — name, slug, scheme, bundle id, Android package. Clears `easProjectId`, resets version to `1.0.0` |
| package.json | `name` becomes the slug, version resets |
| Locales | Keeps only the shared namespaces (`common`, `errors`, `empty`, `language`, `auth`, `paywall`, `settings`); drops anything app-specific |
| Features | Empties `src/features/`, restoring only `settings` — every app needs the compliance screen |
| Routes | Removes the placeholder home route, adds a minimal `(tabs)` group. Keeps `(auth)`, `settings` and `_dev` |
| PRD | Writes a `PRD.md` stub |
| Git | Deletes history and makes one initial commit on `main` |

**`.env` is deliberately not copied.** The new app gets its own Supabase and
RevenueCat projects. Inheriting the template's credentials silently would be
much worse than an obviously missing file.

`_dev/kitchen-sink.tsx` is kept on purpose — it is how CLAUDE.md §4.6 gets
satisfied for each new app, and it is already gated behind `__DEV__`.

---

## 2. Manual steps

The script prints these too. None of them can be automated safely — they all
need credentials or decisions.

### Supabase
1. Create a project in **eu-central-1** (Frankfurt — closest region to Israel;
   ap-south-1 and us-east-1 both add noticeable latency).
2. Apply `supabase/migrations/` in order.
3. Deploy `supabase/functions/delete-account` with `verify_jwt` enabled.
4. Run the security advisor and clear every finding before writing any data.
5. Copy the project URL and the **publishable** key into `.env`.

### RevenueCat
1. Create a project, add the iOS and Android apps.
2. Create the entitlement, identifier exactly **`pro`** — the code reads that
   string (CLAUDE.md §6).
3. Create an offering with at least one package.
4. Copy the **public** SDK keys into `.env`. The secret key never goes near
   the client.

### Expo / EAS
1. Create the project on expo.dev.
2. Connect the GitHub repo.
3. Put the project id into `easProjectId` in `app.config.ts`.
4. Set the `EXPO_PUBLIC_*` values as EAS environment variables, and
   `SENTRY_AUTH_TOKEN` as an EAS **secret**.

### Apple
1. Create the App Store Connect record with the bundle id you passed to the
   script.
2. Enable **Sign in with Apple** on the identifier. If the app offers Google
   sign-in, Apple sign-in is mandatory (CLAUDE.md §7).
3. Create the subscription group and products, with Hebrew localisations.

### Sentry
1. Create a project, copy the DSN into `.env`.
2. Set `SENTRY_ORG` and `SENTRY_PROJECT` for the build so source maps upload.

### Legal
Replace the `example.com` URLs and `support@example.com` in `app.config.ts`.
They are placeholders precisely so that shipping them is obvious.

---

## 3. Verify

```bash
npm install
npm run typecheck
npm run lint
npm run test
```

If npm is blocked on your machine, push to GitHub and run the **Verify** EAS
workflow instead — it does the same three checks in Expo's cloud.

Then build a development client and open the kitchen sink on a **real device
in Hebrew**:

```bash
npm run build:preview
```

Look at every chevron, every price, every date. That check is the single
highest-value twenty minutes in a new app.

---

## 4. Write PRD.md

Before asking for any feature work. Claude Code reads `PRD.md` alongside
`CLAUDE.md` (CLAUDE.md §9), and a vague PRD produces vague code.

---

## 5. Before submitting

Work through `docs/STORE-CHECKLIST.md` in full. Everything marked
**REJECTION** in it has actually caused a rejection.
