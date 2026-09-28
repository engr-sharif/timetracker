# Workbench

One place for consulting work: **projects, weekly timesheets, tasks, a calendar, notes, ideas, whiteboards, project channels, files and small engineering tools**. It's local-first and fast, and it can sync through a private GitHub gist.

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
| **Projects** | Project number, client, cost codes and budget. Each project page shows budget burn, hours by cost code, tasks, time history, and linked notes, boards, channels and files. |
| **Notes** | Rich-text editor: type `/` for headings, checklists, quotes and code; select text for formatting. |
| **Ideas** | Throw thoughts down, #tag them, move them through *spark → exploring → building → parked*, and turn them into tasks or notes. |
| **Whiteboards** | Infinite canvas powered by [Excalidraw](https://github.com/excalidraw/excalidraw): sketch, diagram and build flowcharts, starting from templates. Export to PNG or SVG. |
| **Files** | Drag-and-drop storage with folders, stars, project links, and previews for images, PDFs, video and text. |
| **Tools** | Snippet clipboard, engineering unit converter (flow, stress, force, moment, line load, …), a calc pad that evaluates as you type, and a focus timer. |

Everywhere: a command palette on `⌘K` / `Ctrl K`, keyboard shortcuts (`C` task, `L` log time, `E` event, `I` idea, `G` + letter to navigate), dark/light/system themes with a circular reveal, seven accent colours, spring-physics animations (reduced-motion aware), a mobile layout with a tab bar, and offline support.

## Architecture

- **Vite + React 19 + TypeScript**, **Tailwind CSS v4** with OKLCH design tokens, and **Motion** for layout and transitions.
- **Local-first data**: every change is written instantly to IndexedDB through a small Zustand store (`src/store/workspace.ts`).
- **Sync** (`src/store/sync.ts`, `src/lib/sync.ts`): per-record, last-writer-wins merge with tombstones for deletes, so two devices converge without clobbering each other. Data goes to `workbench-v4.json` in a private gist you own.
- **Sign-in**: the password is hashed with PBKDF2-SHA256 (310k iterations) and checked in the browser. This locks the app on your device; it is not server auth.
- **Files** are stored as blobs in IndexedDB on the device. Their names, folders and project links sync; their contents stay local.

```
src/
  app/          routes, nav, App (auth gate)
  components/   ui kit (buttons, popovers, dialogs, pickers…) and layout (sidebar, palette, timer)
  features/     one folder per area: home, timesheet, tasks, calendar, messages, projects, notes, ideas, whiteboard, files, tools, settings, auth
  lib/          dates, sync merge, gist client, crypto, migration, seed data
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

## Sync setup

1. [Create a GitHub token](https://github.com/settings/tokens/new?scopes=gist&description=Workbench%20sync) with **only** the `gist` scope.
2. Paste it during onboarding, or later under **Settings → Sync**.
3. Use the same token on another device and Workbench finds your gist and merges.

## Upgrading from TimeTracker

- On first load, your existing TimeTracker login is detected. Sign in with your old password and it is re-hashed with PBKDF2.
- If you had GitHub sync, the old gist is found automatically. Projects, time entries and settings are migrated; old "action" notes become tasks and other notes become ideas.
- The original `jacobs-timetracker-data-v3.json` file in the gist is left untouched. Mileage, templates and recurring entries from v3 are not migrated yet, but they remain in that file.

## Limits and next steps

- Messages, task assignment and people are single-user: teammates are contacts, not live accounts. Real-time multi-user chat would need a shared backend (for example Supabase or Firebase), and the sync layer is written so a backend like that can be added.
- File contents don't sync between devices yet. Names, folders and project links do.

MIT licensed.
