const { addEvent } = require("./_store");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body || {};
  if (body.challenge) {
    return res.status(200).json({ challenge: body.challenge });
  }

  const text = body.text || body.event?.text || "Slack task";
  const ts = body.event?.ts || body.ts || `${Date.now()}`;
  const account = body.accountId || body.team_id || body.event?.username || "orchestrator";

  const assigned = addEvent({
    eventId: `slack-${ts}-a`,
    taskId: `slack-${ts}`,
    source: "slack",
    status: "assigned",
    agentId: account,
    title: text,
    meta: { rawType: body.type || body.event?.type || "slack" }
  });

  if (assigned) {
    addEvent({
      eventId: `slack-${ts}-s`,
      taskId: assigned.taskId,
      source: "slack",
      status: "started",
      agentId: assigned.agentId,
      title: assigned.title
    });
  }

  return res.status(200).json({ ok: true });
};
