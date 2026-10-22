'use strict';

const FINAL_TASK_STATUSES = new Set(['completed', 'cancelled']);
const STATUS_WEIGHT = Object.freeze({ pending: 1, in_progress: 10, completed: 20, cancelled: 21 });

function isFinalTaskStatus(status) { return typeof status === 'string' && FINAL_TASK_STATUSES.has(status); }
function isFinalTaskList(tasks) { return tasks.length > 0 && tasks.every((task) => isFinalTaskStatus(task.status)); }
function projectTaskList(tasks) { return isFinalTaskList(tasks) ? [] : tasks.map((task) => ({ ...task })); }

function derivePlanStatus(statusMap, isTalking) {
  if (statusMap.size === 0) return undefined;
  const statuses = [...statusMap.values()];
  if (statuses.every((status) => status === 'completed')) return 'finished';
  if (statuses.some((status) => status === 'in_progress')) return isTalking ? 'building' : 'ready';
  return undefined;
}

function mergeTodoStatuses(statusMap, todos) {
  let changed = false;
  for (const todo of todos) {
    const id = todo.id === undefined || todo.id === null ? '' : String(todo.id);
    if (!id) continue;
    const currentWeight = STATUS_WEIGHT[statusMap.get(id)] || 0;
    if ((STATUS_WEIGHT[todo.status] || 0) > currentWeight) { statusMap.set(id, todo.status); changed = true; }
  }
  return changed;
}

class TodoProjection {
  constructor(sessionId, clock = Date.now) {
    this.sessionId = sessionId;
    this.clock = clock;
    this.items = [];
    this.statusMap = new Map();
    this.taskDataList = [];
    this.taskCreateTodoIdByToolId = new Map();
    this.isTalking = false;
    this.updatedAt = clock();
  }

  report(tasks) {
    this.items = tasks.map((task) => ({ id: task.id, content: task.content, activeForm: task.activeForm || task.content, status: task.status }));
    this.taskDataList = projectTaskList(tasks);
    mergeTodoStatuses(this.statusMap, tasks);
    this.touch();
  }

  setTalking(value) { if (this.isTalking !== value) { this.isTalking = value; this.touch(); } }
  touch() { this.derivedPlanStatus = derivePlanStatus(this.statusMap, this.isTalking); this.updatedAt = this.clock(); }
  snapshot() { return { sessionId: this.sessionId, items: this.items.map((item) => ({ ...item })), statusMap: new Map(this.statusMap), taskDataList: this.taskDataList.map((item) => ({ ...item })), derivedPlanStatus: this.derivedPlanStatus, isTalking: this.isTalking, updatedAt: this.updatedAt }; }
}

module.exports = { FINAL_TASK_STATUSES, STATUS_WEIGHT, TodoProjection, derivePlanStatus, isFinalTaskList, isFinalTaskStatus, mergeTodoStatuses, projectTaskList };
