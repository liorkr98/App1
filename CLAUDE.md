# CLAUDE.md
Project instructions for Claude Code. Read this fully before writing any code.

---

## 1. What this repo is

This is the **base template** for a portfolio of Hebrew-first mobile apps.
Every new app starts as a clone of this repo. Therefore:

- Nothing in `src/core/` may contain app-specific logic.
- App-specific code lives only in `src/features/` and `src/app/`.
- If you find yourself editing `src/core/` for a single app's needs, stop and ask.

**Primary market:** Israel. **Primary language:** Hebrew. **Primary layout:** RTL.
English is a secondary locale, never the design baseline.

---

## 2. Stack — do not substitute

| Layer | Choice |
|---|---|
| Framework | React Native via **Expo (managed)** |
| Language | **TypeScript**, `strict: true` |
| Routing | **expo-router** (file-based) |
| Backend | **Supabase** (Postgres, Auth, Storage, RLS) |
| Subscriptions | **RevenueCat** |
| Server state | **TanStack Query** |
| Client state | **Zustand** — only when Query is not the right tool |
| i18n | **i18next** + `react-i18next` |
| Locale/RTL | **expo-localization** + `I18nManager` |
| Errors | **Sentry** (`@sentry/react-native`) |
| Storage | `expo-secure-store` for tokens, `react-native-mmkv` for cache |
| Build/ship | **EAS Build** + **EAS Submit** |

Do not introduce a new dependency without asking. Justify: what it does, size,
last publish date, and why the stack above cannot do it.

---

## 3. Directory structure

```
src/
  app/            # expo-router routes only. Thin. No business logic.
  core/           # SHARED ACROSS ALL APPS — treat as a library
    auth/
    billing/      # RevenueCat wrapper. See §6.
    i18n/
    ui/           # base components (see §5)
    supabase/
    analytics/
    config/
  features/       # app-specific. One folder per feature.
  types/
locales/
  he.json         # source of truth
  en.json
  ar.json         # optional
```

**Rule:** a file in `src/app/` should be under ~60 lines. If a screen grows,
the logic moves to `src/features/<name>/`.

---

## 4. RTL — the most important section in this file

Hebrew RTL bugs are the #1 quality problem in this portfolio. These rules are
not suggestions.

### 4.1 Never use directional properties

**Banned outright.** Never write any of these in a style object:

```
marginLeft   marginRight   paddingLeft   paddingRight
left         right         borderLeftWidth   borderRightWidth
textAlign: 'left'   textAlign: 'right'
```

**Use instead:**

```
marginStart  marginEnd  paddingStart  paddingEnd
start        end        borderStartWidth  borderEndWidth
textAlign: 'auto'   (or omit — 'auto' follows text direction)
```

If a lint rule for this does not exist yet, add it.

### 4.2 flexDirection

With RTL active, `flexDirection: 'row'` **already flips automatically**.
Do NOT write `I18nManager.isRTL ? 'row-reverse' : 'row'`. That double-flips
and is a bug. Use plain `'row'`.

The only legitimate use of `row-reverse` is when the visual order must be
opposite to the reading order for a specific design reason. Comment it.

### 4.3 Icons

Two categories. Get this right per icon, not globally.

**Must flip** — icons that express direction or progress:
back/forward chevrons, arrows, undo/redo, indent, send, next/previous,
progress indicators, trend lines that imply a timeline.

Use the shared helper:

```ts
import { flipForRTL } from '@/core/ui/rtl';
<Icon style={flipForRTL()} />   // { transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }
```

**Must NOT flip** — icons that are objects or universal symbols:
logos, brand marks, media play/pause, clocks, checkmarks, X, search
magnifier, hamburger, settings gear, camera, trash, heart, star,
numerals, phone.

When in doubt: does the icon depict a real object? Then it does not flip.

### 4.4 Numbers, dates, and mixed text

Numbers, prices, phone numbers, IDs, and Latin-script words inside Hebrew
sentences break bidi. Always render them through the shared helpers:

```ts
import { ltr, ils, heDate } from '@/core/i18n/format';
ltr('054-1234567')     // wraps in U+200E LRM
ils(1290)              // "₪1,290" with correct direction
heDate(new Date())     // Hebrew locale, dd/MM/yyyy
```

Never string-concatenate a number into a translated sentence. Use i18next
interpolation so the formatter runs:

```ts
t('cart.total', { amount: ils(total) })   // correct
`סה"כ ${total} ₪`                          // wrong — will break
```

### 4.5 Enabling RTL

RTL is forced at app start in `src/core/i18n/rtl.ts` via
`I18nManager.allowRTL(true)` + `I18nManager.forceRTL(true)`.
This requires a reload to take effect — that reload is handled once on first
launch. **Do not call `forceRTL` anywhere else.**

### 4.6 Definition of done for any screen

A screen is not finished until it has been checked in Hebrew RTL with:
long Hebrew strings, a mixed Hebrew+English string, a price, a phone number,
and a date. Screenshots in Hebrew, not English.

---

## 5. Hebrew typography and UI

- **Fonts:** Assistant (default), Rubik or Heebo as alternates. Loaded via
  `expo-font`. Never rely on system default — it renders Hebrew badly on Android.
- **Line height:** Hebrew needs more than Latin. Minimum `1.5×` font size.
  Hebrew has no ascenders/descenders like Latin, so tight leading looks cramped.
- **No italics.** Hebrew has no italic form; synthetic italics look broken.
  Use weight or color for emphasis.
- **No all-caps.** Hebrew has no case. Never `textTransform: 'uppercase'`.
- **Letter-spacing:** do not apply positive tracking to Hebrew text.
- **Truncation:** test with real Hebrew — it is typically ~15% shorter than
  English for the same content, so English-designed layouts leave gaps.

All base components live in `src/core/ui/`: `Text`, `Screen`, `Button`,
`Input`, `Sheet`, `ListRow`, `Empty`, `Loading`, `ErrorState`.

**Never use bare `<Text>` from react-native** — always the wrapper, which
carries font, line-height, and direction defaults.

---

## 6. Billing — read carefully, this is the money

**You may scaffold. You may not decide entitlement.**

Allowed for you to write:
- Paywall UI and copy
- RevenueCat SDK initialization
- Offering/package fetching and display
- Purchase and restore button wiring
- Loading and error states

**Requires explicit human review before merge** (flag it in your summary):
- Any code that reads `customerInfo.entitlements` and decides what the user can access
- Trial eligibility logic
- Grace period, billing retry, or expiration handling
- Anything that grants access when a network call fails

Rules:
- The entitlement identifier is `pro`. One entitlement per app.
- **Fail closed.** If entitlement state is unknown, treat as not subscribed.
  Never default to granting access.
- Never cache entitlement state to disk and trust it on next launch.
- A **Restore Purchases** button is mandatory and must be reachable without login.
- Never write custom receipt validation. RevenueCat owns that.

---

## 7. Store compliance — build these in from day one

Every app in this portfolio must ship with:

- [ ] **In-app account deletion**, reachable from Settings, that actually deletes
      server-side data. Apple rejects without this. Non-negotiable.
- [ ] Privacy Policy and Terms URLs, live, in Hebrew, linked from Settings.
- [ ] `PrivacyInfo.xcprivacy` privacy manifest, accurate.
- [ ] App Tracking Transparency prompt **only if** tracking actually happens.
      Default: no tracking, no prompt.
- [ ] Restore Purchases (see §6).
- [ ] Subscription terms shown on the paywall: price, period, auto-renewal,
      and how to cancel. Apple checks this.
- [ ] A support email that a human reads.
- [ ] Hebrew App Store metadata and Hebrew screenshots.

If a health-adjacent app: it logs and displays user-entered data only. It does
not calculate dosage, diagnose, or recommend treatment. Disclaimer required.

---

## 8. Data and security

- **RLS is mandatory** on every Supabase table. No exceptions, no "we'll add it
  later". A table without a policy is a data leak.
- Never put secrets in the client bundle. `EXPO_PUBLIC_*` vars are public —
  treat them as visible to anyone.
- Tokens go in `expo-secure-store`, never AsyncStorage.
- Health, financial, and children's data: minimize collection, encrypt at rest,
  never send to third-party analytics.
- Never log PII to Sentry. Scrub before send.

---

## 9. How to work

1. **Read `PRD.md` first** if one exists in the repo root.
2. **Plan before coding.** For anything beyond a single file, state the plan and
   the files you will touch, then wait for confirmation.
3. **One feature per branch.** Small, reviewable commits. Conventional commits.
4. **Verify before claiming done.** Run `npm run typecheck` and `npm run lint`.
   Do not report success on code you have not type-checked.
5. **Never** run `eas submit`, modify `app.json` version/build numbers, touch
   `.env`, or force-push. Ask.
6. If a requirement is ambiguous, ask one question. Do not guess and build.

---

## 10. Never do these

- Write `marginLeft` / `paddingRight` / `textAlign: 'left'` (§4.1)
- Write `I18nManager.isRTL ? 'row-reverse' : 'row'` (§4.2)
- Hardcode a user-facing string outside `locales/` — Hebrew or English
- Use bare `<Text>` from react-native instead of `@/core/ui/Text`
- Create a Supabase table without an RLS policy
- Decide subscription entitlement without human review (§6)
- Add a dependency without asking
- Put app-specific logic in `src/core/`
- Ship a screen you have not viewed in Hebrew
- Claim a task is complete without running typecheck and lint

---

## 11. Commands

```bash
npm run start          # expo start
npm run ios            # local iOS
npm run android        # local Android
npm run typecheck      # tsc --noEmit
npm run lint           # eslint, includes RTL rules
npm run test           # jest
npm run build:preview  # eas build --profile preview
```
