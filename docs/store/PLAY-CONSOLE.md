# Google Play Console: what to enter

A checklist for publishing `ai.umage.span`, with suggested answers. The app facts behind them are in [../NATIVE.md](../NATIVE.md). Check the console's current wording when you fill this in, because Google changes these forms from time to time.

## Before you start (owner)

- [ ] **Developer account** ($25 one-time). An *organization* account (umage.ai, which needs a free D-U-N-S number) shows umage.ai as the developer and skips the closed-test rule. A *personal* account must first run a **closed test with at least 12 testers for 14 days in a row** before it can apply for production.
- [ ] **Upload key** and the four GitHub secrets (see NATIVE.md). Then publish a GitHub release, or run the *Android app* workflow, to get a signed `span-<version>.aab`.
- [ ] Create the app: name **SPAN: Bridge Builder**, default language English (United States), **Game**, **Free**.
- [ ] Turn on **Play App Signing**, and upload the AAB to *Internal testing* first.

## Store listing

| Field | Where |
|---|---|
| App name, short and full description | [listing-en.md](listing-en.md), [listing-da.md](listing-da.md) (add Danish as a translation) |
| App icon 512 × 512 | `screenshots/icon-512.png` |
| Feature graphic 1024 × 500 | `screenshots/feature-graphic.png` |
| Phone screenshots (2–8) | `screenshots/phone-*.png` |
| 7" and 10" tablet screenshots | `screenshots/tablet7-*.png`, `screenshots/tablet10-*.png` |
| Category | Game → Puzzle |
| Contact email | the address players and Google should use (required) |
| Website | https://umage-ai.github.io/SpanGame/ |
| Privacy policy | https://umage-ai.github.io/SpanGame/privacy.html |

## App content (Policy → App content)

| Form | Answer |
|---|---|
| **Privacy policy** | https://umage-ai.github.io/SpanGame/privacy.html |
| **Ads** | No, the app has no ads |
| **App access** | All functionality is available without special access (no login) |
| **Content rating** (IARC questionnaire) | Category *Game*. No violence against characters, no fear, sex, language, drugs or gambling. No user interaction or sharing, no purchases. Vehicles falling into water when a bridge fails is cartoon-style with no injury shown. Expect **Everyone / PEGI 3** |
| **Target audience** | Recommended: **13 and over** (or 13–15, 16–17, 18+). Choosing ages under 13 puts the app under the Families policy. SPAN meets it (no ads, no data), but the review is stricter and slower. You can add the younger groups later |
| **Data safety** | *Does your app collect or share any of the required user data types?* **No**. Encryption in transit: not applicable (no data sent). Account deletion: not applicable (no accounts). Note: Android's auto-backup of local progress is a system feature, not collection by the app |
| **Government app** | No |
| **Financial features** | None |
| **Health** | No health features |
| **News app** | No |

## Releases

1. **Internal testing:** upload the AAB, add yourself as a tester, install from the Play link, and play a few levels (back button, rotation, save export).
2. **Closed testing** (personal accounts: at least 12 testers, 14 days).
3. **Production:** apply for access if asked, roll out, and wait for review (a few days to about a week for a new app).
4. Every later release: bump `package.json`'s `version`, tag and publish the GitHub release. CI attaches the new AAB; upload it as a new production release.
