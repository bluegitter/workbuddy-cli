'use strict';

const STARTUP_CONTEXT_ENV = Object.freeze({
  PID: 'WORKBUDDY_STARTUP_PID',
  DATE: 'WORKBUDDY_STARTUP_DATE',
  TIME: 'WORKBUDDY_STARTUP_TIME',
});

let current;

function safeTimeOrigin() {
  try { return performance.timeOrigin; } catch { return Date.now(); }
}

function formatStartupDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatStartupTime(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function setStartupContext(context) { current = { ...context }; return { ...current }; }
function getStartupContext() { return current && { ...current }; }

function initMainStartupContext() {
  const now = new Date();
  return setStartupContext({ pid: process.pid, date: formatStartupDate(now), time: formatStartupTime(now), proc: 'main', timeOrigin: safeTimeOrigin() });
}

function initStartupContextFromEnv(proc, env = process.env) {
  const pid = Number(env[STARTUP_CONTEXT_ENV.PID]);
  const date = env[STARTUP_CONTEXT_ENV.DATE];
  const time = env[STARTUP_CONTEXT_ENV.TIME];
  const now = new Date();
  return setStartupContext({
    pid: Number.isFinite(pid) && pid > 0 ? pid : process.pid,
    date: /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : formatStartupDate(now),
    time: /^\d{6}$/.test(time || '') ? time : formatStartupTime(now),
    proc,
    timeOrigin: safeTimeOrigin(),
  });
}

function buildStartupContextEnv() {
  const context = current || initMainStartupContext();
  return {
    [STARTUP_CONTEXT_ENV.PID]: String(context.pid),
    [STARTUP_CONTEXT_ENV.DATE]: context.date,
    [STARTUP_CONTEXT_ENV.TIME]: context.time,
  };
}

module.exports = {
  STARTUP_CONTEXT_ENV,
  buildStartupContextEnv,
  formatStartupDate,
  formatStartupTime,
  getStartupContext,
  initMainStartupContext,
  initStartupContextFromEnv,
};
