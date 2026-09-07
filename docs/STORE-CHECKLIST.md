# Pre-submission checklist

Copy this into every new app and work through it before the first submission.
It is CLAUDE.md §7 turned into something you can tick off.

Anything marked **REJECTION** has actually caused App Review rejections. Those
are not judgement calls.

---

## 1. Account deletion — **REJECTION**

Apple rejects any app that lets you create an account but not delete one.

- [ ] Settings has a visible **Delete account** row, no more than two taps from
      the app's main screen.
- [ ] Two-step confirmation, in Hebrew, that says the deletion is permanent.
- [ ] The `delete-account` edge function is deployed to the app's own Supabase
      project, with `verify_jwt` enabled.
- [ ] **You have deleted a real test account end to end and confirmed in the
      SQL editor that the rows are gone**, not just the auth user:
      ```sql
      select count(*) from auth.users where id = '<test-user-id>';
      select count(*) from public.profiles where id = '<test-user-id>';
      -- both must return 0
      ```
- [ ] Every app-specific table either cascades from `auth.users` or is deleted
      explicitly inside the edge function. A table added later and forgotten
      here is a privacy failure.
- [ ] The confirmation copy tells the user their subscription is **not**
      cancelled by deleting the account.

## 2. Subscriptions — **REJECTION**

- [ ] **Restore Purchases** is present and works **without being signed in**.
- [ ] The paywall shows, for each package: price, period, and that it renews
      automatically.
- [ ] The paywall says how to cancel.
- [ ] Privacy Policy and Terms are linked from the paywall itself, not only
      from Settings.
- [ ] Sandbox tested: purchase, restore, cancel.
- [ ] **Airplane-mode tested: the app does NOT grant access** (CLAUDE.md §6).
- [ ] Entitlement identifier is `pro` and matches the RevenueCat dashboard.
- [ ] App Store Connect subscription group, localised Hebrew display name and
      description are filled in.

## 3. Privacy

- [ ] `ios.privacyManifests` in `app.json` matches what the app actually
      collects. It is generated into `PrivacyInfo.xcprivacy` at prebuild — do
      not hand-maintain a separate file, they drift.
- [ ] Every third-party SDK that needs one has its own manifest (RevenueCat,
      Sentry and Supabase ship theirs).
- [ ] App Store Connect privacy questionnaire agrees with the manifest.
      A mismatch is a rejection.
- [ ] **No App Tracking Transparency prompt unless the app actually tracks.**
      Default is no tracking, no prompt. Adding tracking means flipping
      `NSPrivacyTracking`, adding the domains, and adding the prompt — all
      three together, as a deliberate decision.

## 4. Legal and support

- [ ] Privacy Policy URL is live, in Hebrew, and reachable without login.
- [ ] Terms of Service URL is live, in Hebrew.
- [ ] Both are linked from Settings **and** the paywall.
- [ ] `appConfig.supportEmail` goes to an inbox a human reads.
- [ ] Placeholder URLs in `src/core/config/app.ts` have all been replaced.
      The template ships `example.com` on purpose so this is obvious.

## 5. Hebrew and RTL — CLAUDE.md §4.6

- [ ] Every screen checked on a **real device** in Hebrew, not a simulator in
      English.
- [ ] Each screen viewed with: a long Hebrew string, a mixed Hebrew+English
      string, a price, a phone number, and a date.
- [ ] Every directional icon flips; every object icon does not (§4.3).
- [ ] No text is clipped or overlapping at the largest system font size.
- [ ] App Store screenshots are **in Hebrew**.
- [ ] App Store metadata — name, subtitle, description, keywords — in Hebrew.

## 6. Sign in with Apple — **REJECTION**

- [ ] If the app offers **any** other social login (Google, Facebook), Sign in
      with Apple is present on iOS. This is not optional.
- [ ] The Apple capability is enabled on the bundle id in the Apple Developer
      portal.
- [ ] Apple is configured as a provider in the Supabase dashboard.

## 7. Data and security — CLAUDE.md §8

- [ ] **Every** table has RLS enabled with an explicit policy per operation.
      Verify with the Supabase security advisor, not by memory.
- [ ] The security advisor reports no unresolved findings.
- [ ] No `SECURITY DEFINER` function is callable by `anon` or `authenticated`
      unless that is deliberate.
- [ ] No service-role key, secret API key, or private credential appears in any
      `EXPO_PUBLIC_*` variable.
- [ ] Tokens are in `expo-secure-store`, never AsyncStorage.
- [ ] Sentry `beforeSend` scrubs PII, and this has been checked against a real
      captured event.

## 8. Build and release

- [ ] `app.json` version and build number are correct **and set by a human**
      (CLAUDE.md §9 — Claude does not touch these).
- [ ] Icon and splash screen are the app's own, not the template's.
- [ ] `npm run typecheck`, `npm run lint` and `npm run test` all pass.
- [ ] Production build installs and launches on a clean device.
- [ ] Sentry source maps uploaded for the build being submitted.
- [ ] TestFlight build tested by someone who is not you.

## 9. If the app is health-adjacent

- [ ] It logs and displays user-entered data only.
- [ ] It does not calculate dosage, diagnose, or recommend treatment.
- [ ] A Hebrew disclaimer is visible in the app, not buried in Settings.
