const { addEvent } = require("./_store");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const body = req.body || {};
  const msg = body.message || body.edited_message || body.channel_post || {};
  const text = msg.text || msg.caption || "Telegram task";
  const messageId = msg.message_id || Date.now();
  const hint = msg.from?.username || msg.chat?.title || "main";

  const assigned = addEvent({
    eventId: `tg-${messageId}-a`,
    taskId: `tg-${messageId}`,
    source: "telegram",
    status: "assigned",
    agentId: hint,
    title: text,
    meta: { chatId: msg.chat?.id || null }
  });

  if (assigned) {
    addEvent({
      eventId: `tg-${messageId}-s`,
      taskId: assigned.taskId,
      source: "telegram",
      status: "started",
      agentId: assigned.agentId,
      title: assigned.title
    });
  }

  return res.status(200).json({ ok: true });
};
