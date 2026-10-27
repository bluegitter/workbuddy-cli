'use strict';

const TARGET_CODE = 'session_no_response_timeout';

class SessionNoResponseTimeoutProcessor {
  constructor({ monitorEvent } = {}) { this.monitorEvent = monitorEvent; }
  async process({ code, event = {} } = {}) {
    if (code !== TARGET_CODE || typeof this.monitorEvent !== 'function') return;
    try {
      this.monitorEvent(TARGET_CODE, {
        ext1: String(event.trace_id ?? 'unknown'),
        ext2: String(event.task_id ?? ''),
        ext3: String(event.request_id ?? 'unknown'),
        trace_id: String(event.trace_id ?? 'unknown'),
        request_id: String(event.request_id ?? 'unknown'),
        task_id: String(event.task_id ?? ''),
        duration_since_prompt_ms: Number(event.duration_since_prompt_ms ?? 0),
        duration_since_last_activity_ms: Number(event.duration_since_last_activity_ms ?? 0),
        has_activity: String(event.has_received_any_activity ?? false),
        run_state: String(event.current_run_state ?? ''),
        task_status: String(event.current_task_status ?? ''),
        state_transition_path: String(event.state_transition_path ?? ''),
      });
    } catch {}
  }
}

module.exports = { TARGET_CODE, SessionNoResponseTimeoutProcessor };
