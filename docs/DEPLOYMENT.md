# Deployment runbook

How KidsCampFinder is hosted, how to ship changes, and the non-obvious bits worth knowing.
For *why* it's architected this way, the short version is in `README.md`; this doc is the operational
reference.

## TL;DR

- **Live:** https://kidscampfinder.vercel.app
- **Host:** Vercel (static site, no server, no functions).
- **Deploy trigger:** push to `main` on GitHub → Vercel auto-builds and deploys.
- **Data refresh:** run the crawler locally → `npm run export` → copy images → commit `web/public/` → push.

## Architecture (static — Scope A)

There is **no runtime server** in production. The Express server that exists in dev (`web/server/`,
SQLite via `better-sqlite3`) is **not** deployed. Instead:

```
crawler (Python + SQLite, local)  ->  data/kidscampfinder.sqlite + data/images/   (gitignored)
        |
        |  npm run export   (reads the DB read-only)        cp images
        v                                                     v
web/public/api/{courses,meta,admin}.json   +   web/public/images/*    (committed to git)
        |
        |  vite build   (on Vercel)
        v
static dist/  ->  Vercel CDN
        |
SPA fetches /api/*.json once, filters client-side; images served from /images/*
```

Vercel only ever runs `vite build`. It never sees SQLite, Python, or the crawler. The JSON and images
are **committed build inputs**.

## Vercel project

| | |
|---|---|
| Project | `kidscampfinder` |
| Team / scope | `dominik-kaesers-projects` (owner `dpkay`) |
| Project ID | `prj_s2lbV0L7EtmHvCXl0bZjm37frvPK` |
| Org ID | `team_rSLum3vPG17IrxcoQdBf8UMA` |
| GitHub repo | `git@github.com:dpkay/kidscampfinder.git` |
| Production branch | `main` |

### Build settings (mirrors `web/vercel.json`)
- **Root Directory: `web`** ⚠️ — see Gotchas. This is a *project setting* (not in `vercel.json`); without
  it, git builds fail at the repo root (no `package.json` there).
- Framework: `vite` · Build: `vite build` · Output: `dist`
- SPA fallback rewrite (in `web/vercel.json`): everything except `api/`, `images/`, `assets/` → `index.html`.

## Routine: refresh the course data

This is the normal recurring task — the crawler runs on your machine, then you publish its output.

```bash
# 1. Run the crawler (updates data/kidscampfinder.sqlite + downloads images into data/images/)
#    (see crawler/ for the exact invocation)

# 2. Regenerate the static JSON from the DB
cd web
npm run export            # writes web/public/api/{courses,meta,admin}.json

# 3. Sync images  ── NOTE: `npm run export` does NOT copy images; this is a separate step.
#    Filenames are content hashes, so -n (no-clobber) just adds the new ones.
cp -n ../data/images/* public/images/

# 4. Commit the build inputs and push → Vercel auto-deploys
git add web/public/api web/public/images
git commit -m "data refresh"
git push                  # triggers a production deploy on main
```

That's it — no Vercel CLI needed for routine data updates; the git push does the deploy.

## Manual deploy / redeploy (when you're not pushing code)

Requires the Vercel CLI (`npm i -g vercel`) and a one-time `vercel login`.

```bash
# Re-trigger a production build of the current GitHub main (e.g. after changing an env var):
#   Easiest: make any commit and push, OR use the dashboard "Redeploy" button.
#   CLI deploy of local files (uploads web/, bypasses git):
cd web && vercel deploy --prod
```

Note: a CLI `vercel deploy` from `web/` uploads your *local* `web/` directory — it does not build from
GitHub. For a faithful "deploy what's on main" build, push to `main` or use the dashboard Redeploy.

## Environment variables — Google Maps key (two-key split)

The map needs `VITE_GOOGLE_MAPS_API_KEY`. Because it's a `VITE_` var it is **compiled into the public
client bundle** — i.e. anyone can read it from the deployed site. So we use two different keys:

| Environment | Key | Restriction | Stored in |
|---|---|---|---|
| **Production** | `AIzaSy…NZ2DY` | HTTP referrer = the Vercel domain only | Vercel project env var (all targets) |
| **Local dev** | `AIzaSy…Vldo_0` | unrestricted | `web/.env` (gitignored, never deployed) |

- The prod key is the only one exposed publicly, and it only works from `kidscampfinder.vercel.app`.
- The dev key never leaves your machine (`web/.env` is gitignored), so its loose restriction is harmless.
- Manage the prod var: `vercel env ls` / `vercel env add` / `vercel env rm`, or the dashboard. After
  changing it you must **rebuild** (env vars are baked at build time for `VITE_` vars).
- Restrict keys in Google Cloud Console → Credentials. For local dev across any port, use portless
  referrers (`https://localhost/*`, `https://127.0.0.1/*`, `https://<lan-ip>/*`).

## Gotchas

- **Root Directory must be `web`.** The app isn't at the repo root. This is set on the Vercel project
  (Settings → Build & Deployment → Root Directory). It was unset at first and git deploys failed until
  fixed. Don't reset it to blank.
- **`npm run export` does not copy images.** It only writes the JSON. Image syncing into
  `web/public/images/` is a manual `cp` step (above). Forgetting it means new courses show without photos.
- **Per-deployment URLs (`kidscampfinder-<hash>-…vercel.app`) sit behind Vercel deployment protection**
  (auth page). Test against the production alias `kidscampfinder.vercel.app`, not the hashed URL.
- **`VITE_` env-var changes require a rebuild** to take effect; editing the var alone does nothing to the
  already-built bundle.
- **Repo size:** `web/public/images/` is ~162 MB committed. Fine at this size; filenames are content
  hashes so re-exports only add new images rather than rewriting history.

## Security follow-ups (optional hardening)

- The **old/dev key was briefly public** in the production bundle before the two-key swap — treat it as
  potentially harvested. Consider tightening it (localhost/LAN referrers) or rotating it.
- Set a **usage quota cap** on each key and a **billing budget + alert** on the GCP project, so a leaked
  or abused key can't run up a surprise bill. Referrer restrictions are the soft layer; quota/billing
  caps are the hard ceiling.
