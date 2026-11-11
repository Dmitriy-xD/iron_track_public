// Client of the IRONTRACK PHP server (server/api). Same origin by default: https://<site>/api/...
declare const __API_URL__: string

const TOKEN_KEY = 'irontrack.token'
const base = () => (__API_URL__ || './api').replace(/\/$/, '')

export interface User { id: string; email: string; name: string; role: 'admin' | 'user'; is_trainer: boolean }

export function getToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) ?? '' } catch { return '' }
}
export function setToken(t: string) {
  try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY) } catch { /* storage unavailable */ }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

let onUnauthorized: () => void = () => {}

/** Trainer works in a client's notebook: all sync calls go with ?as=CLIENT_ID. */
let actingAs: string | null = null
export const setActingAs = (id: string | null) => { actingAs = id }
export const setUnauthorizedHandler = (f: () => void) => { onUnauthorized = f }

export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) { headers.Authorization = `Bearer ${token}`; headers['X-Auth-Token'] = token }
  let res: Response
  try {
    if (actingAs && path.startsWith('data.php')) path += `&as=${encodeURIComponent(actingAs)}`
    res = await fetch(`${base()}/${path}`, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch {
    throw new ApiError('Нет связи с сервером', 0)
  }
  const text = await res.text()
  let json: unknown = null
  try { json = text ? JSON.parse(text) : null } catch { /* not JSON */ }
  if (!res.ok) {
    if (res.status === 401 && token) { setToken(''); onUnauthorized() }
    const msg = (json as { error?: string } | null)?.error ?? `Ошибка сервера (${res.status})`
    throw new ApiError(msg, res.status)
  }
  return json as T
}

// ---------------------------------------------------------------- auth

interface TokenResponse { access_token: string; user: User }

export const auth = {
  async signIn(email: string, password: string): Promise<User> {
    const r = await api<TokenResponse>('auth.php?action=signin', { email, password, device: 'web' })
    setToken(r.access_token)
    return r.user
  },
  signUp: (email: string, password: string, name: string, consent: boolean) =>
    api<{ message: string }>('auth.php?action=signup', { email, password, name, consent }).then(r => r.message),
  resend: (email: string) => api<{ message: string }>('auth.php?action=resend', { email }).then(r => r.message),
  recover: (email: string) => api<{ message: string }>('auth.php?action=recover', { email }).then(r => r.message),
  reset: (token: string, password: string) => api<{ message: string }>('auth.php?action=reset', { token, password }).then(r => r.message),
  me: () => api<{ user: User }>('auth.php?action=me').then(r => r.user),
  async signOut() {
    try { await api('auth.php?action=signout', {}) } catch { /* already gone */ }
    setToken('')
  },
  deleteAccount: (password: string) => api('auth.php?action=delete', { password }).then(() => setToken(''))
}

// ---------------------------------------------------------------- sync tables

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>

/** All rows of a table that are not deleted. */
export async function pullAll(table: string): Promise<Row[]> {
  const out: Row[] = []
  for (let offset = 0; ; offset += 1000) {
    const page = await api<Row[]>(`data.php?table=${table}&since=&offset=${offset}&limit=1000`)
    out.push(...page)
    if (page.length < 1000) break
  }
  return out.filter(r => !r.deleted)
}

export async function push(table: string, rows: Row[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) await api(`data.php?table=${table}`, rows.slice(i, i + 500))
}

export const markDeleted = (table: string, keys: string[], updatedAt: number) =>
  keys.length ? api('data.php?action=mark_deleted', { table, keys, updated_at: updatedAt }) : Promise.resolve()

export const editSessionTimes = (id: string, startedAt: number, finishedAt: number | null, title?: string | null) =>
  api('data.php?action=session_times', { id, started_at: startedAt, finished_at: finishedAt, title })

// ---------------------------------------------------------------- other people (admin, trainer)

export interface Dataset { sessions: Row[]; sets: Row[]; measurements: Row[]; plan_days: Row[]; custom_exercises: Row[]; profile: Row | null }
export interface Client { id: string; name: string; email: string; own_account: boolean; workouts: number; last_workout_at: number | null; since: number }
export interface Trainer { id: string; name: string; email: string; since: number }

export const trainer = {
  setTrainer: (on: boolean) => api<{ user: User }>('trainer.php?action=set_trainer', { on }).then(r => r.user),
  clients: () => api<Client[]>('trainer.php?action=clients'),
  create: (name: string) => api<{ id: string }>('trainer.php?action=create', { name }).then(r => r.id),
  rename: (clientId: string, name: string) => api('trainer.php?action=rename', { client_id: Number(clientId), name }),
  code: (clientId: string) => api<{ code: string; days: number }>('trainer.php?action=code', { client_id: Number(clientId) }),
  remove: (clientId: string) => api('trainer.php?action=remove', { client_id: Number(clientId) }),
  trainers: () => api<Trainer[]>('trainer.php?action=trainers'),
  redeem: (code: string) => api<{ message: string }>('trainer.php?action=redeem', { code }).then(r => r.message),
  leave: (trainerId: string) => api('trainer.php?action=leave', { trainer_id: Number(trainerId) })
}

export interface AdminUser {
  id: string; email: string; name: string; notebook_of: string | null; is_admin: boolean; is_trainer: boolean; confirmed: boolean
  consent_at: number | null; consent_version: string; created_at: number; last_seen_at: number | null
  workouts: number; sets: number; last_workout_at: number | null
}
export interface AdminExercise { id: number; title: string; muscle: string; secondary: string[]; public: boolean; users: { id: string; email: string }[] }
export interface SupportMessage { id: number; email: string | null; name: string; contact: string; text: string; created_at: number; delivered: boolean }

export const admin = {
  users: () => api<AdminUser[]>('admin.php?action=users'),
  user: (id: string) => api<{ user: AdminUser & User & { consent_ip: string }; trainers: Row[]; clients: Row[]; data: Dataset }>(`admin.php?action=user&id=${id}`),
  editSession: (userId: string, id: string, startedAt: number, finishedAt: number | null) =>
    api('admin.php?action=session', { user_id: Number(userId), id, started_at: startedAt, finished_at: finishedAt }),
  exercises: () => api<AdminExercise[]>('admin.php?action=exercises'),
  saveExercise: (e: { id?: number; title: string; muscle: string; secondary: string[]; public: boolean; user_ids: number[] }) => api('admin.php?action=exercise_save', e),
  deleteExercise: (id: number) => api('admin.php?action=exercise_delete', { id }),
  support: () => api<SupportMessage[]>('admin.php?action=support')
}

export const support = {
  send: (text: string, contact: string, name: string) => api<{ message: string }>('support.php', { text, contact, name }).then(r => r.message)
}
