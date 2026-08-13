# UI-2 Live Validation Checklist (2026-08-13)

Status: **For Izzat, as a real reader — not an architecture review.**
UI-2A/2B are contract-correct and test-covered (`docs/ui-2-navigation-contract.md`,
42/42 `state/test.js` passing), but per ChatGPT: the two real bugs found
this session ("berita Melayu takkan keluar dalam edisi Arab", the earlier
Politik-empty bug) both came from a real person using the product, not
from any test. UI-2C/2D are deliberately paused until this feedback comes
back — no more code changes based on assumption.

**Just use Adjung Quick normally and try to break it.** No need to
understand *why* anything works — if something feels wrong, confusing, or
looks like a bug, that's exactly what this checklist wants to catch.

## Edition

- [ ] Open in Malaysia · Malay Edition (default)
- [ ] Switch to Global · English Edition
- [ ] Switch to Global · Arabic Edition
- [ ] Does it feel obvious which edition you're in each time?

## Wheel

- [ ] Scroll to a Bidang with lots of news
- [ ] Scroll to a Bidang that's empty (or nearly empty)
- [ ] Scroll to a niche Bidang (Agama, Sains, Teknologi)
- [ ] Does scrolling feel natural — not too fast, not too slow, not jumpy?

## Active Set (the news list)

- [ ] Count the slots — should always be up to 10, never more
- [ ] Does the ranking look sensible for the Bidang you picked?
- [ ] Switch Bidang a few times — does the list content actually change
      each time?
- [ ] **Specifically check: switch to English or Arabic edition — is
      every story genuinely in that language? No Malay text should ever
      appear once you're in English/Arabic edition.**

## Reading (Brief)

- [ ] Open a few stories (tap/click a card)
- [ ] Does the story you open match what the card showed? (title,
      language, source)
- [ ] Close and try another
- [ ] In Arabic edition specifically: does the reading view display
      right-to-left properly? Does anything look mirrored wrong or
      broken?

## Anything else

- [ ] Anything that just feels off, slow, confusing, or wrong — even if
      you can't explain why — write it down. The two most valuable bugs
      found this session were both exactly this kind of report, not a
      precise technical description.

## After this checklist

Report back whatever you found — bugs, confusion, or "this feels fine."
Both are useful: a clean pass means UI-2C (Active Set polish) and UI-2D
(representation/reading polish) can proceed with confidence instead of
guessing what needs attention next.
