# Microsoft Store submission sheet (SPAN)

Every value to paste, in Partner Center order. Background and reasons: [MICROSOFT-STORE.md](MICROSOFT-STORE.md). All images must be PNG (Partner Center refuses JPEG): `npm run store:assets -- --png --out <dir> --only desktop,boxart,poster,trailerthumb` renders them, and `assets/icons/app/icon-512.png` scaled to 300 × 300 is the store logo.

## 1. Product identity → PWABuilder

PWABuilder (https://www.pwabuilder.com): enter `https://span.studio.umage.ai` → *Package for stores* → **Windows**.

| PWABuilder field | Value |
|---|---|
| Package ID | *Package/Identity/Name* from Partner Center → Product management → Product identity |
| Publisher ID | *Package/Identity/Publisher* (`CN=…`) from the same page |
| Publisher display name | *Package/Properties/PublisherDisplayName* from the same page |
| App name | SPAN: Bridge Builder |
| App version | `1.0.1` (the package's own number, not the game's; raise it for every new package) |
| Classic package version | `1.0.0` (lower than the app version) |
| Language | en-us |

Upload both files from the downloaded zip: the `.msixbundle` and the `.classic.appxbundle`.

**Restricted capability runFullTrust** (asked when the package is uploaded):

> This app is a Progressive Web App packaged with Microsoft's PWABuilder tool (https://www.pwabuilder.com). PWABuilder adds the runFullTrust capability to every Windows PWA package because the app runs on the Microsoft Edge (Chromium) runtime, which is a full-trust process. The app does not use the capability for anything else: there is no custom native code and no background process, it does not access the file system or other apps, and it does not install drivers or services. It only displays the web game https://span.studio.umage.ai in its own window. SPAN is a free, single-player puzzle game with no login, no ads and no purchases.

## 2. Pricing and availability

- Markets: all, **except Vietnam** (games there need a local licence; the same as Prismwright)
- Visibility: public
- Price: **Free**
- Release: as soon as it passes certification

## 3. Properties

| Field | Value |
|---|---|
| Category | Games → **Puzzle & trivia** |
| Privacy policy URL | https://studio.umage.ai/privacy/ |
| Website | https://studio.umage.ai/games/span/ |
| Support contact | https://umage.ai/contact (or the support email) |
| Terms of use (if asked) | https://studio.umage.ai/terms/ |

**Game settings** (shown on the listing):

| Option | Answer |
|---|---|
| Single player | **yes** |
| Online multiplayer | no |
| Local multiplayer | no |
| Online co-op | no |
| Local co-op | no |
| Cross-platform multiplayer | no |
| Supports broadcasting / Xbox features | no |

**Display mode:** leave **every box unchecked**: not Windows Mixed Reality or HoloLens (it is a normal 2D window), and no 4K, HDR or variable refresh rate claims (these are promises about video output that a web game does not make).

**Product declarations:**

| Declaration | Answer |
|---|---|
| Customers can install this app to alternate drives or removable storage | checked (default) |
| Windows can include this app's data in automatic backups to OneDrive | checked (default) |
| This app has been tested to meet accessibility guidelines | unchecked (no formal accessibility test) |
| This app depends on non-Microsoft drivers or NT services | unchecked |
| Any other declaration (in-app purchases, kids-directed, etc.) | unchecked |

**System requirements:**

| Item | Minimum | Recommended |
|---|---|---|
| Touch screen, Keyboard, Mouse | leave unchecked (mouse **or** touch works; ticking one as required would hide the app from devices without it) | Mouse (optional) |
| Camera, Microphone, NFC, Bluetooth, Telephony, Xbox controller, Mixed Reality | unchecked | unchecked |
| Memory | 2 GB | 4 GB |
| DirectX, Video memory, Processor, Graphics | leave empty | leave empty |

## 4. Age ratings (IARC)

Same answers as on Google Play ([PLAY-CONSOLE.md](PLAY-CONSOLE.md)): category *Puzzle*; vehicles can fall off a broken bridge into the water, but no people are shown and nobody is hurt; no fear, sexual content, bad language, drugs, alcohol, tobacco or gambling; users cannot interact or share content; no purchases; no location sharing; no personal data shared. Expected: **3+ / Everyone / PEGI 3**.

## 5. Store listing: English (United States)

| Field | Value |
|---|---|
| Product name | SPAN: Bridge Builder |
| Description | paste [msstore-description-en.txt](msstore-description-en.txt) |
| What's new | see below |
| Short description | Build bridges, test them with real physics, and don't drop the bus. |
| Screenshots (desktop) | `desktop-1.png` … `desktop-5.png` (1920 × 1080) |
| Store logo 1:1 (300 × 300) | `logo-300x300.png` (also `logo-512x512.png` if a larger one is asked for) |
| 1:1 box art (1080 × 1080) | `msstore-boxart-1x1.png` |
| 2:3 poster art (1440 × 2160) | `msstore-poster-2x3.png` |
| Trailer | `span-teaser-1080p.mp4`; title **SPAN: Bridge Builder – Teaser**; thumbnail `trailer-thumbnail-1920x1080.png` |
| Search terms (max 7) | bridge, physics, puzzle, engineering, construction, trains, builder |
| Copyright | © 2026 umage.ai ApS |
| Developed by | umage.ai Studio |

**What's new:**
```
Welcome to SPAN!
• 102 hand-made levels: roads, railways and 12 famous bridges
• A new Daily Challenge every day, plus an Endless mode
• Real physics: every member bends, stretches and can snap
• No ads, no purchases, no account
• English and Danish
```

**Product features** (one per line):
```
102 hand-made levels: roads, railways and famous bridges
Real physics: every member bends, stretches and can snap
Cars, buses, trains and 60-tonne haulers to carry
Iron Road: 20 railway bridges where a kink derails the train
Rebuild 12 real bridges, from the Pont du Gard to the Golden Gate
Forces of Nature: hurricanes and earthquakes
A new Daily Challenge every day, plus Endless mode
Stars and challenge stars for cheaper, smarter bridges
Undo, mirror mode and templates to learn from
Plays offline after the first start; no ads, no purchases, no account
English and Danish
```

## 6. Store listing: Danish (add language *da-dk*)

| Field | Value |
|---|---|
| Product name | SPAN: Bridge Builder |
| Description | paste [msstore-description-da.txt](msstore-description-da.txt) |
| Short description | Byg broer, test dem med ægte fysik – og tab ikke bussen. |
| Images, trailer | the same files as English (trailer title: **SPAN: Bridge Builder – Teaser**) |
| Search terms | bro, broer, fysik, puslespil, ingeniør, byggeri, tog |

**Hvad er nyt:**
```
Velkommen til SPAN!
• 102 håndlavede baner: veje, jernbaner og 12 berømte broer
• Dagens udfordring, ny hver dag, plus Endeløs
• Ægte fysik: hver bjælke bøjer, strækkes og kan knække
• Ingen reklamer, ingen køb, ingen konto
• På dansk og engelsk
```

**Produktfunktioner:**
```
102 håndlavede baner: veje, jernbaner og berømte broer
Ægte fysik: hver bjælke bøjer, strækkes og kan knække
Biler, busser, tog og 60-tons sættevogne skal over
Jernbanen: 20 jernbanebroer, hvor et knæk afsporer toget
Genopbyg 12 rigtige broer, fra Pont du Gard til Golden Gate
Naturens kræfter: orkaner og jordskælv
Dagens udfordring, ny hver dag, plus Endeløs
Stjerner og udfordringsstjerner for billigere, klogere broer
Fortryd, spejltilstand og skabeloner at lære af
Spilles offline efter første start; ingen reklamer, ingen køb, ingen konto
På dansk og engelsk
```

## 7. Submission options

Notes for certification:
```
A free puzzle game. It is a PWA packaged with PWABuilder (hosted at https://span.studio.umage.ai) and plays offline after the first start. No login, no purchases, no ads. runFullTrust is declared by PWABuilder for the Edge runtime only.
```
