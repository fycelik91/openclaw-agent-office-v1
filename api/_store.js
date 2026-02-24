const g = globalThis;
if (!g.__OPENCLAW_OFFICE_STORE__) {
  g.__OPENCLAW_OFFICE_STORE__ = {
    events: [],
    seen: new Set()
  };
}

function normalizeAgent(raw) {
  const v = String(raw || "main").toLowerCase();
  if (v.includes("orchestrator") || v.includes("main") || v.includes("ekrem")) return "main";
  if (v.includes("coder") || v.includes("mithat")) return "coder";
  if (v.includes("marketer") || v.includes("fikret")) return "marketer";
  if (v.includes("daily") || v.includes("pelin")) return "daily";
  if (v.includes("kalshi") || v.includes("investor") || v.includes("mehmet")) return "kalshi";
  return "main";
}

function normalizeSource(raw) {
  const v = String(raw || "openclaw").toLowerCase();
  if (v.includes("slack")) return "slack";
  if (v.includes("telegram")) return "telegram";
  return "openclaw";
}

function normalizeStatus(raw) {
  const v = String(raw || "assigned").toLowerCase();
  if (v.includes("start") || v.includes("progress") || v.includes("run")) return "started";
  if (v.includes("done") || v.includes("success") || v.includes("complete")) return "done";
  if (v.includes("fail") || v.includes("error") || v.includes("block")) return "failed";
  return "assigned";
}

function addEvent(input = {}) {
  const store = g.__OPENCLAW_OFFICE_STORE__;
  const event = {
    eventId: input.eventId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: input.taskId || `task-${Date.now()}`,
    agentId: normalizeAgent(input.agentId),
    status: normalizeStatus(input.status),
    source: normalizeSource(input.source),
    title: String(input.title || "Incoming task").slice(0, 120),
    timestamp: input.timestamp || new Date().toISOString(),
    meta: input.meta || {}
  };

  const key = `${event.eventId}:${event.status}`;
  if (store.seen.has(key)) return null;
  store.seen.add(key);

  store.events.unshift(event);
  if (store.events.length > 400) store.events.length = 400;
  return event;
}

function listEventsSince(since) {
  const store = g.__OPENCLAW_OFFICE_STORE__;
  if (!since) return store.events.slice(0, 50).reverse();
  return store.events.filter((e) => e.timestamp > since).reverse();
}

module.exports = { addEvent, listEventsSince };
