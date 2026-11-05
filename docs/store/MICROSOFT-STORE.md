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

## The package and the submission

Every value to enter, in Partner Center order, is in **[msstore-submission.md](msstore-submission.md)**: the PWABuilder fields, the runFullTrust justification, pricing and markets, properties, age rating, the English and Danish listings, and the certification notes. Things worth knowing first:

- **Images must be PNG**: Partner Center refuses JPEG. `npm run store:assets -- --png --out <dir> --only desktop,boxart,poster,trailerthumb` renders them (desktop screenshots 1920 × 1080, 1:1 box art 1080 × 1080, 2:3 poster art 1440 × 2160, the trailer's key-art thumbnail 1920 × 1080). The store logo is `assets/icons/app/icon-512.png` scaled to 300 × 300.
- **The package version is the package's own number** (`1.0.1`, classic `1.0.0`), not the game's. Raise both for every new package.
- **runFullTrust:** PWABuilder always declares it, for the Edge runtime. Keep it and paste the justification from the sheet.
- **The descriptions** are the Google Play texts reworded for a PC (click instead of tap, mouse and keyboard controls, offline after the first start): [msstore-description-en.txt](msstore-description-en.txt) and [msstore-description-da.txt](msstore-description-da.txt).
- **Markets:** all except Vietnam, the same as Prismwright.

Certification takes from a few hours to about three days.

## Every later release

Nothing, as long as only the game changed: the release that deploys the web game updates the Store app. When the manifest, the name or the icon changes, make a new package with PWABuilder (a higher app version) and submit it with updated *What's new* notes.
