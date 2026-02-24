(() => {
  'use strict';

  const canvas = document.getElementById("office-canvas");
  const ctx = canvas.getContext("2d");
  const feedEl = document.getElementById("live-feed");
  const statusEl = document.getElementById("agent-status");
  const connPill = document.getElementById("conn-pill");

  // ── CONFIG ───────────────────────────────────────────────
  const TILE = 20;
  const SOURCE_COLORS = { slack: "#41c7f4", telegram: "#6dde8a", openclaw: "#ffd166" };
  const STATUS_COLORS  = { assigned: "#ffd166", started: "#64d2ff", done: "#48d597", failed: "#ff6262" };
  const STATE_LABELS   = {
    idle_wander: "Idle/Wander", idle_chat: "Idle/Chat",
    task_notified: "Notified",  task_commute: "Commuting",
    task_working: "Working",    task_done: "Done",   task_failed: "Failed"
  };

  // ── FLOOR PATTERN (draw once) ────────────────────────────
  const floorOff = document.createElement("canvas");
  floorOff.width = TILE * 2; floorOff.height = TILE * 2;
  const fctx = floorOff.getContext("2d");
  fctx.fillStyle = "#0d1620"; fctx.fillRect(0, 0, TILE * 2, TILE * 2);
  fctx.fillStyle = "#0a1218"; fctx.fillRect(0, 0, TILE, TILE);
  fctx.fillStyle = "#0a1218"; fctx.fillRect(TILE, TILE, TILE, TILE);
  const floorPattern = ctx.createPattern(floorOff, "repeat");

  // ── ROOMS ────────────────────────────────────────────────
  // Canvas: 1280 × 720
  // Layout: top row (conference | CEO Office | kitchen) + right lounge strip
  //         bottom row (4 agent rooms) + open hallway below
  const ROOMS = {
    conference: { x: 16,   y: 16,  w: 232, h: 182, label: "Conference",  lc: "#7a8faa", bg: "rgba(10,18,28,0.82)"                          },
    ceo:        { x: 264,  y: 16,  w: 292, h: 202, label: "CEO Office",  lc: "#f9d65c", bg: "rgba(14,18,36,0.88)", agentId: "main"          },
    kitchen:    { x: 572,  y: 16,  w: 224, h: 182, label: "Kitchen",     lc: "#8899bb", bg: "rgba(10,20,26,0.82)"                           },
    code:       { x: 16,   y: 258, w: 232, h: 196, label: "CODE",        lc: "#7bdff2", bg: "rgba(8,18,30,0.85)",  agentId: "coder"         },
    mkt:        { x: 264,  y: 258, w: 232, h: 196, label: "MKT",         lc: "#ff7faf", bg: "rgba(22,8,26,0.85)",  agentId: "marketer"      },
    ops:        { x: 512,  y: 258, w: 232, h: 196, label: "OPS",         lc: "#c2f970", bg: "rgba(8,22,14,0.85)",  agentId: "daily"         },
    trd:        { x: 760,  y: 258, w: 232, h: 196, label: "TRD",         lc: "#b19cd9", bg: "rgba(16,8,28,0.85)",  agentId: "kalshi"        },
    lounge:     { x: 1016, y: 16,  w: 248, h: 480, label: "Lounge",      lc: "#6dde8a", bg: "rgba(8,20,14,0.82)"                           }
  };

  function getDeskPos(agentId) {
    for (const r of Object.values(ROOMS)) {
      if (r.agentId === agentId) return { x: r.x + r.w * 0.5, y: r.y + r.h * 0.58 };
    }
    return { x: 500, y: 360 };
  }

  function getRoomWander(agentId) {
    for (const r of Object.values(ROOMS)) {
      if (r.agentId === agentId) {
        return [
          { x: r.x + r.w * 0.22, y: r.y + r.h * 0.82 },
          { x: r.x + r.w * 0.50, y: r.y + r.h * 0.88 },
          { x: r.x + r.w * 0.78, y: r.y + r.h * 0.82 },
          { x: r.x + r.w * 0.22, y: r.y + r.h * 0.70 },
          { x: r.x + r.w * 0.78, y: r.y + r.h * 0.70 },
        ];
      }
    }
    return [];
  }

  // Hallway / common wander points
  const HALL_WANDER = [
    { x: 130, y: 238 }, { x: 380, y: 238 }, { x: 630, y: 238 }, { x: 870, y: 238 },
    { x: 130, y: 500 }, { x: 380, y: 500 }, { x: 630, y: 500 }, { x: 870, y: 500 },
    { x: 1065, y: 180 }, { x: 1130, y: 320 }, { x: 1185, y: 430 }, { x: 1060, y: 460 },
  ];

  // ── AGENTS ───────────────────────────────────────────────
  const AGENT_DEFS = [
    { id: "main",     name: "Ekrem",  role: "Orchestrator", color: "#f4a261" },
    { id: "coder",    name: "Mithat", role: "Coder",        color: "#7bdff2" },
    { id: "marketer", name: "Fikret", role: "Marketer",     color: "#ff7faf" },
    { id: "daily",    name: "Pelin",  role: "Daily",        color: "#c2f970" },
    { id: "kalshi",   name: "Mehmet", role: "Investor",     color: "#b19cd9" }
  ];

  const BUBBLES = {
    main:     ["Öncelik: yüksek etki.", "Bu görevi kime versek?", "Takım ne yapıyor?", "Plan hazır mı?"],
    coder:    ["Build yeşil.", "Loglar şüpheli...", "Deploy öncesi son kontrol.", "Test geçti."],
    marketer: ["CTR bugün iyi.", "Bu kreatif güçlü.", "Retention trendine bakalım.", "A/B testi hazır."],
    daily:    ["Notlar nerede?", "Takvim bende, kahve sende?", "Hallediyorum...", "Hatırlatıcı kurdum."],
    kalshi:   ["Volatilite yükseliyor.", "Risk/ödül oranı?", "Bu giriş için erken.", "Pozisyon açıldı."]
  };

  const AGENTS = AGENT_DEFS.map(def => {
    const desk = getDeskPos(def.id);
    return {
      ...def,
      desk:        { ...desk },
      pos:         { ...desk },
      state:       "idle_wander",
      queue:       [],
      currentTask: null,
      bubble:      null,
      target:      null,
      speed:       1.2 + Math.random() * 0.25,
      stateUntil:  0,
      notifyColor: "#ffd166",
      pulse:       0
    };
  });

  const AGENT_BY_ID = Object.fromEntries(AGENTS.map(a => [a.id, a]));

  // ── DRAW HELPERS ─────────────────────────────────────────
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  function drawRoom(room) {
    // Fill
    ctx.fillStyle = room.bg;
    ctx.fillRect(room.x, room.y, room.w, room.h);

    // CEO subtle golden inner glow
    if (room.agentId === "main") {
      ctx.fillStyle = "rgba(249,214,92,0.04)";
      ctx.fillRect(room.x, room.y, room.w, room.h);
    }

    // Border
    ctx.strokeStyle = room.lc + "55";
    ctx.lineWidth = 2;
    ctx.strokeRect(room.x + 1, room.y + 1, room.w - 2, room.h - 2);

    // Label badge
    const lblW = room.label.length * 8 + 10;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(room.x + 6, room.y + 4, lblW, 16);
    ctx.fillStyle = room.lc;
    ctx.font = "bold 11px monospace";
    ctx.fillText(room.label, room.x + 9, room.y + 16);
  }

  // Standard agent desk + monitor
  function drawAgentDesk(cx, cy, agent) {
    const dw = 78, dh = 26;
    // Desk surface
    ctx.fillStyle = "#7a5c38";
    ctx.fillRect(cx - dw / 2, cy, dw, dh);
    ctx.fillStyle = "#5a3c20";
    ctx.fillRect(cx - dw / 2, cy + dh, dw, 4);

    // Monitor
    ctx.fillStyle = "#1e2c3e";
    ctx.fillRect(cx - 14, cy - 22, 28, 20);
    ctx.fillStyle = agent.color;
    ctx.globalAlpha = 0.65;
    ctx.fillRect(cx - 12, cy - 20, 24, 16);
    ctx.globalAlpha = 1;
    // Stand
    ctx.fillStyle = "#2a3545";
    ctx.fillRect(cx - 3, cy - 2, 6, 4);
    // Ambient glow
    ctx.fillStyle = agent.color;
    ctx.globalAlpha = 0.06;
    ctx.fillRect(cx - 22, cy - 28, 44, 32);
    ctx.globalAlpha = 1;

    // Role-specific desk item
    if (agent.id === "coder") {
      // Coffee mug
      ctx.fillStyle = "#8B4513"; ctx.fillRect(cx + 30, cy + 5, 8, 12);
      ctx.fillStyle = "#c0956a"; ctx.fillRect(cx + 31, cy + 6, 6, 4);
    } else if (agent.id === "marketer") {
      // Bar chart
      [[0, "#ff9faf", 8], [6, "#ff5577", 14], [13, "#ff9faf", 6]].forEach(([dx, c, h]) => {
        ctx.fillStyle = c; ctx.fillRect(cx + 28 + dx, cy + dh - h, 4, h);
      });
    } else if (agent.id === "kalshi") {
      // Line chart
      ctx.strokeStyle = "#c2f970"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + 26, cy + 20); ctx.lineTo(cx + 32, cy + 12);
      ctx.lineTo(cx + 38, cy + 16); ctx.lineTo(cx + 44, cy + 8);
      ctx.stroke();
    } else if (agent.id === "daily") {
      // Sticky note
      ctx.fillStyle = "#f9d65c"; ctx.fillRect(cx + 29, cy + 4, 12, 12);
      ctx.fillStyle = "#e0b840"; ctx.fillRect(cx + 30, cy + 5, 10, 1);
    }
  }

  // CEO large desk (called with ROOMS.ceo)
  function drawCEODesk(room) {
    const cx = room.x + room.w * 0.5;
    const cy = room.y + room.h * 0.56;

    // Bookcase on left wall
    ctx.fillStyle = "#6b4c2a";
    ctx.fillRect(room.x + 8, room.y + 24, 22, room.h - 48);
    ctx.fillStyle = "#5a3c1a";
    const bookColors = ["#4a7fc4", "#c44a4a", "#4ac48a", "#c4b04a", "#8a4ac4", "#c4674a"];
    bookColors.forEach((bc, i) => {
      ctx.fillStyle = bc;
      ctx.fillRect(room.x + 10, room.y + 28 + i * 26, 18, 18);
    });

    // Main wide desk
    ctx.fillStyle = "#8a6a42";
    ctx.fillRect(cx - 72, cy, 144, 32);
    // L-extension (right side)
    ctx.fillRect(cx + 52, cy - 36, 36, 38);
    // Shadow edge
    ctx.fillStyle = "#5a3c20";
    ctx.fillRect(cx - 72, cy + 32, 144, 4);
    ctx.fillRect(cx + 52, cy + 2, 36, 4);

    // 2 monitors
    [{ x: cx - 32, c: "#3a8ff4" }, { x: cx + 20, c: "#f4a261" }].forEach(({ x: mx, c }) => {
      ctx.fillStyle = "#1e2c3e"; ctx.fillRect(mx - 14, cy - 22, 28, 20);
      ctx.fillStyle = c; ctx.globalAlpha = 0.72;
      ctx.fillRect(mx - 12, cy - 20, 24, 16);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#2a3545"; ctx.fillRect(mx - 3, cy - 3, 6, 5);
      ctx.fillStyle = c; ctx.globalAlpha = 0.06;
      ctx.fillRect(mx - 22, cy - 30, 44, 34); ctx.globalAlpha = 1;
    });

    // Tablet on extension desk
    ctx.fillStyle = "#2a3a50"; ctx.fillRect(cx + 58, cy - 28, 22, 14);
    ctx.fillStyle = "#3a5a7a"; ctx.globalAlpha = 0.8;
    ctx.fillRect(cx + 59, cy - 27, 20, 12); ctx.globalAlpha = 1;

    // Small plant on desk corner
    ctx.fillStyle = "#2a5a1a"; ctx.fillRect(cx - 72 + 4, cy + 4, 12, 10);
    ctx.fillStyle = "#3a8a2a"; ctx.fillRect(cx - 72 + 2, cy - 4, 16, 10);
  }

  function drawConference(room) {
    const cx = room.x + room.w * 0.5;
    const cy = room.y + room.h * 0.58;
    // Oval table
    ctx.fillStyle = "#6b4010";
    ctx.beginPath(); ctx.ellipse(cx, cy, 84, 44, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#8a5a22";
    ctx.beginPath(); ctx.ellipse(cx - 8, cy - 7, 54, 25, -0.15, 0, Math.PI * 2); ctx.fill();
    // Chairs
    [[-80, 0], [80, 0], [-46, -52], [46, -52], [-46, 52], [46, 52]].forEach(([dx, dy]) => {
      ctx.fillStyle = "#1e2e40"; ctx.fillRect(cx + dx - 11, cy + dy - 11, 22, 22);
      ctx.fillStyle = "#2a4050"; ctx.fillRect(cx + dx - 9, cy + dy - 9, 18, 14);
    });
    // Projector screen on back wall
    ctx.fillStyle = "#e8e8e0"; ctx.fillRect(room.x + 20, room.y + 24, room.w - 40, 18);
    ctx.fillStyle = "#aabbcc"; ctx.fillRect(room.x + 22, room.y + 26, room.w - 44, 14);
  }

  function drawKitchen(room) {
    const { x, y, w, h } = room;
    // Counter tops (L-shape)
    ctx.fillStyle = "#c8c8c0";
    ctx.fillRect(x + 8, y + 24, w - 16, 28);     // top counter
    ctx.fillRect(x + 8, y + 24, 28, h - 44);      // left counter
    ctx.fillStyle = "#a0a098";
    ctx.fillRect(x + 8, y + 51, w - 16, 3);
    ctx.fillRect(x + 35, y + 24, 3, h - 44);

    // Microwave
    ctx.fillStyle = "#222"; ctx.fillRect(x + 38, y + 30, 54, 20);
    ctx.fillStyle = "#333"; ctx.fillRect(x + 40, y + 32, 40, 14);
    ctx.fillStyle = "#ff3300"; ctx.globalAlpha = 0.9;
    ctx.fillRect(x + 82, y + 35, 8, 8); ctx.globalAlpha = 1;

    // Fridge
    ctx.fillStyle = "#c0c0c8"; ctx.fillRect(x + w - 44, y + 25, 32, h - 46);
    const fh = Math.floor((h - 56) / 2);
    ctx.fillStyle = "#aaa";
    ctx.fillRect(x + w - 42, y + 28, 28, fh);
    ctx.fillRect(x + w - 42, y + 30 + fh, 28, fh);
    ctx.fillStyle = "#888";
    ctx.fillRect(x + w - 20, y + 40, 3, 28);
    ctx.fillRect(x + w - 20, y + 40 + fh + 4, 3, 22);

    // Coffee machine on counter
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(x + 40, y + 56, 30, 36);
    ctx.fillStyle = "#333"; ctx.fillRect(x + 42, y + 58, 26, 20);
    ctx.fillStyle = "#ff6600"; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(x + 55, y + 82, 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawLounge(room) {
    const { x, y, w, h } = room;

    // Sofa
    ctx.fillStyle = "#1e3a52";
    ctx.fillRect(x + 14, y + 28, w - 28, 48);
    ctx.fillStyle = "#2a4f6e";
    ctx.fillRect(x + 14, y + 28, w - 28, 14);  // back
    ctx.fillRect(x + 14, y + 28, 14, 48);        // left arm
    ctx.fillRect(x + w - 28, y + 28, 14, 48);    // right arm
    ctx.fillStyle = "#1a3044";
    ctx.fillRect(x + 28, y + 42, w - 56, 26);    // seat cushion

    // Coffee table
    ctx.fillStyle = "#6b4c2a"; ctx.fillRect(x + 26, y + 88, w - 52, 20);
    ctx.fillStyle = "#5a3c1a"; ctx.fillRect(x + 26, y + 107, w - 52, 3);

    // Plant (tree)
    ctx.fillStyle = "#2a1a08"; ctx.fillRect(x + 14, y + 122, 18, 26);
    ctx.fillStyle = "#1a4a1a"; ctx.fillRect(x + 8,  y + 96,  30, 28);
    ctx.fillStyle = "#246a24"; ctx.fillRect(x + 12, y + 80,  22, 20);
    ctx.fillStyle = "#2a7a2a"; ctx.fillRect(x + 16, y + 70,  14, 12);
    ctx.fillStyle = "#48a848"; ctx.fillRect(x + 19, y + 64,  8,  8);

    // Ping pong table
    const ptY = y + h - 212;
    ctx.fillStyle = "#0a4a1a"; ctx.fillRect(x + 14, ptY, w - 28, 84);
    ctx.fillStyle = "#1a6b2a"; ctx.globalAlpha = 0.6;
    ctx.fillRect(x + 14, ptY, w - 28, 84); ctx.globalAlpha = 1;
    // Net
    ctx.strokeStyle = "rgba(255,255,255,0.65)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 14, ptY + 42); ctx.lineTo(x + w - 14, ptY + 42); ctx.stroke();
    // Center line
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + w / 2, ptY); ctx.lineTo(x + w / 2, ptY + 84); ctx.stroke();
    // Ball (small circle)
    ctx.fillStyle = "#ffffaa"; ctx.globalAlpha = 0.8;
    ctx.beginPath(); ctx.arc(x + w * 0.35, ptY + 22, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#6dde8a"; ctx.font = "bold 9px monospace";
    ctx.textAlign = "center"; ctx.fillText("PING PONG", x + w / 2, ptY + 98); ctx.textAlign = "left";

    // Ideas board (whiteboard)
    const ibY = y + h - 118;
    ctx.fillStyle = "#eeeeea"; ctx.fillRect(x + 14, ibY, w - 28, 72);
    ctx.fillStyle = "rgba(0,0,0,0.08)"; ctx.fillRect(x + 14, ibY, w - 28, 4);
    // Lines
    ctx.strokeStyle = "#3366ff"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x + 20, ibY + 16); ctx.lineTo(x + 66, ibY + 16); ctx.stroke();
    ctx.strokeStyle = "#ff4444"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x + 20, ibY + 30); ctx.lineTo(x + 72, ibY + 30); ctx.stroke();
    ctx.strokeStyle = "#44bb44"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x + 20, ibY + 44); ctx.lineTo(x + 56, ibY + 44); ctx.stroke();
    // Green box
    ctx.fillStyle = "#2d7a4e"; ctx.fillRect(x + w - 52, ibY + 10, 36, 36);
    ctx.fillStyle = "#3a9a62"; ctx.fillRect(x + w - 50, ibY + 12, 32, 32);
    ctx.fillStyle = "#8899aa"; ctx.font = "bold 9px monospace";
    ctx.textAlign = "center"; ctx.fillText("IDEAS", x + w / 2, ibY + 88); ctx.textAlign = "left";
  }

  // ── SPRITE ───────────────────────────────────────────────
  function drawSprite(agent, now) {
    const { pos, color, name, state, bubble, pulse, notifyColor } = agent;
    const x = Math.round(pos.x);
    const y = Math.round(pos.y);
    const isMoving = (state === "idle_wander" || state === "task_commute") && agent.target;
    const bob   = state === "task_working" ? 0 : Math.sin(now / 290 + pos.x * 0.022) * 1.8;
    const legA  = isMoving ? Math.sin(now / 110) * 3 : 0;
    const bx = x - 9;
    const by = y - 26 + bob;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(x, y + 4, 9, 3, 0, 0, Math.PI * 2); ctx.fill();

    // Legs
    ctx.fillStyle = "#2a3040";
    ctx.fillRect(bx + 4, by + 19, 5, 9 + legA);
    ctx.fillRect(bx + 10, by + 19, 5, 9 - legA);

    // Body
    ctx.fillStyle = color; ctx.fillRect(bx + 2, by + 8, 14, 12);

    // Arms
    ctx.fillStyle = color;
    if (state === "task_working") {
      ctx.fillRect(bx - 1, by + 8,  4, 6);
      ctx.fillRect(bx + 15, by + 8, 4, 6);
    } else {
      ctx.fillRect(bx - 2, by + 10, 4, 8);
      ctx.fillRect(bx + 16, by + 10, 4, 8);
    }

    // Head
    ctx.fillStyle = "#f0c89a"; ctx.fillRect(bx + 4, by, 10, 10);
    // Hair
    ctx.fillStyle = "#3a2a18"; ctx.fillRect(bx + 4, by, 10, 3);
    // Eyes
    ctx.fillStyle = "#1a1020";
    ctx.fillRect(bx + 6, by + 4, 2, 2);
    ctx.fillRect(bx + 10, by + 4, 2, 2);

    // Working sparkle
    if (state === "task_working") {
      ctx.fillStyle = "#f9d65c";
      ctx.fillRect(bx + 18, by - 5,  3, 3);
      ctx.fillRect(bx + 22, by - 9,  2, 2);
      ctx.fillRect(bx + 20, by - 12, 2, 2);
    }

    // Pulse ring
    if (pulse > 0.02) {
      ctx.strokeStyle = notifyColor;
      ctx.globalAlpha = pulse * 0.7;
      ctx.lineWidth = 2;
      const r = 16 + (1 - pulse) * 14;
      ctx.beginPath(); ctx.arc(x, y - 10, r, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Name
    ctx.fillStyle = "#b8cede"; ctx.font = "10px monospace";
    ctx.textAlign = "center"; ctx.fillText(name, x, y + 18); ctx.textAlign = "left";

    // Speech bubble
    if (bubble && bubble.until > now) {
      const txt = bubble.text;
      const tw = Math.max(65, txt.length * 5.8 + 14);
      const bbx = x - tw / 2;
      const bby = by - 20;
      ctx.fillStyle = "#0c1724ee"; ctx.strokeStyle = "#3a5878"; ctx.lineWidth = 1;
      rr(bbx, bby - 16, tw, 16, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#0c1724ee";
      ctx.beginPath();
      ctx.moveTo(x - 4, bby); ctx.lineTo(x + 4, bby); ctx.lineTo(x, bby + 5);
      ctx.fill();
      ctx.fillStyle = "#a8c0d8"; ctx.font = "9px monospace";
      ctx.textAlign = "center"; ctx.fillText(txt, x, bby - 4); ctx.textAlign = "left";
    }
  }

  // ── STATE MACHINE ────────────────────────────────────────
  function moveToward(agent, target) {
    const dx = target.x - agent.pos.x, dy = target.y - agent.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= agent.speed) { agent.pos.x = target.x; agent.pos.y = target.y; return true; }
    agent.pos.x += (dx / dist) * agent.speed;
    agent.pos.y += (dy / dist) * agent.speed;
    return false;
  }

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function pickIdlePoint(agent) {
    if (Math.random() < 0.22) return { ...rand(HALL_WANDER) };
    const pts = getRoomWander(agent.id);
    return { ...(pts.length ? rand(pts) : rand(HALL_WANDER)) };
  }

  function setBubble(agent, text, ms = 2100) {
    agent.bubble = { text, until: performance.now() + ms };
  }

  function scheduleIdle(agent) {
    const now = performance.now();
    if (Math.random() < 0.28) {
      agent.state = "idle_chat";
      setBubble(agent, rand(BUBBLES[agent.id]));
      agent.stateUntil = now + 1400 + Math.random() * 1700;
      agent.target = null;
    } else {
      agent.state = "idle_wander";
      agent.target = pickIdlePoint(agent);
      agent.stateUntil = now + 2000 + Math.random() * 2800;
    }
  }

  function assignTask(agent, evt) {
    if (agent.currentTask?.taskId === evt.taskId) return;
    if (agent.state === "task_working") { agent.queue.push(evt); return; }
    agent.currentTask = evt;
    agent.state = "task_notified";
    agent.notifyColor = SOURCE_COLORS[evt.source] || "#ffd166";
    agent.pulse = 1;
    setBubble(agent, `${evt.source}: ${(evt.title || "task").slice(0, 22)}`, 1700);
    agent.stateUntil = performance.now() + 850;
  }

  const feed = [];
  const seenEventIds = new Set();
  let lastEventTs = new Date(0).toISOString();

  function applyEvent(evt) {
    if (!evt?.agentId || !evt?.status) return;
    if (evt.type === "hello" || evt.type === "ping") return;
    if (evt.eventId && seenEventIds.has(evt.eventId)) return;
    if (evt.eventId) seenEventIds.add(evt.eventId);
    if (evt.timestamp > lastEventTs) lastEventTs = evt.timestamp;
    enqueueFeed(evt);
    const agent = AGENT_BY_ID[evt.agentId];
    if (!agent) return;
    if (evt.status === "assigned") {
      assignTask(agent, evt);
    } else if (evt.status === "started") {
      if (!agent.currentTask || agent.currentTask.taskId !== evt.taskId) agent.currentTask = evt;
      agent.state  = "task_commute";
      agent.target = { ...agent.desk };
    } else if (evt.status === "done") {
      agent.state = "task_done"; agent.notifyColor = "#48d597"; agent.pulse = 1;
      setBubble(agent, "Tamamlandi ✓", 1400);
      agent.stateUntil = performance.now() + 1400;
    } else if (evt.status === "failed") {
      agent.state = "task_failed"; agent.notifyColor = "#ff6262"; agent.pulse = 1;
      setBubble(agent, "Takildi ✗", 1400);
      agent.stateUntil = performance.now() + 1600;
    }
    renderStatus();
  }

  // ── FEED & STATUS ────────────────────────────────────────
  function enqueueFeed(evt) {
    feed.unshift(evt);
    if (feed.length > 40) feed.length = 40;
    renderFeed();
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function renderFeed() {
    feedEl.innerHTML = "";
    feed.slice(0, 20).forEach(e => {
      const li = document.createElement("li");
      const c = STATUS_COLORS[e.status] || "#9bb2cc";
      li.innerHTML = `<div><b>${esc(e.agentId)}</b> ${esc(e.status)} — ${esc(e.title || "task")}</div>
        <div class="meta"><span style="color:${c}">●</span> ${esc(e.source)} | ${new Date(e.timestamp || Date.now()).toLocaleTimeString()}</div>`;
      feedEl.appendChild(li);
    });
  }

  function renderStatus() {
    statusEl.innerHTML = "";
    AGENTS.forEach(a => {
      const row = document.createElement("div");
      row.className = "agent-row";
      const sc = a.state.startsWith("task") ? "#ffd166" : "#6dde8a";
      row.innerHTML = `<div>
        <div class="name" style="color:${a.color}">${a.name} <span class="state">(${STATE_LABELS[a.state] || a.state})</span></div>
        <div class="queue">Queue: ${a.queue.length}</div>
      </div><div style="color:${sc};font-size:11px">${a.role}</div>`;
      statusEl.appendChild(row);
    });
  }

  // ── MAIN LOOP ────────────────────────────────────────────
  function tick(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Floor
    ctx.fillStyle = floorPattern;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Rooms
    Object.values(ROOMS).forEach(drawRoom);

    // Furniture
    drawCEODesk(ROOMS.ceo);
    drawConference(ROOMS.conference);
    drawKitchen(ROOMS.kitchen);
    drawLounge(ROOMS.lounge);

    // Agent desks (non-CEO)
    AGENTS.forEach(a => {
      if (a.id === "main") return;
      const room = Object.values(ROOMS).find(r => r.agentId === a.id);
      if (room) drawAgentDesk(room.x + room.w * 0.5, room.y + room.h * 0.58, a);
    });

    // Agents
    AGENTS.forEach(agent => {
      if (agent.pulse > 0) agent.pulse -= 0.009;
      const { state } = agent;

      if (state === "task_notified" && now >= agent.stateUntil) {
        agent.state = "task_commute"; agent.target = { ...agent.desk };
      } else if (state === "task_commute" && agent.target) {
        if (moveToward(agent, agent.target)) {
          agent.state = "task_working";
          agent.stateUntil = now + 2200 + Math.random() * 2500;
          setBubble(agent, "Calisiyorum...", 1300);
        }
      } else if (state === "task_working" && now >= agent.stateUntil) {
        applyEvent({
          eventId:   `auto-${Date.now()}-${agent.id}`,
          taskId:    agent.currentTask?.taskId || `task-${Date.now()}`,
          agentId:   agent.id,
          status:    "done",
          source:    agent.currentTask?.source || "openclaw",
          title:     agent.currentTask?.title  || "Task",
          timestamp: new Date().toISOString()
        });
      } else if ((state === "task_done" || state === "task_failed") && now >= agent.stateUntil) {
        agent.currentTask = null;
        agent.queue.length > 0 ? assignTask(agent, agent.queue.shift()) : scheduleIdle(agent);
      } else if ((state === "idle_wander" || state === "idle_chat") && now >= agent.stateUntil) {
        scheduleIdle(agent);
      }

      if ((state === "idle_wander" || state === "task_commute") && agent.target) {
        moveToward(agent, agent.target);
      }
      drawSprite(agent, now);
    });

    requestAnimationFrame(tick);
  }

  // ── CONNECTIVITY ─────────────────────────────────────────
  let evtSource = null;

  function connectSSE(apiBase) {
    try {
      evtSource?.close();
      evtSource = new EventSource(`${apiBase}/events/stream`);
      evtSource.onopen = () => { connPill.textContent = "LIVE"; connPill.style.color = "#48d597"; };
      evtSource.onmessage = e => {
        try { applyEvent(JSON.parse(e.data)); } catch (_) {}
      };
      evtSource.onerror = () => {
        connPill.textContent = "RETRYING"; connPill.style.color = "#ffbf69";
        evtSource.close(); evtSource = null;
        setTimeout(() => connectSSE(apiBase), 4000);
      };
    } catch (_) {}
  }

  async function pollBridge(apiBase) {
    async function poll() {
      try {
        const r = await fetch(`${apiBase}/events/recent`, { cache: "no-store" });
        if (!r.ok) throw new Error(r.status);
        const { events } = await r.json();
        connPill.textContent = "LIVE"; connPill.style.color = "#48d597";
        (events || []).forEach(applyEvent);
      } catch (_) { connPill.textContent = "RETRYING"; connPill.style.color = "#ffbf69"; }
    }
    poll(); setInterval(poll, 2500);
  }

  async function pollVercel() {
    async function poll() {
      try {
        const r = await fetch(`/api/events?since=${encodeURIComponent(lastEventTs)}`, { cache: "no-store" });
        if (!r.ok) throw new Error(r.status);
        const { events } = await r.json();
        connPill.textContent = "LIVE"; connPill.style.color = "#48d597";
        (events || []).forEach(applyEvent);
      } catch (_) { connPill.textContent = "RETRYING"; connPill.style.color = "#ffbf69"; }
    }
    poll(); setInterval(poll, 2000);
  }

  function demoPulse() {
    const agentIds = ["main", "coder", "marketer", "daily", "kalshi"];
    const titles   = ["New thread", "Code fix", "Campaign tweak", "Schedule task", "Market check"];
    setInterval(() => {
      if (feed.length > 0) return;
      const agentId = rand(agentIds);
      const source  = rand(["slack", "telegram", "openclaw"]);
      const taskId  = `${source}-${Date.now()}`;
      applyEvent({ eventId: `${taskId}-a`, taskId, agentId, source, status: "assigned", title: rand(titles), timestamp: new Date().toISOString() });
      setTimeout(() => applyEvent({ eventId: `${taskId}-s`, taskId, agentId, source, status: "started", title: rand(titles), timestamp: new Date().toISOString() }), 500);
    }, 12000);
  }

  // ── INIT ─────────────────────────────────────────────────
  AGENTS.forEach(scheduleIdle);
  renderStatus();

  const configuredBase = (window.OFFICE_CONFIG?.apiBase || "").replace(/\/$/, "");
  if (configuredBase) {
    connectSSE(configuredBase);
  } else {
    pollVercel();
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") demoPulse();

  requestAnimationFrame(tick);
})();
