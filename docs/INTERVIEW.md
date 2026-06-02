# CourseCrawler — Discovery Interview

> Answer inline under each **A:** line. Brief is fine — a number, a word,
> `skip`, or `you decide` all work. Anything you skip, I'll fill with a
> sensible default in the PRD and flag it as an assumption.
> When you're done (or done enough), tell me and I'll draft `docs/PRD.md`.

---

## A. Problem & users

**A1.** Primary user — parents only, or also kids/teens browsing themselves? Any
secondary users (e.g. course providers who want to list)?
> A: parents only for now

**A2.** Age range of kids we serve (e.g. 4–16)?
> A: sounds good for now

**A3.** Describe the *current* pain in your own words — how does a Zürich parent
find summer courses today, and what specifically sucks about it?
> A: just have to google search and then hope for the best

**A4.** Is this a personal/hobby project, a potential startup/product, or for an
organization?
> A: hobby for now, but trying to have a help found a scalable idea, he could potentailly go full time for it

---

## B. What counts as a "course"

**B1.** Formats in scope? (half-day workshops / full-day camps / multi-day camps /
weekly recurring courses / overnight residential camps)
> A: could be a pulldown

**B2.** Topics? (sports, languages, coding/robotics, arts & crafts, music, science,
academic tutoring, "all of the above")
> A: all of the above

**B3.** Summer only, or all Swiss school holidays (autumn / sport / spring breaks)?
> A: all swiss school holidays

**B4.** Include free/cheap communal **Ferienpass/Ferienplausch** activities, **paid
private** courses, or **both**?
> A: both - coudl also be a pulldown

---

## C. Geography & language

**C1.** Start with **City of Zürich** only, or the **whole Canton** (~160 communes)
from day one?
> A: whole canton

**C2.** Primary language German — do we also need **English** (expats),
French/Italian?
> A: definitely need english, need to think about how to surface results (i guess language wont always be clear)

---

## D. Crawling & data freshness

**D1.** Should the app **link out** to the provider's site for booking, or
eventually handle registration **in-app**?
> A: link out is fine

**D2.** How fresh must listings be — **daily** refresh, weekly, or real-time
seats-left tracking?
> A: for now weekly is good, would be nice to eventually expand to seats-left tracking but not for MVP

**D3.** Prefer **official APIs / partnerships** where they exist and scrape only as
fallback, or scrape broadly from the start? (Some sites' ToS prohibit scraping.)
> A: scrape broadly, it's a personal thing for now, no need to take the ToS too seriously

---

## E. Parent-facing features

**E1.** Which filters matter most? Mark must-have (M) / nice (N) / no (–):
- age M
- date / week M
- topic N
- location / distance M
- price M
- language of instruction M
- half-day vs full-day M
- lunch / care included N
- gender N
- special-needs friendly N
> A (any extras?):

**E2.** **Map view** important for v1, or is list/search enough?
> A: would be nice if its easy, up to you

**E3.** Do parents need **accounts** (save favorites, multiple kids' profiles), or
anonymous browsing for v1?
> A: no, anonymous is fine, the point is to prove out the dataset nicely

**E4.** Want **alerts/notifications** (new matching course / spots opened)?
> A: no

---

## F. Scope discipline for v1

**F1.** If you had to ship a **first prototype in a week**, what's the single most
important thing it must do well?
> A: have sufficient volume and data accuracy such that users find that this is a rich dataset

**F2.** What's explicitly **out of scope** for v1?
> A: actually registering for the courses. just knowing what's available for now is ok. (with linking out to provider)

---

## G. Tech & ops

**G1.** **Tech stack** preferences (language, framework, DB, hosting), or should I
propose one? (Dir is empty — greenfield.)
> A: typescript+react for the browser... no strong opinions for the rest, maybe python for scraping? Or node? no idea

**G2.** Run **continuously in the cloud** (scheduled crawls + hosted site), or
locally for now?
> A: just locally for now

**G3.** Any **budget constraints** for hosting / scraping infra?
> A: not really, just running locally right now

---

## H. Success

**H1.** How would you know it's working — the **success metric**? (e.g. "I found 3
courses for my kid in 5 min," "X listings aggregated," "N real users.")
> A: i see a rich diverse set of courses and i get the sense that there's a lot of real choices for my kids

---

## I. Anything I didn't ask

**I1.** Constraints, inspirations (existing sites you like), pet peeves, must-haves?
> A:

---

# Round 2 — gaps I spotted ("what am I missing")

> Same drill — answer under each **A:**. These are the blind spots I flagged.
> Defaults in brackets if you skip.

## J. "Feels rich + trustworthy" (directly serves your success metric)

**J1.** Capture **images/photos** per course (thumbnail in list, hero on detail)? Richest
lever on "feels like a real catalog," but adds scraping + a copyright question (see N).
[default: yes, capture image URLs]
> A: yes capture image URLs, and separately also we should actually fetch the urls so we can surface them locally. this is a hobby project so dont worry about copyright.

**J2.** Capture a **registration deadline / "still bookable?"** signal where the source shows
it? Avoids showing parents courses they can't actually book. [default: yes, as a field; no
live seats-tracking in v1]
> A: nice to have, sure if we have it, but if we dont have the data then its ok to say unknown

**J3.** How should **stale listings** behave — a course that's already *over* or *full*?
Hide entirely / grey out / show with a label? [default: hide once end-date passed; no
full/seats info in v1]
> A: probably hide entirely

## K. Data correctness

**K1.** Zürich communes can **stagger** school-break dates, so "summer" isn't one canton-wide
range. Prefer filtering by **actual dates** (robust) over a named-period label, with the
period as a secondary convenience? [default: dates primary, period secondary]
> A: yeah filter by calendar weeks (KW numbers) and the UI can maybe showcase what that maps to for which commune (and also have the date range the KW number correspond to)

**K2.** A camp offered **every week all summer** can flood results. OK to **group by course**
and show "runs 6 weeks" rather than 6 rows? [default: yes, group by course]
> A: yes

## L. Browse UX

**L1.** **Default sort** when a parent hasn't filtered much — by date (soonest first),
distance, or price? [default: date soonest-first]
> A: date

**L2.** **Empty / thin results** — when a filter combo returns little/nothing, suggest
broadening (e.g. "no coding camps age 6 in Uster — show nearby communes")? [default: yes,
gentle suggestions]
> A: yes

**L3.** Show **provenance** on each listing ("source: Ferienplausch · updated 3 days ago")?
Cheap trust signal. [default: yes]
> A: yes

## M. Crawler reliability

**M1.** Want a **breakage alert** when any source's record count drops to ~0 (sites change
layout and scrapers fail silently)? Local = a console warning / log flag for now. [default:
yes, sanity-check + warn]
> A: yes

## N. Legal (future-facing, not v1 blockers)

**N1.** For descriptions, prefer storing/showing a **short snippet + link-out** rather than
the full scraped text (safer re: copyright if this ever goes public)? [default: snippet +
link-out]
> A: sure, store both in the database though since we're already scraping, but fine to only show the snippet for now

**N2.** Add a small **"always verify details with the provider"** disclaimer? [default: yes]
> A: sure

## O. Strategy (not v1 work — just want your thesis on file)

**O1.** **Differentiation vs. Pro Juventute's Elternkompass** (which already aggregates the
Feriennet fleet): is your wedge "broader coverage (paid private + cantonal + non-Feriennet) +
better filtering + English"? Anything to add/change?
> A:  yes

**O2.** **National scalability:** the Feriennet fleet is country-wide, so the ZH adapter
generalizes to most of CH cheaply. Is "win ZH, then roll out canton-by-canton on the same
infra" the intended growth path?
> A: yes

**O3.** **Seasonality:** demand spikes ~4×/year around holidays. Any thoughts on retention /
keeping it useful between breaks, or ignore for now?
> A: ignore for now

**O4.** **Monetization thesis** (even rough): referral/lead-gen fees, featured listings,
provider SaaS, or "prove value first, figure money out later"?
> A: achieve scale before monetization
