# Workbench

One place for consulting work: **projects with task codes, weekly timesheets, tasks, a calendar, notes, ideas, smart whiteboards, a PDF studio, project channels, files and small engineering tools**. It's local-first and fast. It syncs live across devices through your own Supabase project (or a private GitHub gist), and it has optional AI built in that uses your own Claude API key.

> Formerly *TimeTracker*. Your existing login and data carry over automatically (see [Upgrading from TimeTracker](#upgrading-from-timetracker)).

## What's inside

| Area | What it does |
| --- | --- |
| **Home** | Week-at-a-glance ring, focus list (overdue, due soon, in progress), quick capture, what's coming up, work you're waiting on from others, where your hours went. |
| **Timesheet** | Weekly grid by project × cost code. Type hours straight into cells and move between them with arrow keys or Enter. Also: totals, billable %, overtime, copy last week, CSV export, and submit/lock a week. |
| **Timer** | Start with `T` from anywhere (on a project page it starts for that project). Pause and resume, then *Stop & log* rounds to the nearest quarter hour. |
| **Tasks** | Kanban board (drag between columns) or grouped list. Assign to yourself or teammates, and track what you delegated. Priorities, due dates, subtasks, and time logged per task. |
| **Calendar** | Month and week views showing events, task due dates and hours logged. Drag items to reschedule; double-click a day or time slot to add an event. |
| **Messages** | Slack-style channels per project with threads, reactions, pins, @mentions, markdown, file attachments, and *turn message into task*. |
| **Projects** | Project number → task codes with names, budgets and billable flags. Paste a task list straight from a timesheet export, or import many projects at once. Each project page shows budget burn, hours per task against its budget, tasks, time history, and linked notes, boards, channels and files. |
| **Notes** | Rich-text editor: type `/` for headings, checklists, quotes and code; select text for formatting. |
| **Ideas** | Throw thoughts down, #tag them, move them through *spark → exploring → building → parked*, and turn them into tasks or notes. |
| **Whiteboards** | Infinite canvas powered by [Excalidraw](https://github.com/excalidraw/excalidraw). **Smart ink** turns rough pen strokes into clean rectangles, ellipses, diamonds and arrows (pause before lifting, or turn on auto). Arrows attach to the shapes they touch. Other features: Mermaid → diagram, insert PDF pages and images to sketch over, templates, and PNG/SVG export. With AI you can also describe a process to get a flowchart, clean up a sketch into a diagram, turn handwriting into text, and turn a board into tasks or a note. |
| **PDF Studio** | Open drawings, specs and reports and work on them in place. **Markup:** pressure-sensitive pen, highlighter plus text highlight/underline/strike, rectangles, ellipses, polygons, revision clouds, arrows, text, callouts, review stamps, signatures and redaction. **Measure:** set the scale from a standard preset or a known dimension, then use length, polylength, area and count, with a takeoff panel and CSV export. **Organize:** reorder, rotate, duplicate, delete, insert and extract pages, and combine PDFs. **Compare:** overlay, swipe or side-by-side revisions, auto-align them, and auto-cloud the changes. **OCR** runs on-device and makes scans searchable. **Export** flattens markups, truly removes redacted content, and embeds the OCR text. Markups have status, comments, a CSV review log, and can become tasks. **Ask:** answers with page citations (AI). |
| **Speed Reader** | Read documents one word at a time (RSVP), with each word aligned on its *optimal recognition point*: the highlighted letter stays fixed at the centre, so your eyes never move. **Open:** PDF (joins lines, fixes hyphenation, drops running headers and page numbers, uses the PDF outline as chapters, OCRs scanned pages), EPUB (chapters from the book's table of contents), Word `.docx`, Markdown, HTML, RTF, text, pasted text, or photos of printed pages (on-device OCR). **Pacing:** 60–1500 wpm. Smart timing gives rare and long words, numbers and punctuation more time and common words less; it adds sentence and paragraph pauses, eases back in after a pause, and rewinds to the sentence start when you resume. Chunk mode shows 1–3 words, and speed training raises the pace each minute up to a target. **Modes:** *Focus* (one word), *Flow* (the full text with a moving highlight), *Listen* (text-to-speech with the word following the voice). **Navigate:** tap or press Space; arrows step a word (Shift for a sentence); drag sideways to scrub and up/down to change speed; a chapter-marked progress bar; contents, bookmarks and search; while paused, the surrounding sentence appears and you can tap any word to jump to it. **Display:** five reading themes, four fonts, text size, focus guides, faint neighbour words, optional haptics. **Library:** New / In progress / Finished, time left at your pace, and stats (words today and this week, average wpm, streak). Your position syncs across devices. **Reading assistant (AI):** recap so far, explain this passage, key takeaways, a comprehension quiz that suggests a speed change, and Q&A. It only sees the text up to where you are. |
| **Files** | Drag-and-drop storage with folders, stars, project links, and previews for images, PDFs, video and text. |
| **Tools** | Snippet clipboard, engineering unit converter (flow, stress, force, moment, line load, …), a calc pad that evaluates as you type, and a focus timer. |

Everywhere: a command palette on `⌘K` / `Ctrl K`, **Quick add** on `⌘J` / `Ctrl J` (type “3.5h yesterday on 1234567 task 002 footing calcs; site visit Thursday 9–11” and preview the entries before saving; needs AI), keyboard shortcuts (`C` task, `L` log time, `E` event, `I` idea, `G` + letter to navigate, e.g. `G R` for the Speed Reader), dark/light/system themes with a circular reveal, seven accent colours, spring-physics animations (reduced-motion aware), a mobile layout with a tab bar, and offline support.

## Architecture

- **Vite + React 19 + TypeScript**, **Tailwind CSS v4** with OKLCH design tokens, and **Motion** for layout and transitions.
- **Local-first data**: every change is written instantly to IndexedDB through a small Zustand store (`src/store/workspace.ts`).
- **Merge model** (`src/lib/sync.ts`): per-record, last-writer-wins, with tombstones for deletes, so devices converge without clobbering each other.
- **Workbench Cloud** (`src/store/cloud.ts`, `supabase/migrations/0001_workbench.sql`): records live in one `wb_records` table protected by row-level security. A server-side sequence drives incremental pulls, a `wb_push` function applies last-writer-wins on the server, Realtime streams changes live, and file contents go to a private per-user Storage bucket (downloaded on demand on other devices). Auth is Supabase email/password, email link or GitHub. `supabase-js` loads only if Cloud is configured.
- **Gist backup** (`src/store/sync.ts`): the same merge, written to `workbench-v4.json` in a private gist you own. It can run alongside Cloud.
- **Device lock**: the password is hashed with PBKDF2-SHA256 (310k iterations) and checked in the browser.
- **PDF Studio** (`src/features/pdf`): pdf.js (legacy build, for Safari) renders the pages. Markups are stored in PDF user space, so they're zoom- and rotation-independent and export exactly. pdf-lib builds exports, Tesseract (self-hosted worker and wasm) does OCR, and perfect-freehand draws ink. Heavy libraries load on demand.
- **AI** (`src/lib/ai.ts`): the Anthropic SDK is called directly from the browser with your own key. The model is picked from your account's model list (newest Opus by default). Requests opt into server-side fallback and handle refusals, and structured outputs are validated with zod. The key is stored in this browser only and never synced.

```
src/
  app/          routes, nav, App (auth gate)
  components/   ui kit (buttons, popovers, dialogs, pickers…) and layout (sidebar, palette, timer)
  features/     one folder per area: home, timesheet, tasks, calendar, messages, projects, notes, ideas, whiteboard, pdf, files, tools, settings, auth, ai
  lib/          dates, sync merge, gist + Supabase clients, AI client, ink recognizer, WBS parsing, crypto, migration, seed data
supabase/       SQL for Workbench Cloud (run once in your project)
  store/        workspace data, auth, sync engine, prefs, timer, ui
```

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds on every push to `main` and publishes `dist/` to Pages.
**One-time setup:** in the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

The build uses relative paths and hash routing, so it works from any sub-path (e.g. `https://you.github.io/timetracker/`).

## Workbench Cloud (Supabase) setup

Live sync across devices, real sign-in, and files that follow you. It takes about three minutes:

1. Create a free project at [supabase.com/dashboard/new](https://supabase.com/dashboard/new).
2. In Workbench open **Settings → Cloud**, click **Copy setup SQL**, then paste it into the Supabase **SQL editor** and run it. It's safe to run again. It creates the table, row-level security, the sync function, the Realtime publication and a private storage bucket.
3. From **Project Settings → API**, paste the **Project URL** and the **publishable (anon) key** into Workbench and connect. Never use the secret/service-role key; Workbench refuses it.
4. Create an account (or use an email link, or GitHub if you enable that provider under *Authentication → Providers*). Sign in with the same account on your other devices.

For email links and GitHub sign-in, add your site URL (for example `https://you.github.io/timetracker/`) under *Authentication → URL Configuration → Redirect URLs*.

## Using Workbench on another device

Your workspace lives in each browser and syncs through Workbench Cloud or your GitHub gist. To add a phone or another computer:

- **Link a device (fastest).** On a device that's already signed in, open **Settings → Devices → Show code**. Scan the code with the new device's camera, tap **Sign in**, and choose a password for that device. The code carries your sync settings, so only show it to your own devices. It expires after 10 minutes.
- **Saved logins.** On the first screen, tap **Already use Workbench? Sign in**. Then either pick your saved GitHub sync login (stored as `github:<username>`; save it once via **Settings → Devices → Save login**) or sign in to Workbench Cloud with email, GitHub, or an email link.

On iPhone, a Workbench icon added to the Home Screen keeps storage separate from Safari, so link that app separately.

## Gist backup (optional)

1. [Create a GitHub token](https://github.com/settings/tokens/new?scopes=gist&description=Workbench%20sync) with **only** the `gist` scope.
2. Paste it during onboarding, or later under **Settings → Gist backup**.
3. Use the same token on another device and Workbench finds your gist and merges.

## AI setup (optional)

Add a Claude API key under **Settings → AI** (create one in the [Claude Console](https://platform.claude.com/settings/keys)). It's stored in this browser only. Requests go straight from your browser to Anthropic and are billed to your account. Without a key, everything else works, including Mermaid diagrams, OCR, compare and smart ink.

## Upgrading from TimeTracker

- On first load, your existing TimeTracker login is detected. Sign in with your old password and it is re-hashed with PBKDF2.
- If you had GitHub sync, the old gist is found automatically. Projects, time entries and settings are migrated; old "action" notes become tasks and other notes become ideas.
- The original `jacobs-timetracker-data-v3.json` file in the gist is left untouched. Mileage, templates and recurring entries from v3 are not migrated yet, but they remain in that file.

## Limits and next steps

- Messages, task assignment and people are still single-user: Cloud syncs *your* devices, and teammates are contacts rather than accounts. Shared workspaces on top of the Cloud schema are the natural next step.
- File contents sync through Workbench Cloud (files up to 50 MB). With gist-only sync they stay on the device where they were added.
- PDF markups are flattened on export. Round-tripping them as editable PDF annotations for other apps is planned.

MIT licensed.
