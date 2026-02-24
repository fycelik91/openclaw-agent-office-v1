(() => {
  const canvas = document.getElementById("office-canvas");
  const ctx = canvas.getContext("2d");
  const feedEl = document.getElementById("live-feed");
  const statusEl = document.getElementById("agent-status");
  const connPill = document.getElementById("conn-pill");

  const SOURCE_COLORS = { slack: "#41c7f4", telegram: "#6dde8a", openclaw: "#ffd166" };
  const STATE_LABELS = {
    idle_wander: "Idle/Wander",
    idle_chat: "Idle/Chat",
    task_notified: "Notified",
    task_commute: "Commuting",
    task_working: "Working",
    task_done: "Done",
    task_failed: "Failed",
    confused: "Confused"
  };

  const AGENTS = [
    { id: "main", name: "Ekrem", role: "Orchestrator", color: "#f4a261", desk: { x: 250, y: 170 }, pos: { x: 260, y: 210 }, wander: [{ x: 500, y: 330 }, { x: 630, y: 390 }, { x: 360, y: 330 }] },
    { id: "coder", name: "Mithat", role: "Coder", color: "#7bdff2", desk: { x: 950, y: 160 }, pos: { x: 920, y: 220 }, wander: [{ x: 760, y: 350 }, { x: 870, y: 290 }, { x: 680, y: 420 }] },
    { id: "marketer", name: "Fikret", role: "Marketer", color: "#ff7f7f", desk: { x: 960, y: 340 }, pos: { x: 920, y: 390 }, wander: [{ x: 760, y: 360 }, { x: 640, y: 330 }, { x: 720, y: 490 }] },
    { id: "daily", name: "Pelin", role: "Daily", color: "#c2f970", desk: { x: 260, y: 520 }, pos: { x: 300, y: 460 }, wander: [{ x: 500, y: 390 }, { x: 430, y: 470 }, { x: 620, y: 430 }] },
    { id: "kalshi", name: "Mehmet", role: "Investor", color: "#b19cd9", desk: { x: 970, y: 530 }, pos: { x: 910, y: 500 }, wander: [{ x: 740, y: 540 }, { x: 630, y: 450 }, { x: 820, y: 430 }] }
  ].map((a) => ({
    ...a,
    state: "idle_wander",
    queue: [],
    currentTask: null,
    bubble: null,
    target: null,
    speed: 1.25,
    stateUntil: 0,
    notifyColor: "#ffd166",
    pulse: 0
  }));

  const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

  const bubbles = {
    main: ["Takim, siradaki is kimde?", "Oncelik: etkisi yuksek isler.", "Bu gorevi en dogru agente verelim."],
    coder: ["Build yesil.", "Loglar biraz supheli.", "Deploy oncesi son kontrol."],
    marketer: ["CTR bugun iyi.", "Bu kreatif daha guclu.", "Retention trendine bakalim."],
    daily: ["Bir saniye... notlar nerede?", "Tamam sakinim, hallediyorum.", "Takvim bende, kahve sende?"],
    kalshi: ["Volatilite yukseliyor.", "Risk/odul oranina bakalim.", "Bu giris icin erken olabilir."]
  };

  const feed = [];
  const seenEventIds = new Set();
  let lastEventTs = new Date(0).toISOString();

  function isoRect(x, y, w, h, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.transform(1, -0.35, 1, 0.35, 0, 0);
    ctx.fillStyle = color;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }

  function drawOffice() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isoRect(640, 390, 1010, 600, "#22364a");
    isoRect(640, 390, 990, 580, "#2b455d");

    const desks = [
      { x: 240, y: 150, label: "CEO", tone: "#35526d" },
      { x: 955, y: 145, label: "CODE", tone: "#2f4f6b" },
      { x: 965, y: 330, label: "MKT", tone: "#5f425a" },
      { x: 255, y: 520, label: "OPS", tone: "#4b5a42" },
      { x: 970, y: 525, label: "TRD", tone: "#51466d" }
    ];

    desks.forEach((d) => {
      isoRect(d.x, d.y, 120, 60, d.tone);
      ctx.fillStyle = "#dce9f9";
      ctx.font = "12px monospace";
      ctx.fillText(d.label, d.x - 18, d.y + 4);
    });

    isoRect(620, 390, 250, 160, "#314d63");
    ctx.fillStyle = "#c8d9ee";
    ctx.font = "13px monospace";
    ctx.fillText("LOUNGE", 585, 395);
  }

  function drawAgent(agent, now) {
    const bob = Math.sin(now / 120 + agent.pos.x) * 1.5;
    const pulse = agent.pulse > 0 ? Math.sin(now / 40) * 3 + 6 : 0;

    if (pulse > 0) {
      ctx.beginPath();
      ctx.fillStyle = `${agent.notifyColor}55`;
      ctx.arc(agent.pos.x, agent.pos.y + 4, 14 + pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#0c141d";
    ctx.fillRect(agent.pos.x - 6, agent.pos.y + 8, 14, 4);

    ctx.fillStyle = agent.color;
    ctx.fillRect(agent.pos.x - 5, agent.pos.y - 8 + bob, 10, 14);
    ctx.fillStyle = "#f4f7fb";
    ctx.fillRect(agent.pos.x - 3, agent.pos.y - 16 + bob, 7, 7);

    if (agent.state === "task_working") {
      ctx.fillStyle = "#f9d65c";
      ctx.fillRect(agent.pos.x + 8, agent.pos.y - 18, 3, 3);
      ctx.fillRect(agent.pos.x + 12, agent.pos.y - 22, 2, 2);
    }

    ctx.fillStyle = "#dce9f9";
    ctx.font = "11px monospace";
    ctx.fillText(agent.name, agent.pos.x - 16, agent.pos.y + 22);

    if (agent.bubble && agent.bubble.until > now) {
      const text = agent.bubble.text;
      const w = Math.max(80, text.length * 6 + 10);
      ctx.fillStyle = "#0f1822e0";
      ctx.fillRect(agent.pos.x - w / 2, agent.pos.y - 44, w, 18);
      ctx.fillStyle = "#cfe0f6";
      ctx.font = "11px monospace";
      ctx.fillText(text, agent.pos.x - w / 2 + 6, agent.pos.y - 31);
    }
  }

  function moveToward(agent, target) {
    const dx = target.x - agent.pos.x;
    const dy = target.y - agent.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= agent.speed) {
      agent.pos.x = target.x;
      agent.pos.y = target.y;
      return true;
    }
    agent.pos.x += (dx / dist) * agent.speed;
    agent.pos.y += (dy / dist) * agent.speed;
    return false;
  }

  function setBubble(agent, text, ms = 2200) {
    agent.bubble = { text, until: performance.now() + ms };
  }

  function enqueueFeed(evt) {
    feed.unshift(evt);
    if (feed.length > 20) feed.length = 20;
    renderFeed();
  }

  function renderFeed() {
    feedEl.innerHTML = "";
    feed.forEach((e) => {
      const li = document.createElement("li");
      li.innerHTML = `<div><b>${e.agentId}</b> ${e.status} - ${escapeHtml(e.title || "task")}</div>
        <div class="meta">${e.source} | ${new Date(e.timestamp || Date.now()).toLocaleTimeString()}</div>`;
      feedEl.appendChild(li);
    });
  }

  function renderStatus() {
    statusEl.innerHTML = "";
    AGENTS.forEach((a) => {
      const row = document.createElement("div");
      row.className = "agent-row";
      row.innerHTML = `<div>
        <div class="name">${a.name} <span class="state">(${STATE_LABELS[a.state] || a.state})</span></div>
        <div class="queue">Queue: ${a.queue.length}</div>
      </div>
      <div>${a.role}</div>`;
      statusEl.appendChild(row);
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function random(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function scheduleIdle(agent) {
    const now = performance.now();
    if (Math.random() < 0.24) {
      agent.state = "idle_chat";
      setBubble(agent, random(bubbles[agent.id]));
      agent.stateUntil = now + 1700 + Math.random() * 1800;
      agent.target = null;
    } else {
      agent.state = "idle_wander";
      agent.target = { ...random(agent.wander) };
      agent.stateUntil = now + 1800 + Math.random() * 2800;
    }
  }

  function assignTask(agent, evt) {
    if (agent.currentTask && agent.currentTask.taskId === evt.taskId) return;
    if (agent.state === "task_working") {
      agent.queue.push(evt);
      return;
    }

    agent.currentTask = evt;
    agent.state = "task_notified";
    agent.notifyColor = SOURCE_COLORS[evt.source] || "#ffd166";
    agent.pulse = 1;
    setBubble(agent, `${evt.source}: ${evt.title || "new task"}`.slice(0, 30), 1600);
    agent.stateUntil = performance.now() + 1000;
  }

  function applyEvent(evt) {
    if (!evt || !evt.agentId || !evt.status) return;
    if (evt.eventId && seenEventIds.has(evt.eventId)) return;
    if (evt.eventId) seenEventIds.add(evt.eventId);

    if (evt.timestamp && evt.timestamp > lastEventTs) {
      lastEventTs = evt.timestamp;
    }

    enqueueFeed(evt);
    const agent = AGENT_BY_ID[evt.agentId];
    if (!agent) return;

    if (evt.status === "assigned") {
      assignTask(agent, evt);
    } else if (evt.status === "started") {
      if (!agent.currentTask || agent.currentTask.taskId !== evt.taskId) {
        agent.currentTask = evt;
      }
      agent.state = agent.id === "daily" ? "confused" : "task_commute";
      if (agent.state === "confused") {
        setBubble(agent, "Bir saniye...", 900);
        agent.stateUntil = performance.now() + 900;
      } else {
        agent.target = { ...agent.desk };
      }
    } else if (evt.status === "done") {
      agent.state = "task_done";
      agent.notifyColor = "#48d597";
      agent.pulse = 1;
      setBubble(agent, "Tamamlandi", 1200);
      agent.stateUntil = performance.now() + 1400;
    } else if (evt.status === "failed") {
      agent.state = "task_failed";
      agent.notifyColor = "#ff6262";
      agent.pulse = 1;
      setBubble(agent, "Takildim", 1200);
      agent.stateUntil = performance.now() + 1700;
    }

    renderStatus();
  }

  function tick(now) {
    drawOffice();

    AGENTS.forEach((agent) => {
      if (agent.pulse > 0) agent.pulse -= 0.012;

      if (agent.state === "task_notified" && now >= agent.stateUntil) {
        agent.state = "task_commute";
        agent.target = { ...agent.desk };
      } else if (agent.state === "confused" && now >= agent.stateUntil) {
        agent.state = "task_commute";
        agent.target = { ...agent.desk };
      } else if (agent.state === "task_commute" && agent.target) {
        if (moveToward(agent, agent.target)) {
          agent.state = "task_working";
          agent.stateUntil = now + 2200 + Math.random() * 2600;
          setBubble(agent, "Calisiyorum", 1400);
        }
      } else if (agent.state === "task_working" && now >= agent.stateUntil) {
        const syntheticDone = {
          eventId: `auto-${Date.now()}-${agent.id}`,
          taskId: agent.currentTask?.taskId || `task-${Date.now()}`,
          agentId: agent.id,
          status: "done",
          source: agent.currentTask?.source || "openclaw",
          title: agent.currentTask?.title || "Task",
          timestamp: new Date().toISOString()
        };
        applyEvent(syntheticDone);
      } else if ((agent.state === "task_done" || agent.state === "task_failed") && now >= agent.stateUntil) {
        agent.currentTask = null;
        if (agent.queue.length > 0) {
          const next = agent.queue.shift();
          assignTask(agent, next);
        } else {
          scheduleIdle(agent);
        }
      } else if ((agent.state === "idle_wander" || agent.state === "idle_chat") && now >= agent.stateUntil) {
        scheduleIdle(agent);
      }

      if (agent.state === "idle_wander" && agent.target) moveToward(agent, agent.target);
      drawAgent(agent, now);
    });

    requestAnimationFrame(tick);
  }

  function seedIdle() {
    AGENTS.forEach((a) => scheduleIdle(a));
    renderStatus();
  }

  async function pollEvents() {
    const configuredBase = window.OFFICE_CONFIG?.apiBase || "";
    const apiBase = configuredBase.replace(/\/$/, "");
    const endpoint = apiBase ? `${apiBase}/api/events?since=${encodeURIComponent(lastEventTs)}` : `/api/events?since=${encodeURIComponent(lastEventTs)}`;

    try {
      const res = await fetch(endpoint, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      connPill.textContent = "LIVE";
      connPill.style.color = "#48d597";
      (data.events || []).forEach(applyEvent);
    } catch (_err) {
      connPill.textContent = "RETRYING";
      connPill.style.color = "#ffbf69";
    }
  }

  function startPolling() {
    pollEvents();
    setInterval(pollEvents, 2000);
  }

  function demoPulse() {
    const agentIds = ["main", "coder", "marketer", "daily", "kalshi"];
    const titles = ["New thread", "Code fix", "Campaign tweak", "Schedule task", "Market check"];
    setInterval(() => {
      if (feed.length > 0) return;
      const agentId = random(agentIds);
      const source = random(["slack", "telegram"]);
      const taskId = `${source}-${Date.now()}`;
      applyEvent({ eventId: `${taskId}-a`, taskId, agentId, source, status: "assigned", title: random(titles), timestamp: new Date().toISOString() });
      setTimeout(() => applyEvent({ eventId: `${taskId}-s`, taskId, agentId, source, status: "started", title: random(titles), timestamp: new Date().toISOString() }), 450);
    }, 15000);
  }

  seedIdle();
  startPolling();
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") {
    demoPulse();
  }
  requestAnimationFrame(tick);
})();
