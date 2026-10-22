'use strict';

const fs = require('fs').promises;
const path = require('path');

const IDLE_CAPABILITY_STATE_FILENAME = 'usage-log.json';
function formatDate(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function daysBetween(dateA, dateB) { return Math.round((new Date(`${dateA}T00:00:00`) - new Date(`${dateB}T00:00:00`)) / 864e5); }
function prependDate(dates, date, max) { return [date, ...(dates || []).filter((item) => item !== date)].slice(0, max); }
function createInitialState() { return { version: 1, skills: {}, mcps: {}, activeDays: [], dismissedIdle: {} }; }
function normalizeState(raw) { const initial = createInitialState(); if (!raw || typeof raw !== 'object') return initial; return { version: typeof raw.version === 'number' ? raw.version : 1, skills: raw.skills && typeof raw.skills === 'object' ? raw.skills : {}, mcps: raw.mcps && typeof raw.mcps === 'object' ? raw.mcps : {}, activeDays: Array.isArray(raw.activeDays) ? raw.activeDays.filter((item) => typeof item === 'string') : [], dismissedIdle: raw.dismissedIdle && typeof raw.dismissedIdle === 'object' ? raw.dismissedIdle : {}, ...(typeof raw.lastShownDate === 'string' ? { lastShownDate: raw.lastShownDate } : {}), ...(raw.globalDismissed === true ? { globalDismissed: true } : {}) }; }
function bucketKey(type) { return type === 'skill' ? 'skills' : type === 'mcp' || type === 'connector' ? 'mcps' : null; }
function applyUsage(state, observation, today) { const bucket = bucketKey(observation.type); if (!bucket) return state; const previous = state[bucket][observation.id]; const dismissedIdle = { ...state.dismissedIdle }; delete dismissedIdle[`${observation.type}:${observation.id}`]; return { ...state, [bucket]: { ...state[bucket], [observation.id]: { id: observation.id, type: observation.type, lastUsedDate: today, recentDates: prependDate(previous?.recentDates, today, 30), firstSeenDate: previous?.firstSeenDate || today } }, dismissedIdle }; }
function applyActiveDay(state, today) { return state.activeDays[0] === today ? state : { ...state, activeDays: prependDate(state.activeDays, today, 30) }; }
function applyDismiss(state, type, id) { return { ...state, dismissedIdle: { ...state.dismissedIdle, [`${type}:${id}`]: Date.now() } }; }
function applyForget(state, type, id) { const bucket = bucketKey(type); const next = { ...state, dismissedIdle: { ...state.dismissedIdle } }; if (bucket && type !== 'connector') { next[bucket] = { ...state[bucket] }; delete next[bucket][id]; } delete next.dismissedIdle[`${type}:${id}`]; return next; }
function timestampToDate(timestamp) { if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) return undefined; const date = new Date(timestamp); return Number.isFinite(date.getTime()) ? formatDate(date) : undefined; }
function computeIdleCandidates(state, today, installed = {}, options = {}) {
  const threshold = options.idleThreshold ?? 14; const result = []; const cap = (type, id, days) => { if (type !== 'skill') return days; const installedDate = timestampToDate(installed.skillInstalledAt?.[id]); return installedDate ? Math.min(days, Math.max(0, daysBetween(today, installedDate))) : days; };
  const push = (type, id, bucket) => { if (state.dismissedIdle[`${type}:${id}`] !== undefined) return; const entry = bucket?.[id]; const idleDays = cap(type, id, entry ? daysBetween(today, entry.lastUsedDate) : threshold); if (idleDays >= threshold) result.push({ type, id, idleDays, lastUsedDate: entry?.lastUsedDate || '' }); };
  for (const id of installed.skills || []) push('skill', id, state.skills); for (const id of installed.mcps || []) push('mcp', id, state.mcps); for (const id of installed.subagents || []) push('subagent', id); for (const id of installed.connectors || []) push('connector', id, state.mcps); return result;
}

class WorkbuddyIdleCapabilityService {
  constructor({ homeDir, logger = console } = {}) { if (!homeDir) throw new Error('[IdleCapability] requires homeDir'); this.stateFile = path.join(homeDir, IDLE_CAPABILITY_STATE_FILENAME); this.logger = logger; this.cached = null; this.writeChain = Promise.resolve(); }
  async loadState() { if (this.cached) return this.cached; try { this.cached = normalizeState(JSON.parse(await fs.readFile(this.stateFile, 'utf8'))); } catch (error) { if (error?.code !== 'ENOENT') this.logger.warn?.('[IdleCapability] loadState failed', error); this.cached = createInitialState(); } return this.cached; }
  scheduleWrite(mutator) { const next = this.writeChain.then(async () => { const previous = await this.loadState(); const updated = mutator(previous); if (updated === previous) return; this.cached = updated; await fs.mkdir(path.dirname(this.stateFile), { recursive: true }); await fs.writeFile(this.stateFile, JSON.stringify(updated, null, 2), 'utf8'); }); this.writeChain = next.catch((error) => this.logger.error?.('[IdleCapability] writeState failed', error)); return next; }
  recordUsage(observation) { return this.scheduleWrite((state) => applyUsage(state, observation, formatDate(new Date()))); }
  recordActiveDay() { return this.scheduleWrite((state) => applyActiveDay(state, formatDate(new Date()))); }
  async getIdleCardData(installed) { const state = await this.loadState(); const today = formatDate(new Date()); if (state.globalDismissed || state.activeDays.length < 14 || state.lastShownDate === today) return null; const candidates = computeIdleCandidates(state, today, installed); return candidates.length ? { candidates, activeDayCount: state.activeDays.length } : null; }
  markShown() { return this.scheduleWrite((state) => ({ ...state, lastShownDate: formatDate(new Date()) })); }
  dismiss(type, id) { return this.scheduleWrite((state) => applyDismiss(state, type, id)); }
  dismissGlobal() { return this.scheduleWrite((state) => ({ ...state, globalDismissed: true })); }
  forgetCapability(type, id) { return this.scheduleWrite((state) => applyForget(state, type, id)); }
  async listCandidates(installed, options) { return computeIdleCandidates(await this.loadState(), formatDate(new Date()), installed, options); }
}

module.exports = { IDLE_CAPABILITY_STATE_FILENAME, formatDate, daysBetween, createInitialState, normalizeState, computeIdleCandidates, WorkbuddyIdleCapabilityService, createIdleCapabilityService: (deps) => new WorkbuddyIdleCapabilityService(deps) };
