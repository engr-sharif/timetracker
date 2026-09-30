import { addDays, format } from 'date-fns'
import { ws } from '@/store/workspace'
import type { Draft, Task } from '@/store/types'
import { toKey, weekStart } from './dates'
import { b, bullets, doc, docToText, h, p, todos } from '@/features/notes/noteUtils'

function welcomeNote() {
  const content = doc(
    h(1, 'Welcome to Workbench'),
    p('This is your home for consulting work: ', b('projects, hours, tasks, notes, sketches and files'), ' — all in one place, synced through a private GitHub gist you own.'),
    h(2, 'A few things to try'),
    todos(
      ['Press ⌘K (Ctrl K) to search or jump anywhere', false],
      ['Press T to start a timer, L to log time, C to create a task', false],
      ['Open Whiteboards and sketch a flowchart', false],
      ['Add your first project with its project number and cost codes', false],
    ),
    h(2, 'Shortcuts'),
    bullets('G then H/T/K/C/M — go to Home, Timesheet, Tasks, Calendar, Messages', 'G then P/N/I/W/F — Projects, Notes, Ideas, Whiteboards, Files', 'Shift L — lock the workspace'),
    p('Type “/” in a note for headings, checklists, quotes and code blocks.'),
  )
  return { title: 'Welcome to Workbench', icon: '👋', content, text: docToText(content), pinned: true, tags: ['guide'] }
}

/** Minimal content for a fresh workspace. */
export function seedStarter() {
  const w = ws()
  // Fixed ids so onboarding on a second device merges instead of duplicating.
  w.create('channels', { id: 'channel-general', name: 'general', topic: 'Notes to self, links and quick updates', memberIds: [], archived: false })
  w.create('notes', { id: 'note-welcome', ...welcomeNote() })
}

/** Demo workspace so every screen has something to show. */
export function seedSample() {
  const w = ws()
  const ws0 = weekStart(new Date())
  const day = (i: number) => toKey(addDays(ws0, i))
  const rel = (i: number) => toKey(addDays(new Date(), i))

  const bridge = w.create('projects', {
    number: 'P-24-0412',
    name: 'Riverside Bridge Rehabilitation',
    client: 'County DOT',
    color: 'violet',
    status: 'active',
    costCodes: ['100', '200', '300', '400', '500'],
    codeMeta: { '100': { name: 'Design' }, '200': { name: 'Analysis' }, '300': { name: 'QA/QC' }, '400': { name: 'Meetings' }, '500': { name: 'Site visit' } },
    budgetHours: 320,
    location: 'Riverside, Mile 14.2',
    manager: 'Priya Shah',
    description: 'Deck replacement and bearing retrofit for a three-span steel girder bridge.',
  })
  const water = w.create('projects', {
    number: 'P-24-0788',
    name: 'Northgate Water Treatment Upgrade',
    client: 'Metro Water District',
    color: 'teal',
    status: 'active',
    costCodes: ['110', '120', '300', '400'],
    codeMeta: { '110': { name: 'Process design' }, '120': { name: 'Hydraulics' }, '300': { name: 'QA/QC' }, '400': { name: 'Meetings' } },
    budgetHours: 540,
    manager: 'Marcus Chen',
  })
  const seawall = w.create('projects', {
    number: 'P-25-0103',
    name: 'Harbor Seawall Assessment',
    client: 'Port Authority',
    color: 'amber',
    status: 'active',
    costCodes: ['200', '210', '500'],
    codeMeta: { '200': { name: 'Condition survey' }, '210': { name: 'Report' }, '500': { name: 'Site visit' } },
    budgetHours: 120,
  })
  const oh = w.create('projects', {
    number: 'OH-0000',
    name: 'Overhead',
    client: 'Internal',
    color: 'slate',
    status: 'active',
    costCodes: ['900', '910', '920', '990'],
    codeMeta: { '900': { name: 'Admin', billable: false }, '910': { name: 'Training', billable: false }, '920': { name: 'Business development', billable: false }, '990': { name: 'PTO', billable: false } },
  })

  const priya = w.create('people', { name: 'Priya Shah', role: 'Project Manager', email: 'priya@example.com', color: 'pink' })
  const marcus = w.create('people', { name: 'Marcus Chen', role: 'Senior Structural Engineer', email: 'marcus@example.com', color: 'blue' })
  const elena = w.create('people', { name: 'Elena Rossi', role: 'CAD Technician', email: 'elena@example.com', color: 'emerald' })
  w.create('people', { name: 'Jordan Blake', role: 'Client PM', company: 'County DOT', color: 'orange' })

  const entries: [number, string, string, number, string, boolean][] = [
    [0, bridge.id, '200', 3.5, 'Girder capacity check — load rating spreadsheet', true],
    [0, water.id, '400', 1, 'Weekly coordination call', true],
    [0, oh.id, '900', 0.5, 'Timesheets & email', false],
    [1, bridge.id, '100', 4, 'Bearing retrofit details, sheets S-201 to S-204', true],
    [1, seawall.id, '500', 3, 'Condition survey — north bulkhead', true],
    [2, water.id, '120', 5, 'Filter gallery hydraulic profile', true],
    [2, bridge.id, '300', 2, 'Checked Elena’s deck drainage drawings', true],
    [3, seawall.id, '210', 4.5, 'Draft findings section', true],
    [3, oh.id, '910', 1.5, 'PE continuing ed — seismic webinar', false],
  ]
  const todayIdx = Math.min(6, Math.max(0, Math.floor((new Date().getTime() - ws0.getTime()) / 86400000)))
  for (const [d, projectId, costCode, hours, description, billable] of entries) {
    if (d > todayIdx) continue
    w.create('entries', { date: day(d), projectId, costCode, hours, description, billable })
  }

  const tasks: Draft<Task>[] = [
    { title: 'Finalize bearing retrofit calcs', notes: '', projectId: bridge.id, assigneeId: 'me', assignedById: priya.id, status: 'doing', priority: 'high', due: rel(2), labels: ['calcs'], subtasks: [{ id: 's1', title: 'Seismic load case', done: true }, { id: 's2', title: 'Anchor bolt check', done: false }, { id: 's3', title: 'Summary memo', done: false }], order: 0 },
    { title: 'Update deck drainage sheets per comments', notes: '', projectId: bridge.id, assigneeId: elena.id, assignedById: 'me', status: 'todo', priority: 'medium', due: rel(4), labels: ['drawings'], subtasks: [], order: 1 },
    { title: 'Send load rating summary to client', notes: '', projectId: bridge.id, assigneeId: 'me', assignedById: 'me', status: 'todo', priority: 'urgent', due: rel(-1), labels: [], subtasks: [], order: 2 },
    { title: 'Review filter gallery hydraulic profile', notes: '', projectId: water.id, assigneeId: marcus.id, assignedById: 'me', status: 'review', priority: 'medium', due: rel(6), labels: [], subtasks: [], order: 3 },
    { title: 'Photo log for north bulkhead', notes: '', projectId: seawall.id, assigneeId: 'me', assignedById: 'me', status: 'todo', priority: 'low', due: rel(3), labels: ['site'], subtasks: [], order: 4 },
    { title: 'Draft condition assessment report', notes: '', projectId: seawall.id, assigneeId: 'me', assignedById: priya.id, status: 'backlog', priority: 'medium', due: rel(12), labels: ['report'], subtasks: [], order: 5 },
    { title: 'Submit weekly timesheet', notes: '', assigneeId: 'me', assignedById: 'me', status: 'todo', priority: 'none', due: toKey(addDays(ws0, 4)), labels: [], subtasks: [], order: 6 },
    { title: 'Kickoff meeting minutes', notes: '', projectId: water.id, assigneeId: 'me', assignedById: 'me', status: 'done', priority: 'low', labels: [], subtasks: [], order: 7, completedAt: new Date().toISOString() },
  ]
  for (const t of tasks) w.create('tasks', t)

  w.create('events', { title: 'Client progress meeting', date: rel(1), start: '10:00', end: '11:00', kind: 'meeting', projectId: bridge.id, notes: 'Teams link in invite' })
  w.create('events', { title: '60% design submittal', date: rel(9), kind: 'deadline', projectId: bridge.id })
  w.create('events', { title: 'Seawall dive inspection', date: rel(5), start: '07:30', end: '15:00', kind: 'site', projectId: seawall.id })
  w.create('events', { title: 'Hydraulics workshop', date: rel(3), start: '13:30', end: '15:00', kind: 'meeting', projectId: water.id })

  const ideas: [string, 'spark' | 'exploring' | 'building' | 'parked', 'amber' | 'sky' | 'emerald' | 'violet' | 'rose', string?][] = [
    ['Template the load rating spreadsheet so next bridge takes half the time #automation', 'exploring', 'sky', bridge.id],
    ['Lunch-and-learn on corrosion mechanisms for the seawall team', 'spark', 'amber', seawall.id],
    ['Standard QA/QC checklist for drawing reviews — share with Elena #process', 'building', 'emerald'],
    ['Pitch a drone survey for the next condition assessment', 'spark', 'violet', seawall.id],
    ['Look into PE licence in a second state', 'parked', 'rose'],
  ]
  for (const [text, stage, color, projectId] of ideas) {
    w.create('ideas', { text, stage, color, projectId, tags: Array.from(text.matchAll(/#([\w-]+)/g), (m) => m[1]), pinned: stage === 'building' })
  }

  w.create('notes', welcomeNote())
  const meeting = doc(
    h(1, 'Client progress meeting'),
    p(b('Attendees: '), 'Priya, Jordan (County DOT), me'),
    h(2, 'Discussion'),
    bullets('Bearing retrofit approach accepted in principle', 'Client wants staged traffic control for deck pour', 'Load rating results due end of week'),
    h(2, 'Actions'),
    todos(['Send load rating summary', false], ['Confirm traffic control phasing with Marcus', false], ['Circulate minutes', true]),
  )
  w.create('notes', { title: `Progress meeting — ${format(new Date(), 'MMM d')}`, icon: '🗒️', content: meeting, text: docToText(meeting), projectId: bridge.id, pinned: false, tags: ['meeting'] })

  const general = w.create('channels', { name: 'general', topic: 'Notes to self, links and quick updates', memberIds: [], archived: false })
  const bridgeCh = w.create('channels', { name: 'riverside-bridge', topic: 'P-24-0412 coordination', projectId: bridge.id, memberIds: [priya.id, marcus.id, elena.id], archived: false })
  const msgs: [string, string, string][] = [
    [general.id, 'me', 'Set up Workbench today 🎉 — everything in one place now.'],
    [bridgeCh.id, priya.id, 'Client confirmed the bearing retrofit approach. Can we get calcs wrapped by Thursday?'],
    [bridgeCh.id, 'me', 'Yes — seismic case is done, anchor bolts next. Will post the memo here.'],
    [bridgeCh.id, elena.id, 'Deck drainage sheets updated, ready for your QA/QC pass.'],
  ]
  for (const [channelId, authorId, body] of msgs) w.create('messages', { channelId, authorId, body, reactions: {}, attachmentIds: [], pinned: false })

  w.create('snippets', { title: 'Standard email sign-off', body: 'Best regards,\n\n—\nSent from Workbench', tags: ['email'], uses: 0 })
  w.create('snippets', { title: 'QA/QC stamp note', body: 'Checked by: ____  Date: ____  Comments addressed: Y / N', tags: ['qa'], uses: 0 })
}
