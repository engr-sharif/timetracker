/**
 * Minimal GitHub Gist client used as a private sync backend.
 * Everything lives in one private gist owned by the user.
 */

export const DOC_FILE = 'workbench-v4.json'
export const LEGACY_FILE = 'jacobs-timetracker-data-v3.json'
const API = 'https://api.github.com'

export interface GithubUser {
  login: string
  name: string | null
  avatar_url: string
}

interface GistFile {
  filename: string
  content?: string
  truncated?: boolean
  raw_url: string
}

interface Gist {
  id: string
  description: string
  files: Record<string, GistFile>
}

function headers(token: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function readFile(token: string, file: GistFile) {
  if (!file.truncated && file.content != null) return file.content
  const res = await fetch(file.raw_url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Gist file fetch failed (${res.status})`)
  return res.text()
}

export async function validateToken(token: string): Promise<GithubUser> {
  const res = await fetch(`${API}/user`, { headers: headers(token) })
  if (res.status === 401) throw new Error('That token was rejected by GitHub.')
  if (!res.ok) throw new Error(`GitHub returned ${res.status}.`)
  const scopes = res.headers.get('x-oauth-scopes')
  if (scopes !== null && scopes !== '' && !scopes.split(/,\s*/).includes('gist')) {
    throw new Error('The token needs the “gist” scope.')
  }
  return res.json()
}

export async function getGist(token: string, gistId: string): Promise<Gist> {
  const res = await fetch(`${API}/gists/${gistId}`, { headers: headers(token), cache: 'no-store' })
  if (!res.ok) throw new Error(`Could not load gist (${res.status})`)
  return res.json()
}

/** Find an existing Workbench/TimeTracker gist so a new device reconnects to the same data. */
export async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${API}/gists?per_page=100&page=${page}`, { headers: headers(token) })
    if (!res.ok) return null
    const list: Gist[] = await res.json()
    const hit =
      list.find((g) => g.files[DOC_FILE]) ?? list.find((g) => g.files[LEGACY_FILE])
    if (hit) return hit.id
    if (list.length < 100) break
  }
  return null
}

export async function createGist(token: string, content: string): Promise<string> {
  const res = await fetch(`${API}/gists`, {
    method: 'POST',
    headers: headers(token, true),
    body: JSON.stringify({
      description: 'Workbench — private workspace data',
      public: false,
      files: { [DOC_FILE]: { content } },
    }),
  })
  if (!res.ok) throw new Error(`Could not create gist (${res.status})`)
  return (await res.json()).id
}

export async function readGistDoc(token: string, gistId: string) {
  const gist = await getGist(token, gistId)
  const docFile = gist.files[DOC_FILE]
  const legacyFile = gist.files[LEGACY_FILE]
  return {
    doc: docFile ? JSON.parse(await readFile(token, docFile)) : null,
    legacy: !docFile && legacyFile ? JSON.parse(await readFile(token, legacyFile)) : null,
    files: Object.keys(gist.files),
  }
}

export async function writeGistFiles(token: string, gistId: string, files: Record<string, string | null>) {
  const body = {
    files: Object.fromEntries(
      Object.entries(files).map(([name, content]) => [name, content === null ? null : { content }]),
    ),
  }
  const res = await fetch(`${API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: headers(token, true),
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Sync write failed (${res.status})`)
}

export async function readGistFile(token: string, gistId: string, name: string) {
  const gist = await getGist(token, gistId)
  const f = gist.files[name]
  return f ? readFile(token, f) : null
}
