'use strict';

const FINAL_TASK_STATUSES = new Set(['completed', 'cancelled']);

function isFinalTaskStatus(status) {
  return typeof status === 'string' && FINAL_TASK_STATUSES.has(status);
}

function isFinalTaskList(tasks) {
  return tasks.length > 0 && tasks.every((task) => isFinalTaskStatus(task.status));
}

function projectTaskList(tasks) {
  return isFinalTaskList(tasks) ? [] : tasks.map((task) => ({ ...task }));
}

module.exports = Object.freeze({
  FINAL_TASK_STATUSES,
  isFinalTaskStatus,
  isFinalTaskList,
  projectTaskList,
});
