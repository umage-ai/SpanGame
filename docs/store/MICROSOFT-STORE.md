# Microsoft Store: what to do and what to enter

SPAN goes into the Microsoft Store as a **PWA package**. Microsoft's free tool [PWABuilder](https://www.pwabuilder.com) makes a small Windows package that opens the live web game (https://span.studio.umage.ai) in its own window with Edge. There is no second build and nothing new in this repository:

- **Updates are automatic.** Every production deploy (a published GitHub release) updates the Store app too, because it runs the hosted game. The service worker makes it work offline after the first start.
- **Repackage only** when the name, the icon or `manifest.webmanifest` changes. Then upload a new package with a higher package version.
- **Saves** are the browser storage of `span.studio.umage.ai`. Never move the game to another domain, or Store players lose their progress (the same rule as the Android app's fixed origin).

Check the Partner Center's current wording when you fill this in; Microsoft changes these forms from time to time.

## Once: the developer account

- [ ] Use the umage.ai developer account already made for Prismwright (umage.ai Studio's other game), or sign up at https://storedeveloper.microsoft.com (individual accounts are free; a company account needs the company's details and verification).
- [ ] In [Partner Center](https://partner.microsoft.com/dashboard) → *Apps and games* → *New product* → *MSIX or PWA app*, **reserve the name** "SPAN: Bridge Builder" (or "SPAN – Bridge Builder" if the colon is refused).
- [ ] Open the new app → *Product management* → **Product identity**. Keep the page open: PWABuilder needs three values from it: *Package/Identity/Name*, *Package/Identity/Publisher* (`CN=…`) and *Package/Properties/PublisherDisplayName*.

## The package (PWABuilder)

1. Go to https://www.pwabuilder.com, enter `https://span.studio.umage.ai` and start. Its report card should show the manifest, the service worker and the icons as present. Warnings about optional extras (manifest screenshots, shortcuts, window controls) can be ignored.
2. *Package for stores* → **Windows** → *Generate package*. Fill in:

   | Field | Value |
   |---|---|
   | Package ID | *Package/Identity/Name* from Product identity |
   | Publisher display name | *PublisherDisplayName* from Product identity |
   | Publisher ID | *Package/Identity/Publisher* (`CN=…`) from Product identity |
   | App version | the game's version with `.0`, e.g. `1.5.2.0`. Every upload needs a higher version |
   | Classic package version | lower than the app version, e.g. `1.5.1.0` (for older Windows 10) |
   | Language | en-us |

3. Download the zip. It holds a `.msixbundle`, a `.classic.appxbundle` and instructions. Keep it with the release (it is not in the repository).

## Submission (Partner Center → the app → *Start your submission*)

| Section | Answer |
|---|---|
| **Pricing and availability** | Free. Markets: all, as on Google Play. Visibility: public |
| **Properties** | Category **Games → Puzzle & trivia** (secondary, if offered: Simulation). Privacy policy URL: **https://studio.umage.ai/privacy/**. Website: https://studio.umage.ai/games/span/. Support contact: the umage.ai contact page (https://umage.ai/contact) or your support email. Game settings: single player only; no online play. Product declarations: leave the defaults; "can be installed to removable storage" may stay on |
| **Age ratings** | The IARC questionnaire, with the same answers as on Google Play ([PLAY-CONSOLE.md](PLAY-CONSOLE.md)): a puzzle game; vehicles fall into the water but nobody is shown hurt; no fear, sex, language, drugs or gambling; no user interaction, no purchases, no location, no data shared. Expect **3+ / Everyone** |
| **Packages** | Upload both files from the PWABuilder zip (`.msixbundle` and `.classic.appxbundle`). Device families: Desktop (Holographic and Xbox off) |
| **Store listings** | English (United States) and Danish. Texts below. Images: `screenshots/desktop-*.jpg` (1920 × 1080, five), **1:1 box art** `screenshots/msstore-boxart-1x1.jpg` (1080 × 1080), **2:3 poster art** `screenshots/msstore-poster-2x3.jpg` (1440 × 2160), and the 512 icon `screenshots/icon-512.png` as the store logo if asked. Trailer (optional): `youtube/span-teaser.mp4`, see [YOUTUBE.md](YOUTUBE.md); its thumbnail is `youtube/span-teaser-thumbnail.jpg` |
| **Submission options** | Publish as soon as it passes certification. Notes for certification: "A free puzzle game. It is a PWA (hosted at https://span.studio.umage.ai) and plays offline after the first start. No login, no purchases." |

Certification takes from a few hours to about three days.

### Store listing texts

- **Product name:** SPAN: Bridge Builder
- **Description:** paste [full-description-en.txt](full-description-en.txt) (Danish: [full-description-da.txt](full-description-da.txt)), the same text as on Google Play, with two changes for a PC:
  - Replace the *MADE FOR TOUCH* paragraph with:
    - EN: `MOUSE, KEYBOARD OR TOUCH` / `Drag to build, right-click or Esc to stop, the wheel zooms, Space tests. Undo and redo, mirror mode and ready-made templates to learn from. Touch screens work too.`
    - DA: `MUS, TASTATUR ELLER TOUCH` / `Træk for at bygge, højreklik eller Esc for at stoppe, hjulet zoomer, mellemrum tester. Fortryd og gentag, spejltilstand og færdige skabeloner at lære af. Touchskærme virker også.`
  - In *PLAYS OFFLINE, NO STRINGS*, replace "The whole game is in the app and works without a connection." with "After the first start it works without a connection." (DA: "Efter første start virker det uden forbindelse.")
- **Short description** (shown on Xbox and in some lists): the Google Play short description from [listing-en.md](listing-en.md) / [listing-da.md](listing-da.md).
- **What's new:** the notes of the latest GitHub release (`gh release view --json body -q .body`), shortened to the player-facing lines.
- **Product features** (one per line, up to 20):
  - 102 hand-made levels: roads, railways and famous bridges
  - Real physics: every member bends, stretches and can snap
  - Cars, buses, trains and 60-tonne haulers to carry
  - Iron Road: 20 railway bridges where a kink derails the train
  - Rebuild 12 real bridges, from the Pont du Gard to the Golden Gate
  - Forces of Nature: hurricanes and earthquakes
  - A new Daily Challenge every day, plus Endless mode
  - Stars and challenge stars for cheaper, smarter bridges
  - Undo, mirror mode and templates to learn from
  - Plays offline; no ads, no purchases, no account
  - English and Danish
  - Danish: 102 håndlavede baner: veje, jernbaner og berømte broer · Ægte fysik: hver bjælke bøjer, strækkes og kan knække · Biler, busser, tog og 60-tons lastbiler skal over · Jernbanen: 20 jernbanebroer, hvor et knæk afsporer toget · Genopbyg 12 virkelige broer, fra Pont du Gard til Golden Gate · Naturens kræfter: orkaner og jordskælv · Dagens udfordring, ny hver dag, plus Endeløs · Stjerner og udfordringsstjerner for billigere, klogere broer · Fortryd, spejltilstand og skabeloner at lære af · Spilles offline; ingen reklamer, ingen køb, ingen konto · På engelsk og dansk
- **Search terms** (up to 7): bridge, physics, puzzle, engineering, construction, trains, builder

Regenerate the images with `npm run store:assets -- --only desktop,boxart,poster` after visual changes.

## Every later release

Nothing, as long as only the game changed: the release that deploys the web game updates the Store app. When the manifest, the name or the icon changes, make a new package with PWABuilder (a higher app version) and submit it with updated *What's new* notes.
