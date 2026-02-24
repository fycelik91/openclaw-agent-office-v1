const { addEvent, listEventsSince } = require("./_store");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    const since = req.query?.since || "";
    return res.status(200).json({ ok: true, events: listEventsSince(since) });
  }

  if (req.method === "POST") {
    const payload = req.body || {};
    const event = addEvent(payload);
    if (event && event.status === "assigned") {
      addEvent({ ...event, eventId: `${event.eventId}-s`, status: "started", timestamp: new Date().toISOString() });
    }
    return res.status(200).json({ ok: true, event });
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
