# Pratham's IELTS + German Coach

A personal, offline-capable study dashboard for one goal: **IELTS 7.0+ and German A1 → B1, for a Master's in Germany in 2027.**

It is a real working app, not a mockup. Every button saves data, every chart is drawn from what you actually log, and nothing is faked. It runs entirely in the browser with no server and no login — your data stays on your device.

Built for **Pratham Sukhadia**. Baseline used to seed the app: Listening 6.5–7.5, Reading 5.0–5.5, Writing 5.5–6.5, Speaking 6.0–6.5. The two critical modules are **Reading** and **Writing**.

---

## What it does

Twenty sections, reachable from the sidebar (desktop) or the bottom bar and **+** button (mobile):

- **Dashboard** — readiness %, band trend, module roadmap, today's mission, the local teacher's one thing to fix.
- **Today** — an auto-built daily plan in Full / Normal / Busy modes, a study timer with Pomodoro, and an end-of-day check-in that feeds the analytics.
- **IELTS** — score history, overall-band calculator (using the official .25 rounding rule), and a live target-gap table.
- **Reading / Writing / Listening / Speaking Labs** — log sessions, track error types, record spoken answers (stored locally), and see where the marks are leaking.
- **FLT / Mock Tests** — the alternating Saturday full-test / review cycle, with an auto-generated review checklist after each test.
- **Vocabulary** — dictionary lookup (Free Dictionary + Datamuse APIs), spaced-repetition flashcards, and academic-word upgrades.
- **German** — 15 built-in A1/A2 lessons with IPA, articles, grammar, speaking drills and quizzes; plus your own word notebook and pronunciation trainer.
- **Daily Teacher** — a rule-based coach that reads your real history and tells you what to do next. No external AI, no API keys. You can optionally point it at your own endpoint in Settings.
- **Mistake Book, Analytics, Study Calendar, Resources, Germany 2027, Documents, Import/Export, Settings.**

Everything can be exported to **PDF, CSV or JSON**, and JSON backups can be restored on any device.

---

## Deploy it free on GitHub Pages

1. Create a new repository on GitHub (for example `ielts-coach`). Make it **Public**.
2. Upload **all of these files and folders**, keeping the structure:
   ```
   index.html
   style.css
   app.js
   data.js
   manifest.json
   sw.js
   README.md
   assets/icons/...
   ```
   (On the repo page: **Add file → Upload files**, drag everything in, **Commit**.)
3. Open **Settings → Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
5. Wait about a minute, then open the URL GitHub shows you:
   `https://<your-username>.github.io/ielts-coach/`

That link is the app. Add it to your phone's home screen (**Share → Add to Home Screen**) and it installs like a native app and works offline.

---

## Run it locally

Because it registers a service worker, use a tiny web server rather than opening the file directly:

```bash
cd ielts-coach
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from disk also works, minus offline caching.

---

## Your data

- Stored in your browser via **IndexedDB**, with a **localStorage** fallback.
- Audio recordings live in a separate local store and are **not** included in JSON backups (they can be large).
- Nothing is uploaded anywhere. Clearing your browser data clears the app — so use **Import/Export → Backup** regularly.
- **Import never overwrites silently.** A PDF import shows you exactly what was detected and waits for you to confirm.

## Optional online features

These enhance the app but it works fully without them:

- **Dictionary lookup** uses `dictionaryapi.dev` and `api.datamuse.com` (free, no key). Offline, it falls back to a built-in academic word list.
- **Text-to-speech** for German uses the browser's built-in speech synthesis.
- **Reminders** use the browser's notification permission, only if you turn them on in Settings.

## Tech

Vanilla HTML/CSS/ES6. Chart.js for graphs, Anime.js for motion, Three.js for the subtle background (auto-disabled on small screens or with reduced-motion), Lucide for icons, jsPDF + pdf.js loaded on demand for PDF export/import. All libraries load from a CDN and are cached for offline use after the first visit.

## A note on the numbers

The readiness percentage and any band estimates are a **personal preparation indicator** built from your own logged practice. They are motivational and diagnostic — not a prediction of your official IELTS result.
