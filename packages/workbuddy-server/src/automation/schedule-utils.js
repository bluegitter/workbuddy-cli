'use strict';

const HOUR_MS = 3600000; const DAY_MS = 86400000; const WEEK_MS = 7 * DAY_MS;
const MAX_RECURRING_LOOKAHEAD_DAYS = 366 * 5; const MISSED_RUN_WINDOW_MS = 1440 * 60 * 1000;
const FULL_WEEK = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAY_TO_INDEX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const INDEX_TO_DAY = Object.fromEntries(Object.entries(DAY_TO_INDEX).map(([day, index]) => [index, day]));
const DEFAULT_JITTER_CONFIG = Object.freeze({ peakHours: [8, 9, 10], peakJitterMs: 600000, nonPeakJitterMs: 300000 });

function parsePositiveInteger(value, fallback) { const parsed = Number.parseInt(value || '', 10); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function clampNumber(value, min, max) { const parsed = Number.parseInt(value || '', 10); return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : min; }
function parseByDay(value) { return [...new Set((value || '').split(',').map((day) => day.trim().toUpperCase()).filter((day) => day in DAY_TO_INDEX))].sort((a, b) => DAY_TO_INDEX[a] - DAY_TO_INDEX[b]); }
function parseByMonthDay(value) { return [...new Set((value || '').split(',').map((part) => Number.parseInt(part.trim(), 10)).filter((day) => Number.isFinite(day) && day >= 1 && day <= 31))].sort((a, b) => a - b); }
function parseByMonth(value) { return [...new Set((value || '').split(',').map((part) => Number.parseInt(part.trim(), 10)).filter((month) => Number.isFinite(month) && month >= 1 && month <= 12))].sort((a, b) => a - b); }
function parseRRule(rrule) {
  const map = new Map(); for (const pair of (rrule || '').split(';')) { const [key, value] = pair.split('='); if (key && value) map.set(key.trim().toUpperCase(), value.trim().toUpperCase()); }
  const freq = map.get('FREQ') || 'DAILY'; const interval = parsePositiveInteger(map.get('INTERVAL'), 1); const byhour = clampNumber(map.get('BYHOUR'), 0, 23); const byminute = clampNumber(map.get('BYMINUTE'), 0, 59); const byday = parseByDay(map.get('BYDAY')); const bymonthday = parseByMonthDay(map.get('BYMONTHDAY')); const bymonth = parseByMonth(map.get('BYMONTH'));
  if (freq === 'DAILY') return { freq, interval, intervalHours: 1, byday: FULL_WEEK.slice(), bymonthday: [], bymonth: [], byhour, byminute };
  if (freq === 'HOURLY') return { freq, interval, intervalHours: interval, byday: byday.length ? byday : FULL_WEEK.slice(), bymonthday: [], bymonth: [], byhour, byminute };
  if (freq === 'WEEKLY') { if (!byday.length) throw new Error('WEEKLY RRULE requires BYDAY'); return { freq, interval, intervalHours: 1, byday, bymonthday: [], bymonth: [], byhour, byminute }; }
  if (freq === 'MONTHLY') { if (!bymonthday.length) throw new Error('MONTHLY RRULE requires BYMONTHDAY'); return { freq, interval, intervalHours: 1, byday: [], bymonthday, bymonth: [], byhour, byminute }; }
  if (freq === 'YEARLY') { if (!bymonth.length) throw new Error('YEARLY RRULE requires BYMONTH'); if (!bymonthday.length) throw new Error('YEARLY RRULE requires BYMONTHDAY'); return { freq, interval, intervalHours: 1, byday: [], bymonthday, bymonth, byhour, byminute }; }
  throw new Error(`Unsupported RRULE frequency: ${freq || 'UNKNOWN'}`);
}
function parseIsoTimestamp(value) { if (!value) return undefined; const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? timestamp : undefined; }
function deterministicFraction(id) { const hex = String(id || '').replace(/-/g, '').slice(0, 8).padEnd(8, '0'); const fraction = parseInt(hex, 16) / 4294967296; return Number.isFinite(fraction) ? fraction : 0; }
function getBeijingHour(timestampMs) { return new Date(timestampMs + new Date(timestampMs).getTimezoneOffset() * 60000 + 480 * 60000).getHours(); }
function isPeakHour(timestampMs, config = DEFAULT_JITTER_CONFIG) { return config.peakHours.includes(getBeijingHour(timestampMs)); }
function applyJitter(scheduledTimeMs, automationId, _periodMs, config = DEFAULT_JITTER_CONFIG) { const signed = (deterministicFraction(automationId) - 0.5) * 2; return scheduledTimeMs + signed * (isPeakHour(scheduledTimeMs, config) ? config.peakJitterMs : config.nonPeakJitterMs); }
function stableFractionFromString(seed) { let hash = 2166136261; for (let i = 0; i < seed.length; i += 1) { hash ^= seed.charCodeAt(i); hash = Math.imul(hash, 16777619); } return (hash >>> 0) / 4294967296; }
function getRecoveryWindowMs(occurrenceMs, config = { peakWindowMs: 1200000, nonPeakWindowMs: 600000 }) { return isPeakHour(occurrenceMs) ? config.peakWindowMs : config.nonPeakWindowMs; }
function computeRecoveryDelayMs(automationId, occurrenceMs, windowMs) { return !Number.isFinite(windowMs) || windowMs <= 0 ? 0 : Math.floor(stableFractionFromString(`${automationId}:${occurrenceMs}`) * windowMs); }
function getSearchStartMs(baseMs, lastRunAt, validFromMs, jitterConfig = DEFAULT_JITTER_CONFIG) { return Math.max(typeof lastRunAt === 'number' ? lastRunAt + Math.max(jitterConfig.peakJitterMs, jitterConfig.nonPeakJitterMs) + 1 : baseMs + 1, validFromMs ?? -Infinity); }
function startOfDayMs(ms) { const date = new Date(ms); date.setHours(0, 0, 0, 0); return date.getTime(); }
function startOfWeekMs(ms) { const date = new Date(ms); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date.getTime(); }
function getMonthIndex(ms) { const date = new Date(ms); return date.getFullYear() * 12 + date.getMonth(); }
function getIntervalAnchorMs(automation, validFromMs, fallbackMs) { return Math.max(validFromMs ?? (Number.isFinite(automation.created_at) ? automation.created_at : fallbackMs), Number.isFinite(automation.created_at) ? automation.created_at : fallbackMs); }
function matchesDayInterval(candidate, anchor, interval) { const diff = Math.floor((startOfDayMs(candidate) - anchor) / DAY_MS); return diff >= 0 && diff % Math.max(1, interval) === 0; }
function matchesWeekInterval(candidate, anchor, interval) { const diff = Math.floor((startOfWeekMs(candidate) - anchor) / WEEK_MS); return diff >= 0 && diff % Math.max(1, interval) === 0; }
function matchesMonthInterval(candidate, anchor, interval) { const diff = getMonthIndex(candidate) - anchor; return diff >= 0 && diff % Math.max(1, interval) === 0; }
function matchesYearInterval(year, anchor, interval) { const diff = year - anchor; return diff >= 0 && diff % Math.max(1, interval) === 0; }
function computeOnceNextRunAt(scheduledAt, validFrom, validUntil, lastRunAt) { const at = parseIsoTimestamp(scheduledAt); if (at === undefined || (validFrom !== undefined && at < validFrom) || (validUntil !== undefined && at > validUntil) || (typeof lastRunAt === 'number' && lastRunAt >= at)) return null; return at; }
function computeNextRunAt(automation, baseMs, lastRunAt, jitterConfig = DEFAULT_JITTER_CONFIG) {
  const base = Number.isFinite(baseMs) ? baseMs : Date.now(); const from = parseIsoTimestamp(automation.validFrom); const until = parseIsoTimestamp(automation.validUntil); if (from !== undefined && until !== undefined && from > until) return null; if (automation.scheduleType === 'once') return computeOnceNextRunAt(automation.scheduledAt, from, until, lastRunAt);
  let parsed; try { parsed = parseRRule(automation.rrule); } catch { return null; } const start = getSearchStartMs(base, lastRunAt, from, jitterConfig);
  if (parsed.freq === 'HOURLY') { let candidate = typeof lastRunAt === 'number' ? lastRunAt + parsed.intervalHours * HOUR_MS : base + parsed.intervalHours * HOUR_MS; candidate = Math.max(candidate, from ?? -Infinity); for (let i = 0; i < 336; i += 1) { if (parsed.byday.includes(INDEX_TO_DAY[new Date(candidate).getDay()])) break; candidate += HOUR_MS; } if (until !== undefined && candidate > until) return null; return applyJitter(candidate, automation.id, parsed.intervalHours * HOUR_MS, jitterConfig); }
  const date = new Date(start); const anchorDay = startOfDayMs(from ?? base); const anchorWeek = startOfWeekMs(getIntervalAnchorMs(automation, from, base)); const anchorMonth = getMonthIndex(getIntervalAnchorMs(automation, from, base)); const anchorYear = new Date(getIntervalAnchorMs(automation, from, base)).getFullYear();
  for (let offset = 0; offset <= MAX_RECURRING_LOOKAHEAD_DAYS; offset += 1) { const candidate = new Date(date); candidate.setDate(candidate.getDate() + offset); candidate.setHours(parsed.byhour, parsed.byminute, 0, 0); const ms = candidate.getTime(); if (ms < start) continue; let matches = false; if (parsed.freq === 'DAILY') matches = matchesDayInterval(ms, anchorDay, parsed.interval); else if (parsed.freq === 'WEEKLY') matches = parsed.byday.includes(INDEX_TO_DAY[candidate.getDay()]) && matchesWeekInterval(ms, anchorWeek, parsed.interval); else if (parsed.freq === 'MONTHLY') matches = parsed.bymonthday.includes(candidate.getDate()) && matchesMonthInterval(ms, anchorMonth, parsed.interval); else matches = parsed.bymonth.includes(candidate.getMonth() + 1) && parsed.bymonthday.includes(candidate.getDate()) && matchesYearInterval(candidate.getFullYear(), anchorYear, parsed.interval); if (!matches) continue; if (until !== undefined && ms > until) return null; const period = parsed.freq === 'WEEKLY' ? WEEK_MS / Math.max(1, parsed.byday.length) * parsed.interval : parsed.freq === 'MONTHLY' ? DAY_MS * 30 * parsed.interval : parsed.freq === 'YEARLY' ? DAY_MS * 365 * parsed.interval : DAY_MS * parsed.interval; return applyJitter(ms, automation.id, period, jitterConfig); }
  return null;
}
function isWithinMissedRunWindow(nextRunAt, now) { return now - nextRunAt <= MISSED_RUN_WINDOW_MS; }
function computeNextRunAtAfterSkippedOccurrence(automation, now) { return computeNextRunAt(automation, now, undefined); }

module.exports = { HOUR_MS, DAY_MS, WEEK_MS, MAX_RECURRING_LOOKAHEAD_DAYS, MISSED_RUN_WINDOW_MS, DEFAULT_JITTER_CONFIG, parseRRule, computeNextRunAt, computeNextRunAtAfterSkippedOccurrence, isWithinMissedRunWindow, deterministicFraction, stableFractionFromString, getRecoveryWindowMs, computeRecoveryDelayMs, applyJitter };
