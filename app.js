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
    idle_desk: "At Desk", idle_wander: "Moving", idle_chat: "Chatting",
    task_notified: "Notified", task_commute: "Commuting",
    task_working: "Working", task_done: "Done", task_failed: "Failed"
  };
  const ACTIVITY_LABELS = {
    desk: "At Desk", chat: "Chatting", coffee: "Coffee Break",
    lounge: "In Lounge", pingpong: "Ping Pong", meeting: "In Meeting",
    corridor: "Walking Corridor"
  };

  // ── FLOOR PATTERN (drawn once) ───────────────────────────
  const floorOff = document.createElement("canvas");
  floorOff.width = TILE * 2; floorOff.height = TILE * 2;
  const fctx = floorOff.getContext("2d");
  fctx.fillStyle = "#0d1620"; fctx.fillRect(0, 0, TILE * 2, TILE * 2);
  fctx.fillStyle = "#0a1218"; fctx.fillRect(0, 0, TILE, TILE);
  fctx.fillStyle = "#0a1218"; fctx.fillRect(TILE, TILE, TILE, TILE);
  const floorPattern = ctx.createPattern(floorOff, "repeat");

  // ── ROOMS ────────────────────────────────────────────────
  const ROOMS = {
    conference: { x: 16,   y: 16,  w: 232, h: 182, label: "Conference", lc: "#7a8faa", bg: "rgba(10,18,28,0.82)"                         },
    ceo:        { x: 264,  y: 16,  w: 292, h: 202, label: "CEO Office", lc: "#f9d65c", bg: "rgba(14,18,36,0.90)", agentId: "main"         },
    kitchen:    { x: 572,  y: 16,  w: 224, h: 182, label: "Kitchen",    lc: "#8899bb", bg: "rgba(10,20,26,0.82)"                          },
    code:       { x: 16,   y: 258, w: 232, h: 196, label: "CODE",       lc: "#7bdff2", bg: "rgba(8,18,30,0.85)", agentId: "coder"         },
    mkt:        { x: 264,  y: 258, w: 232, h: 196, label: "MKT",        lc: "#ff7faf", bg: "rgba(22,8,26,0.85)", agentId: "marketer"      },
    ops:        { x: 512,  y: 258, w: 232, h: 196, label: "OPS",        lc: "#c2f970", bg: "rgba(8,22,14,0.85)", agentId: "daily"         },
    trd:        { x: 760,  y: 258, w: 232, h: 196, label: "TRD",        lc: "#b19cd9", bg: "rgba(16,8,28,0.85)", agentId: "kalshi"        },
    lounge:     { x: 1016, y: 16,  w: 248, h: 480, label: "Lounge",     lc: "#6dde8a", bg: "rgba(8,20,14,0.82)"                          }
  };

  function getDeskPos(agentId) {
    for (const r of Object.values(ROOMS)) {
      if (r.agentId === agentId) return { x: r.x + r.w * 0.5, y: r.y + r.h * 0.60 };
    }
    return { x: 500, y: 360 };
  }

  // ── LOCATIONS ────────────────────────────────────────────
  // Conference room: cx≈132, cy≈121 (chairs at ±80x, ±46/52y)
  const CONF_SPOTS = [
    { x: 70,  y: 115 }, { x: 194, y: 115 },
    { x: 98,  y: 72  }, { x: 166, y: 72  },
    { x: 98,  y: 168 }, { x: 166, y: 168 }
  ];
  // Kitchen: coffee machine area ~x=627,y=98
  const KITCHEN_SPOTS = [
    { x: 628, y: 128 }, { x: 646, y: 134 }, { x: 614, y: 130 }
  ];
  // Lounge sofa front row y≈90, coffee table y≈112
  const LOUNGE_SPOTS = [
    { x: 1068, y: 90 }, { x: 1102, y: 90 }, { x: 1138, y: 90 }, { x: 1174, y: 90 },
    { x: 1098, y: 112 }, { x: 1152, y: 112 }
  ];
  // Ping pong: table ptX=1036,ptY=176,ptW=208,ptH=100
  const PING_PONG_SPOTS = [
    { x: 1140, y: 163 }, { x: 1140, y: 287 },
    { x: 1040, y: 225 }, { x: 1242, y: 225 }
  ];
  const CORRIDOR_SPOTS = [
    { x: 140, y: 236 }, { x: 280, y: 236 }, { x: 420, y: 236 }, { x: 560, y: 236 },
    { x: 700, y: 236 }, { x: 840, y: 236 }, { x: 980, y: 236 }
  ];
  const ROOM_DOORS = {
    conference: { x: 132, y: 198 },
    ceo:        { x: 410, y: 218 },
    kitchen:    { x: 684, y: 198 },
    code:       { x: 132, y: 258 },
    mkt:        { x: 380, y: 258 },
    ops:        { x: 628, y: 258 },
    trd:        { x: 876, y: 258 },
    lounge:     { x: 1016, y: 236 }
  };
  const CORRIDOR_Y = 236;

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
    coder:    ["Build yeşil.", "Loglar şüpheli...", "Deploy öncesi kontrol.", "Test geçti ✓"],
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
      state:       "idle_desk",
      queue:       [],
      currentTask: null,
      bubble:      null,
      target:      null,
      speed:       1.3 + Math.random() * 0.2,
      stateUntil:  performance.now() + 3000 + Math.random() * 4000,
      notifyColor: "#ffd166",
      pulse:       0,
      activity:    "desk",   // desk | coffee | lounge | pingpong | meeting | corridor
      intent:      "focused_work",
      statusNote:  "Planning",
      route:       [],
      reservedSpot: null,
      inviteToken: 0,
      inviteFrom:  null,
      inviteTo:    null
    };
  });

  const AGENT_BY_ID = Object.fromEntries(AGENTS.map(a => [a.id, a]));

  // ── DRAW HELPERS ─────────────────────────────────────────
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  function drawRoom(roomId, room) {
    ctx.fillStyle = room.bg;
    ctx.fillRect(room.x, room.y, room.w, room.h);
    if (room.agentId === "main") {
      ctx.fillStyle = "rgba(249,214,92,0.035)";
      ctx.fillRect(room.x, room.y, room.w, room.h);
    }
    ctx.strokeStyle = room.lc + "55";
    ctx.lineWidth = 2;
    ctx.strokeRect(room.x + 1, room.y + 1, room.w - 2, room.h - 2);

    const door = ROOM_DOORS[roomId];
    if (door) {
      const gap = 30;
      ctx.fillStyle = "rgba(80, 110, 140, 0.55)";
      if (Math.abs(door.y - room.y) <= 3) {
        // top wall door
        ctx.fillRect(door.x - gap / 2, room.y - 2, gap, 5);
        ctx.strokeStyle = room.lc + "88";
        ctx.beginPath();
        ctx.moveTo(door.x - gap / 2, room.y + 2);
        ctx.lineTo(door.x - gap / 2, room.y + 8);
        ctx.moveTo(door.x + gap / 2, room.y + 2);
        ctx.lineTo(door.x + gap / 2, room.y + 8);
        ctx.stroke();
      } else if (Math.abs(door.y - (room.y + room.h)) <= 3) {
        // bottom wall door
        ctx.fillRect(door.x - gap / 2, room.y + room.h - 2, gap, 5);
        ctx.strokeStyle = room.lc + "88";
        ctx.beginPath();
        ctx.moveTo(door.x - gap / 2, room.y + room.h - 8);
        ctx.lineTo(door.x - gap / 2, room.y + room.h - 2);
        ctx.moveTo(door.x + gap / 2, room.y + room.h - 8);
        ctx.lineTo(door.x + gap / 2, room.y + room.h - 2);
        ctx.stroke();
      } else if (Math.abs(door.x - room.x) <= 3) {
        // left wall door
        ctx.fillRect(room.x - 2, door.y - gap / 2, 5, gap);
        ctx.strokeStyle = room.lc + "88";
        ctx.beginPath();
        ctx.moveTo(room.x + 2, door.y - gap / 2);
        ctx.lineTo(room.x + 8, door.y - gap / 2);
        ctx.moveTo(room.x + 2, door.y + gap / 2);
        ctx.lineTo(room.x + 8, door.y + gap / 2);
        ctx.stroke();
      } else if (Math.abs(door.x - (room.x + room.w)) <= 3) {
        // right wall door
        ctx.fillRect(room.x + room.w - 2, door.y - gap / 2, 5, gap);
        ctx.strokeStyle = room.lc + "88";
        ctx.beginPath();
        ctx.moveTo(room.x + room.w - 8, door.y - gap / 2);
        ctx.lineTo(room.x + room.w - 2, door.y - gap / 2);
        ctx.moveTo(room.x + room.w - 8, door.y + gap / 2);
        ctx.lineTo(room.x + room.w - 2, door.y + gap / 2);
        ctx.stroke();
      }
    }
    const lblW = room.label.length * 8 + 10;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(room.x + 6, room.y + 4, lblW, 16);
    ctx.fillStyle = room.lc;
    ctx.font = "bold 11px monospace";
    ctx.fillText(room.label, room.x + 9, room.y + 16);
  }

  function drawCorridors() {
    ctx.fillStyle = "rgba(50, 70, 90, 0.24)";
    ctx.fillRect(24, 224, 1240, 24);
    ctx.fillStyle = "rgba(80, 110, 140, 0.16)";
    for (let x = 32; x < 1240; x += 38) {
      ctx.fillRect(x, 233, 20, 6);
    }
  }

  function drawDoors() {
    Object.entries(ROOM_DOORS).forEach(([roomId, d]) => {
      const portal = doorPortal(roomId);
      if (portal) {
        ctx.strokeStyle = "rgba(245, 214, 92, 0.35)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(portal.door.x, portal.door.y);
        ctx.lineTo(portal.outside.x, portal.outside.y);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(245, 214, 92, 0.95)";
      ctx.fillRect(d.x - 11, d.y - 4, 22, 8);
      ctx.strokeStyle = "rgba(84, 62, 18, 0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(d.x - 11, d.y - 4, 22, 8);
    });
  }

  function drawAgentDesk(cx, cy, agent) {
    const dw = 78, dh = 26;
    ctx.fillStyle = "#7a5c38"; ctx.fillRect(cx - dw / 2, cy, dw, dh);
    ctx.fillStyle = "#5a3c20"; ctx.fillRect(cx - dw / 2, cy + dh, dw, 4);
    ctx.fillStyle = "#1e2c3e"; ctx.fillRect(cx - 14, cy - 22, 28, 20);
    ctx.fillStyle = agent.color; ctx.globalAlpha = 0.65;
    ctx.fillRect(cx - 12, cy - 20, 24, 16); ctx.globalAlpha = 1;
    ctx.fillStyle = "#2a3545"; ctx.fillRect(cx - 3, cy - 2, 6, 4);
    ctx.fillStyle = "#e6e0d0";
    ctx.fillRect(cx - 32, cy + 4, 14, 9);
    ctx.fillRect(cx - 19, cy + 7, 10, 7);
    ctx.strokeStyle = "#c6bca8"; ctx.lineWidth = 1;
    ctx.strokeRect(cx - 32, cy + 4, 14, 9);
    ctx.fillStyle = agent.color; ctx.globalAlpha = 0.06;
    ctx.fillRect(cx - 22, cy - 28, 44, 32); ctx.globalAlpha = 1;
    if (agent.id === "coder") {
      ctx.fillStyle = "#8B4513"; ctx.fillRect(cx + 30, cy + 5, 8, 12);
      ctx.fillStyle = "#c0956a"; ctx.fillRect(cx + 31, cy + 6, 6, 4);
    } else if (agent.id === "marketer") {
      [[0,"#ff9faf",8],[6,"#ff5577",14],[13,"#ff9faf",6]].forEach(([dx,c,h]) => {
        ctx.fillStyle = c; ctx.fillRect(cx + 28 + dx, cy + dh - h, 4, h);
      });
    } else if (agent.id === "kalshi") {
      ctx.strokeStyle = "#c2f970"; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx+26,cy+20); ctx.lineTo(cx+32,cy+12);
      ctx.lineTo(cx+38,cy+16); ctx.lineTo(cx+44,cy+8);
      ctx.stroke();
    } else if (agent.id === "daily") {
      ctx.fillStyle = "#f9d65c"; ctx.fillRect(cx+29, cy+4, 12, 12);
      ctx.fillStyle = "#e0b840"; ctx.fillRect(cx+30, cy+5, 10, 1);
    }
  }

  function drawCEODesk(room) {
    const cx = room.x + room.w * 0.5;
    const cy = room.y + room.h * 0.56;
    // Bookcase on left wall
    ctx.fillStyle = "#6b4c2a"; ctx.fillRect(room.x + 8, room.y + 24, 22, room.h - 48);
    ctx.fillStyle = "#5a3c1a";
    ["#4a7fc4","#c44a4a","#4ac48a","#c4b04a","#8a4ac4","#c4674a"].forEach((bc, i) => {
      ctx.fillStyle = bc; ctx.fillRect(room.x + 10, room.y + 28 + i * 26, 18, 18);
    });
    // Wide desk
    ctx.fillStyle = "#8a6a42"; ctx.fillRect(cx - 72, cy, 144, 32);
    ctx.fillRect(cx + 52, cy - 36, 36, 38);
    ctx.fillStyle = "#5a3c20"; ctx.fillRect(cx - 72, cy + 32, 144, 4);
    ctx.fillRect(cx + 52, cy + 2, 36, 4);
    // 2 monitors
    [{x: cx-32, c:"#3a8ff4"},{x: cx+20, c:"#f4a261"}].forEach(({x: mx, c}) => {
      ctx.fillStyle = "#1e2c3e"; ctx.fillRect(mx-14, cy-22, 28, 20);
      ctx.fillStyle = c; ctx.globalAlpha = 0.72;
      ctx.fillRect(mx-12, cy-20, 24, 16); ctx.globalAlpha = 1;
      ctx.fillStyle = "#2a3545"; ctx.fillRect(mx-3, cy-3, 6, 5);
      ctx.fillStyle = c; ctx.globalAlpha = 0.06;
      ctx.fillRect(mx-22, cy-30, 44, 34); ctx.globalAlpha = 1;
    });
    ctx.fillStyle = "#2a3a50"; ctx.fillRect(cx+58, cy-28, 22, 14);
    ctx.fillStyle = "#3a5a7a"; ctx.globalAlpha = 0.8;
    ctx.fillRect(cx+59, cy-27, 20, 12); ctx.globalAlpha = 1;
    ctx.fillStyle = "#2a5a1a"; ctx.fillRect(cx-72+4, cy+4, 12, 10);
    ctx.fillStyle = "#3a8a2a"; ctx.fillRect(cx-72+2, cy-4, 16, 10);
  }

  function drawConference(room) {
    const cx = room.x + room.w * 0.5;
    const cy = room.y + room.h * 0.58;
    ctx.fillStyle = "#6b4010";
    ctx.beginPath(); ctx.ellipse(cx, cy, 84, 44, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#8a5a22";
    ctx.beginPath(); ctx.ellipse(cx-8, cy-7, 54, 25, -0.15, 0, Math.PI*2); ctx.fill();
    [[-80,0],[80,0],[-46,-52],[46,-52],[-46,52],[46,52]].forEach(([dx,dy]) => {
      ctx.fillStyle = "#1e2e40"; ctx.fillRect(cx+dx-11, cy+dy-11, 22, 22);
      ctx.fillStyle = "#2a4050"; ctx.fillRect(cx+dx-9, cy+dy-9, 18, 14);
    });
    ctx.fillStyle = "#e8e8e0"; ctx.fillRect(room.x+20, room.y+24, room.w-40, 18);
    ctx.fillStyle = "#aabbcc"; ctx.fillRect(room.x+22, room.y+26, room.w-44, 14);
  }

  function drawKitchen(room) {
    const {x, y, w, h} = room;
    ctx.fillStyle = "#c8c8c0"; ctx.fillRect(x+8, y+24, w-16, 28);
    ctx.fillRect(x+8, y+24, 28, h-44);
    ctx.fillStyle = "#a0a098"; ctx.fillRect(x+8, y+51, w-16, 3);
    ctx.fillRect(x+35, y+24, 3, h-44);
    ctx.fillStyle = "#222"; ctx.fillRect(x+38, y+30, 54, 20);
    ctx.fillStyle = "#333"; ctx.fillRect(x+40, y+32, 40, 14);
    ctx.fillStyle = "#ff3300"; ctx.globalAlpha = 0.9;
    ctx.fillRect(x+82, y+35, 8, 8); ctx.globalAlpha = 1;
    ctx.fillStyle = "#c0c0c8"; ctx.fillRect(x+w-44, y+25, 32, h-46);
    const fh = Math.floor((h-56)/2);
    ctx.fillStyle = "#aaa";
    ctx.fillRect(x+w-42, y+28, 28, fh);
    ctx.fillRect(x+w-42, y+30+fh, 28, fh);
    ctx.fillStyle = "#888"; ctx.fillRect(x+w-20, y+40, 3, 28);
    ctx.fillRect(x+w-20, y+40+fh+4, 3, 22);
    ctx.fillStyle = "#1a1a1a"; ctx.fillRect(x+40, y+56, 30, 36);
    ctx.fillStyle = "#333"; ctx.fillRect(x+42, y+58, 26, 20);
    ctx.fillStyle = "#ff6600"; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.arc(x+55, y+82, 6, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawLounge(room) {
    const {x, y, w, h} = room;

    // ── Sofa (top)
    ctx.fillStyle = "#1e3a52"; ctx.fillRect(x+14, y+28, w-28, 48);
    ctx.fillStyle = "#2a4f6e";
    ctx.fillRect(x+14, y+28, w-28, 14);
    ctx.fillRect(x+14, y+28, 14, 48);
    ctx.fillRect(x+w-28, y+28, 14, 48);
    ctx.fillStyle = "#1a3044"; ctx.fillRect(x+28, y+42, w-56, 26);

    // ── Coffee table
    ctx.fillStyle = "#6b4c2a"; ctx.fillRect(x+26, y+88, w-52, 20);
    ctx.fillStyle = "#5a3c1a"; ctx.fillRect(x+26, y+107, w-52, 3);

    // ── Plant (left side, tall)
    ctx.fillStyle = "#2a1a08"; ctx.fillRect(x+14, y+122, 18, 26);
    ctx.fillStyle = "#1a4a1a"; ctx.fillRect(x+8,  y+96,  30, 28);
    ctx.fillStyle = "#246a24"; ctx.fillRect(x+12, y+80,  22, 20);
    ctx.fillStyle = "#2a7a2a"; ctx.fillRect(x+16, y+70,  14, 12);
    ctx.fillStyle = "#48a848"; ctx.fillRect(x+19, y+64,   8,  8);

    // ── Ping pong table (proper top-down view)
    // Table sits in upper-middle of lounge, portrait orientation
    const ptX = x + 20;
    const ptY = y + 160;
    const ptW = w - 40;
    const ptH = 100;

    // Table shadow
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fillRect(ptX + 4, ptY + 4, ptW, ptH);

    // Table surface - dark green base
    ctx.fillStyle = "#0a4a16";
    ctx.fillRect(ptX, ptY, ptW, ptH);
    // Inner playing area - lighter green
    ctx.fillStyle = "#1a6b28";
    ctx.fillRect(ptX + 3, ptY + 3, ptW - 6, ptH - 6);

    // White border line
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(ptX + 3, ptY + 3, ptW - 6, ptH - 6);

    // Center line (vertical, splits left/right)
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ptX + ptW / 2, ptY + 3);
    ctx.lineTo(ptX + ptW / 2, ptY + ptH - 3);
    ctx.stroke();

    // Net - horizontal bar across the middle (thicker)
    ctx.fillStyle = "#f0f0f0";
    ctx.fillRect(ptX + 3, ptY + ptH / 2 - 2, ptW - 6, 4);
    // Net shadow
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(ptX + 3, ptY + ptH / 2 + 2, ptW - 6, 2);
    // Net posts
    ctx.fillStyle = "#cccccc";
    ctx.fillRect(ptX + 1, ptY + ptH / 2 - 4, 4, 8);
    ctx.fillRect(ptX + ptW - 5, ptY + ptH / 2 - 4, 4, 8);

    // Ball (small, white-ish)
    ctx.fillStyle = "#ffffcc";
    ctx.beginPath();
    ctx.arc(ptX + ptW * 0.3, ptY + ptH * 0.28, 4, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = "#6dde8a";
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("PING PONG", ptX + ptW / 2, ptY + ptH + 14);
    ctx.textAlign = "left";

    // ── Ideas whiteboard
    const ibY = y + h - 130;
    ctx.fillStyle = "#eeeeea";
    ctx.fillRect(x + 14, ibY, w - 28, 78);
    ctx.fillStyle = "rgba(0,0,0,0.1)"; ctx.fillRect(x+14, ibY, w-28, 4);
    ctx.strokeStyle = "#3366ff"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x+20, ibY+16); ctx.lineTo(x+66, ibY+16); ctx.stroke();
    ctx.strokeStyle = "#ff4444"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x+20, ibY+32); ctx.lineTo(x+74, ibY+32); ctx.stroke();
    ctx.strokeStyle = "#44bb44"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x+20, ibY+48); ctx.lineTo(x+56, ibY+48); ctx.stroke();
    ctx.fillStyle = "#2d7a4e"; ctx.fillRect(x+w-54, ibY+10, 38, 38);
    ctx.fillStyle = "#3a9a62"; ctx.fillRect(x+w-52, ibY+12, 34, 34);
    ctx.fillStyle = "#8899aa";
    ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
    ctx.fillText("IDEAS", x + w / 2, ibY + 94); ctx.textAlign = "left";
  }

  // ── SPRITE ───────────────────────────────────────────────
  function drawSprite(agent, now) {
    const {pos, color, name, state, bubble, pulse, notifyColor} = agent;
    const x = Math.round(pos.x), y = Math.round(pos.y);
    const atDesk = state === "idle_desk" || state === "task_working";
    const isMoving = (state === "idle_wander" || state === "task_commute") && agent.target &&
                     (Math.abs(pos.x - agent.target.x) > 2 || Math.abs(pos.y - agent.target.y) > 2);
    const bob   = atDesk ? Math.sin(now / 600) * 0.5 : Math.sin(now / 290 + pos.x * 0.022) * 1.8;
    const legA  = isMoving ? Math.sin(now / 110) * 3 : 0;
    const bx = x - 9, by = y - 26 + bob;

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath(); ctx.ellipse(x, y + 4, 9, 3, 0, 0, Math.PI * 2); ctx.fill();

    // Legs
    ctx.fillStyle = "#2a3040";
    ctx.fillRect(bx+4, by+19, 5, 9+legA);
    ctx.fillRect(bx+10, by+19, 5, 9-legA);

    // Body
    ctx.fillStyle = color; ctx.fillRect(bx+2, by+8, 14, 12);

    // Arms
    ctx.fillStyle = color;
    if (state === "task_working") {
      ctx.fillRect(bx-1, by+8, 4, 6); ctx.fillRect(bx+15, by+8, 4, 6);
    } else {
      ctx.fillRect(bx-2, by+10, 4, 8); ctx.fillRect(bx+16, by+10, 4, 8);
    }

    // Head
    ctx.fillStyle = "#f0c89a"; ctx.fillRect(bx+4, by, 10, 10);
    ctx.fillStyle = "#3a2a18"; ctx.fillRect(bx+4, by, 10, 3);
    ctx.fillStyle = "#1a1020";
    ctx.fillRect(bx+6, by+4, 2, 2); ctx.fillRect(bx+10, by+4, 2, 2);

    // Working sparkle
    if (state === "task_working") {
      ctx.fillStyle = "#f9d65c";
      ctx.fillRect(bx+18, by-5, 3, 3); ctx.fillRect(bx+22, by-9, 2, 2); ctx.fillRect(bx+20, by-12, 2, 2);
    }

    // Pulse ring
    if (pulse > 0.02) {
      ctx.strokeStyle = notifyColor; ctx.globalAlpha = pulse * 0.7; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y-10, 16+(1-pulse)*14, 0, Math.PI*2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Name
    ctx.fillStyle = "#b8cede"; ctx.font = "10px monospace";
    ctx.textAlign = "center"; ctx.fillText(name, x, y+18); ctx.textAlign = "left";

    // Speech bubble
    if (bubble && bubble.until > now) {
      const txt = bubble.text;
      const tw = Math.max(65, txt.length * 5.8 + 14);
      const bbx = x - tw / 2, bby = by - 20;
      ctx.fillStyle = "#0c1724ee"; ctx.strokeStyle = "#3a5878"; ctx.lineWidth = 1;
      rr(bbx, bby-16, tw, 16, 3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#0c1724ee";
      ctx.beginPath(); ctx.moveTo(x-4,bby); ctx.lineTo(x+4,bby); ctx.lineTo(x,bby+5); ctx.fill();
      ctx.fillStyle = "#a8c0d8"; ctx.font = "9px monospace";
      ctx.textAlign = "center"; ctx.fillText(txt, x, bby-4); ctx.textAlign = "left";
    }
  }

  // ── STATE MACHINE ────────────────────────────────────────
  const reservedSpots = new Map();
  const socialEvents = [];

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function roomContains(room, p) {
    return p.x >= room.x && p.x <= room.x + room.w && p.y >= room.y && p.y <= room.y + room.h;
  }

  function roomIdOfPoint(p) {
    // Corridor band is shared space; treat as no-room to enforce hallway routing.
    if (p.y >= 224 && p.y <= 248) return null;
    for (const [roomId, room] of Object.entries(ROOMS)) {
      if (roomContains(room, p)) return roomId;
    }
    return null;
  }

  function corridorIndexNear(p) {
    let bestIdx = 0;
    let best = Infinity;
    CORRIDOR_SPOTS.forEach((c, i) => {
      const d = dist(c, p);
      if (d < best) { best = d; bestIdx = i; }
    });
    return bestIdx;
  }

  function dedupeRoute(points) {
    const out = [];
    points.forEach((p) => {
      if (!p) return;
      const prev = out[out.length - 1];
      if (!prev || dist(prev, p) > 2) out.push({ x: p.x, y: p.y });
    });
    return out;
  }

  function doorPortal(roomId) {
    const room = ROOMS[roomId];
    const door = ROOM_DOORS[roomId];
    if (!room || !door) return null;

    if (Math.abs(door.y - (room.y + room.h)) <= 3) {
      return {
        inside: { x: door.x, y: door.y - 12 },
        door: { x: door.x, y: door.y },
        outside: { x: door.x, y: CORRIDOR_Y }
      };
    }
    if (Math.abs(door.y - room.y) <= 3) {
      return {
        inside: { x: door.x, y: door.y + 12 },
        door: { x: door.x, y: door.y },
        outside: { x: door.x, y: CORRIDOR_Y }
      };
    }
    if (Math.abs(door.x - room.x) <= 3) {
      return {
        inside: { x: door.x + 12, y: door.y },
        door: { x: door.x, y: door.y },
        outside: { x: 980, y: door.y }
      };
    }
    if (Math.abs(door.x - (room.x + room.w)) <= 3) {
      return {
        inside: { x: door.x - 12, y: door.y },
        door: { x: door.x, y: door.y },
        outside: { x: 980, y: door.y }
      };
    }
    return null;
  }

  function buildRoute(from, to) {
    const fromRoom = roomIdOfPoint(from);
    const toRoom = roomIdOfPoint(to);
    if (fromRoom && toRoom && fromRoom === toRoom) return dedupeRoute([to]);

    const points = [];
    const fromPortal = fromRoom ? doorPortal(fromRoom) : null;
    const toPortal = toRoom ? doorPortal(toRoom) : null;

    if (fromPortal) {
      points.push(fromPortal.inside, fromPortal.door, fromPortal.outside);
    }

    const startAnchor = fromPortal ? fromPortal.outside : from;
    const endAnchor = toPortal ? toPortal.outside : to;
    const startIdx = corridorIndexNear(startAnchor);
    const endIdx = corridorIndexNear(endAnchor);
    const step = startIdx <= endIdx ? 1 : -1;
    for (let i = startIdx; i !== endIdx + step; i += step) points.push(CORRIDOR_SPOTS[i]);
    if (toPortal) points.push(toPortal.outside, toPortal.door, toPortal.inside);
    points.push(to);
    return dedupeRoute(points);
  }

  function startWalk(agent, destination, opts = {}) {
    agent.route = buildRoute(agent.pos, destination);
    agent.target = agent.route.shift() || { ...destination };
    agent.state = opts.state || "idle_wander";
    if (opts.activity) agent.activity = opts.activity;
    if (opts.intent) agent.intent = opts.intent;
    if (opts.statusNote) agent.statusNote = opts.statusNote;
    if (opts.until) agent.stateUntil = opts.until;
  }

  function isSociallyAvailable(agent) {
    if (!agent) return false;
    if (agent.state.startsWith("task")) return false;
    if (agent.activity === "meeting") return false;
    if (agent.inviteFrom || agent.inviteTo) return false;
    return true;
  }

  function reserveSpot(zone, spots, agentId, preferred = null) {
    const order = preferred === null
      ? spots.map((_, i) => i)
      : [preferred, ...spots.map((_, i) => i).filter((i) => i !== preferred)];
    for (const idx of order) {
      const key = `${zone}:${idx}`;
      if (!reservedSpots.has(key) || reservedSpots.get(key) === agentId) {
        reservedSpots.set(key, agentId);
        return { key, spot: { ...spots[idx] } };
      }
    }
    return null;
  }

  function releaseSpot(agent) {
    if (!agent?.reservedSpot) return;
    reservedSpots.delete(agent.reservedSpot);
    agent.reservedSpot = null;
  }

  function pushSocialEvent(agentId, title) {
    socialEvents.unshift({
      eventId: `social-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      taskId: `social-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      agentId,
      status: "social",
      source: "office",
      title,
      timestamp: new Date().toISOString()
    });
    if (socialEvents.length > 80) socialEvents.length = 80;
    renderFeed();
  }

  function moveToward(agent, target) {
    const dx = target.x - agent.pos.x, dy = target.y - agent.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= agent.speed) { agent.pos.x = target.x; agent.pos.y = target.y; return true; }
    let vx = (dx / dist) * agent.speed;
    let vy = (dy / dist) * agent.speed;
    for (const other of AGENTS) {
      if (other.id === agent.id) continue;
      const ox = agent.pos.x - other.pos.x;
      const oy = agent.pos.y - other.pos.y;
      const od = Math.hypot(ox, oy);
      if (od < 18 && od > 0.01) {
        const rep = (18 - od) * 0.04;
        vx += (ox / od) * rep;
        vy += (oy / od) * rep;
      }
    }
    const v = Math.hypot(vx, vy) || 1;
    const scale = Math.min(1, agent.speed / v);
    agent.pos.x += vx * scale;
    agent.pos.y += vy * scale;
    return false;
  }

  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function setBubble(agent, text, ms = 2200) {
    agent.bubble = { text, until: performance.now() + ms };
  }

  // ── ACTIVITY SYSTEM ──────────────────────────────────────
  // Weighted activities tuned per role for more realistic office rhythm.
  const ACTIVITIES = [
    { type: "desk",     minDur: 9000,  maxDur: 18000 },
    { type: "chat",     minDur: 1500,  maxDur: 3200  },
    { type: "coffee",   minDur: 7000,  maxDur: 12000 },
    { type: "lounge",   minDur: 10000, maxDur: 20000 },
    { type: "pingpong", minDur: 12000, maxDur: 22000 },
    { type: "corridor", minDur: 5000,  maxDur: 11000 }
  ];
  const ACTIVITY_PROFILES = {
    main:     { desk: 52, chat: 12, coffee: 10, lounge: 7,  pingpong: 4, corridor: 15 },
    coder:    { desk: 60, chat: 8,  coffee: 12, lounge: 6,  pingpong: 4, corridor: 10 },
    marketer: { desk: 42, chat: 18, coffee: 10, lounge: 10, pingpong: 8, corridor: 12 },
    daily:    { desk: 45, chat: 15, coffee: 11, lounge: 8,  pingpong: 5, corridor: 16 },
    kalshi:   { desk: 50, chat: 10, coffee: 9,  lounge: 7,  pingpong: 8, corridor: 16 }
  };

  function pickActivity(agent) {
    const profile = ACTIVITY_PROFILES[agent.id] || ACTIVITY_PROFILES.main;
    const weighted = ACTIVITIES.map((a) => ({ ...a, weight: profile[a.type] || 0 }));
    const total = weighted.reduce((s, a) => s + a.weight, 0);
    let r = Math.random() * total;
    for (const act of weighted) { r -= act.weight; if (r <= 0) return act; }
    return weighted[0];
  }

  const ACTIVITY_ARRIVE_BUBBLES = {
    coffee:   ["Ah, kahve!", "Tam zamanında.", "Kafein gibi."],
    lounge:   ["İyi geldi.", "Temiz hava.", "5 dakika."],
    pingpong: ["Hazır mısın?", "Servis bende!", "Bu sefer kazanıyorum."],
    corridor: ["Bir tur iyi geldi.", "Koridor trafiği yoğun.", "Nefes açıldı."]
  };

  const ACTIVITY_GO_BUBBLES = {
    coffee:   ["Kahve zamanı.", "Kafein lazım.", "Çay alsam mı?"],
    lounge:   ["Biraz mola.", "5 dakika dinleneyim.", "Nefes alayım."],
    pingpong: ["Kim oynuyor?", "Ping pong zamanı!", "Çabuk bir maç?"],
    corridor: ["Koridorda tur atayım.", "Bir check yapıp döneyim.", "Kısa bir yürüyüş."],
    meeting:  ["Toplantı var.", "Konferans odası.", "Hemen geliyorum."],
    invite:   ["Bir maç var mısın?", "Ping pong?", "2 dakika oynayalım mı?"],
    accept:   ["Olur, geliyorum.", "Tamam, hadi.", "Olur, bir set."]
  };

  function clearSocialIntent(agent) {
    agent.inviteToken += 1;
    agent.inviteFrom = null;
    agent.inviteTo = null;
    agent.intent = "focused_work";
  }

  function reserveAndWalk(agent, zone, spots, options) {
    releaseSpot(agent);
    const pick = reserveSpot(zone, spots, agent.id, options?.preferred ?? null);
    const destination = pick?.spot || { ...rand(spots) };
    if (pick) agent.reservedSpot = pick.key;
    startWalk(agent, destination, options);
  }

  function nearestInviteCandidate(agent) {
    return AGENTS
      .filter((a) => a.id !== agent.id && isSociallyAvailable(a))
      .sort((a, b) => dist(a.pos, agent.pos) - dist(b.pos, agent.pos))[0] || null;
  }

  function startPingPongInvite(agent, until) {
    const partner = nearestInviteCandidate(agent);
    if (!partner || dist(agent.pos, partner.pos) > 340) {
      reserveAndWalk(agent, "pingpong", PING_PONG_SPOTS, {
        activity: "pingpong",
        intent: "solo_pingpong",
        statusNote: "Heading to Ping Pong",
        until
      });
      setBubble(agent, rand(ACTIVITY_GO_BUBBLES.pingpong), 2000);
      return;
    }

    const token = ++agent.inviteToken;
    agent.inviteTo = partner.id;
    agent.activity = "chat";
    agent.intent = "invite_pingpong";
    agent.statusNote = `Inviting ${partner.name}`;
    agent.state = "idle_chat";
    agent.stateUntil = performance.now() + 2000;
    setBubble(agent, rand(ACTIVITY_GO_BUBBLES.invite), 2100);

    partner.inviteFrom = agent.id;
    partner.activity = "chat";
    partner.intent = "responding_invite";
    partner.statusNote = `Replying to ${agent.name}`;
    partner.state = "idle_chat";
    partner.stateUntil = performance.now() + 2000;
    setBubble(partner, rand(ACTIVITY_GO_BUBBLES.accept), 1900);

    pushSocialEvent(agent.id, `${agent.name} invited ${partner.name} to ping pong`);

    setTimeout(() => {
      if (agent.inviteToken !== token) return;
      if (!isSociallyAvailable(partner) || partner.inviteFrom !== agent.id) {
        clearSocialIntent(agent);
        returnToDesk(agent);
        return;
      }

      const acceptChance = 0.82;
      if (Math.random() > acceptChance) {
        setBubble(partner, "Sonra oynayalım.", 1600);
        clearSocialIntent(agent);
        clearSocialIntent(partner);
        returnToDesk(agent);
        returnToDesk(partner);
        return;
      }

      clearSocialIntent(agent);
      clearSocialIntent(partner);
      reserveAndWalk(agent, "pingpong", PING_PONG_SPOTS, {
        preferred: 0,
        activity: "pingpong",
        intent: `pingpong_with_${partner.id}`,
        statusNote: `Walking with ${partner.name}`,
        until
      });
      reserveAndWalk(partner, "pingpong", PING_PONG_SPOTS, {
        preferred: 1,
        activity: "pingpong",
        intent: `pingpong_with_${agent.id}`,
        statusNote: `Walking with ${agent.name}`,
        until
      });
      setBubble(agent, "Hadi başlayalım.", 1600);
      setBubble(partner, "Geliyorum.", 1600);
      pushSocialEvent(agent.id, `${agent.name} and ${partner.name} started ping pong`);
    }, 1600);
  }

  function scheduleActivity(agent) {
    if (agent.state.startsWith("task")) return;
    if (agent.activity === "meeting") return;

    const now = performance.now();
    const act  = pickActivity(agent);
    const dur  = act.minDur + Math.random() * (act.maxDur - act.minDur);

    agent.activity = act.type;

    if (act.type === "desk") {
      startWalk(agent, { ...agent.desk }, {
        activity: "desk",
        intent: "focused_work",
        statusNote: "Heading to Desk",
        until: now + dur
      });
      if (Math.random() < 0.18) setBubble(agent, rand(BUBBLES[agent.id]), 1800);

    } else if (act.type === "chat") {
      releaseSpot(agent);
      agent.state = "idle_chat";
      agent.target = null;
      agent.stateUntil = now + dur;
      agent.intent = "small_talk";
      agent.statusNote = "Small Talk";
      setBubble(agent, rand(BUBBLES[agent.id]));

    } else if (act.type === "coffee") {
      reserveAndWalk(agent, "kitchen", KITCHEN_SPOTS, {
        activity: "coffee",
        intent: "coffee_break",
        statusNote: "Going for Coffee",
        until: now + dur
      });
      setBubble(agent, rand(ACTIVITY_GO_BUBBLES.coffee), 2000);

    } else if (act.type === "lounge") {
      reserveAndWalk(agent, "lounge", LOUNGE_SPOTS, {
        activity: "lounge",
        intent: "lounge_break",
        statusNote: "Going to Lounge",
        until: now + dur
      });
      setBubble(agent, rand(ACTIVITY_GO_BUBBLES.lounge), 2000);

    } else if (act.type === "pingpong") {
      startPingPongInvite(agent, now + dur);

    } else if (act.type === "corridor") {
      releaseSpot(agent);
      startWalk(agent, { ...rand(CORRIDOR_SPOTS) }, {
        activity: "corridor",
        intent: "corridor_walk",
        statusNote: "Walking Corridor",
        until: now + dur
      });
      setBubble(agent, rand(ACTIVITY_GO_BUBBLES.corridor), 1800);
    }
  }

  function returnToDesk(agent) {
    releaseSpot(agent);
    clearSocialIntent(agent);
    agent.activity = "desk";
    startWalk(agent, { ...agent.desk }, {
      activity: "desk",
      intent: "focused_work",
      statusNote: "Returning to Desk",
      until: performance.now() + 9000 + Math.random() * 9000
    });
  }

  // ── MEETING SCHEDULER ────────────────────────────────────
  let meetingActive = false;

  function scheduleMeetings() {
    function triggerMeeting() {
      const delay = 70000 + Math.random() * 80000; // every ~2 min
      setTimeout(() => {
        if (meetingActive) { triggerMeeting(); return; }

        const available = AGENTS.filter(a => !a.state.startsWith("task") && a.activity !== "meeting");
        if (available.length < 2) { triggerMeeting(); return; }

        const n = 2 + Math.floor(Math.random() * Math.min(3, available.length - 1));
        const participants = available.sort(() => Math.random() - 0.5).slice(0, n);
        const meetingDur = 20000 + Math.random() * 25000;
        const meetEnd = performance.now() + meetingDur + 6000;

        meetingActive = true;

        const spots = [...CONF_SPOTS].sort(() => Math.random() - 0.5);
        participants.forEach((agent, i) => {
          releaseSpot(agent);
          clearSocialIntent(agent);
          agent.activity = "meeting";
          reserveAndWalk(agent, "conference", spots, {
            preferred: i % spots.length,
            activity: "meeting",
            intent: "meeting_walk",
            statusNote: "Going to Meeting",
            until: meetEnd
          });
          setBubble(agent, rand(ACTIVITY_GO_BUBBLES.meeting), 2200);
        });

        setTimeout(() => {
          meetingActive = false;
          participants.forEach(agent => {
            if (agent.activity === "meeting" && !agent.state.startsWith("task")) {
              returnToDesk(agent);
            }
          });
          triggerMeeting();
        }, meetingDur + 6000);

      }, delay);
    }
    triggerMeeting();
  }

  function assignTask(agent, evt) {
    if (agent.currentTask?.taskId === evt.taskId) return;
    if (agent.state === "task_working") { agent.queue.push(evt); return; }
    releaseSpot(agent);
    clearSocialIntent(agent);
    agent.route = [];
    agent.target = null;
    agent.activity = "desk";
    agent.intent = "task_ack";
    agent.statusNote = "Task Incoming";
    agent.currentTask = evt;
    agent.state = "task_notified";
    agent.notifyColor = SOURCE_COLORS[evt.source] || "#ffd166";
    agent.pulse = 1;
    setBubble(agent, `${evt.source}: ${(evt.title || "task").slice(0, 22)}`, 1700);
    agent.stateUntil = performance.now() + 850;
  }

  // ── EVENT STORE & FEED ───────────────────────────────────
  // taskMap: taskId → latest event (dedup by taskId, keep latest status)
  const taskMap   = new Map();
  const seenEventIds = new Set();
  let lastEventTs = new Date(0).toISOString();

  function applyEvent(evt) {
    if (!evt?.agentId || !evt?.status) return;
    if (evt.type === "hello" || evt.type === "ping") return;
    if (evt.eventId && seenEventIds.has(evt.eventId)) return;
    if (evt.eventId) seenEventIds.add(evt.eventId);
    if (evt.timestamp > lastEventTs) lastEventTs = evt.timestamp;

    // Upsert task in map: keep newest status for each taskId
    const existing = taskMap.get(evt.taskId);
    if (!existing || evt.timestamp >= existing.timestamp) {
      taskMap.set(evt.taskId, { ...evt });
    }
    renderFeed();

    const agent = AGENT_BY_ID[evt.agentId];
    if (!agent) return;

    if (evt.status === "assigned") {
      assignTask(agent, evt);
    } else if (evt.status === "started") {
      if (!agent.currentTask || agent.currentTask.taskId !== evt.taskId) agent.currentTask = evt;
      agent.statusNote = "Commuting to Desk";
      startWalk(agent, { ...agent.desk }, {
        state: "task_commute",
        activity: "desk",
        intent: "task_commute",
        until: performance.now() + 5000
      });
    } else if (evt.status === "done") {
      agent.state = "task_done"; agent.notifyColor = "#48d597"; agent.pulse = 1;
      agent.statusNote = "Task Completed";
      setBubble(agent, "Tamamlandi ✓", 1400);
      agent.stateUntil = performance.now() + 1400;
    } else if (evt.status === "failed") {
      agent.state = "task_failed"; agent.notifyColor = "#ff6262"; agent.pulse = 1;
      agent.statusNote = "Task Blocked";
      setBubble(agent, "Takildi ✗", 1400);
      agent.stateUntil = performance.now() + 1600;
    }
    renderStatus();
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  }

  function renderFeed() {
    // Merge task feed with lightweight social feed.
    const taskItems = Array.from(taskMap.values());
    const items = taskItems.concat(socialEvents)
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .slice(0, 20);
    feedEl.innerHTML = "";
    items.forEach(e => {
      const li = document.createElement("li");
      const c  = e.status === "social" ? "#9bb2cc" : (STATUS_COLORS[e.status] || "#9bb2cc");
      li.innerHTML = `<div><b>${esc(e.agentId)}</b> — ${esc(e.title || "task")}</div>
        <div class="meta"><span style="color:${c}">● ${esc(e.status)}</span> · ${esc(e.source)} · ${new Date(e.timestamp || Date.now()).toLocaleTimeString()}</div>`;
      feedEl.appendChild(li);
    });
  }

  function renderStatus() {
    statusEl.innerHTML = "";
    AGENTS.forEach(a => {
      const row = document.createElement("div");
      row.className = "agent-row";
      const sc = a.state.startsWith("task") ? "#ffd166" : "#6dde8a";
      const stateLabel = a.state.startsWith("task")
        ? (STATE_LABELS[a.state] || a.state)
        : (a.statusNote || ACTIVITY_LABELS[a.activity] || STATE_LABELS[a.state] || a.state);
      row.innerHTML = `<div>
        <div class="name" style="color:${a.color}">${a.name} <span class="state">(${stateLabel})</span></div>
        <div class="queue">Queue: ${a.queue.length}</div>
      </div><div style="color:${sc};font-size:11px">${a.role}</div>`;
      statusEl.appendChild(row);
    });
  }

  // ── MAIN LOOP ────────────────────────────────────────────
  let lastStatusRender = 0;

  function tick(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Refresh sidebar every 800ms to reflect activity changes
    if (now - lastStatusRender > 800) { renderStatus(); lastStatusRender = now; }
    ctx.fillStyle = floorPattern; ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawCorridors();
    Object.entries(ROOMS).forEach(([roomId, room]) => drawRoom(roomId, room));
    drawDoors();
    drawCEODesk(ROOMS.ceo);
    drawConference(ROOMS.conference);
    drawKitchen(ROOMS.kitchen);
    drawLounge(ROOMS.lounge);
    AGENTS.forEach(a => {
      if (a.id === "main") return;
      const room = Object.values(ROOMS).find(r => r.agentId === a.id);
      if (room) drawAgentDesk(room.x + room.w * 0.5, room.y + room.h * 0.58, a);
    });

    AGENTS.forEach(agent => {
      if (agent.pulse > 0) agent.pulse -= 0.009;
      const {state} = agent;

      if (state === "task_notified" && now >= agent.stateUntil) {
        startWalk(agent, { ...agent.desk }, {
          state: "task_commute",
          activity: "desk",
          intent: "task_commute",
          statusNote: "Commuting to Desk",
          until: now + 5000
        });

      } else if (state === "task_commute" && agent.target) {
        if (moveToward(agent, agent.target)) {
          if (agent.route.length > 0) {
            agent.target = agent.route.shift();
          } else {
            agent.target = null;
            agent.state = "task_working";
            agent.stateUntil = now + 2200 + Math.random() * 2500;
            agent.statusNote = "Working";
            setBubble(agent, "Calisiyorum...", 1300);
          }
        }
      } else if (state === "task_working" && now >= agent.stateUntil) {
        applyEvent({
          eventId: `auto-${Date.now()}-${agent.id}`,
          taskId: agent.currentTask?.taskId || `task-${Date.now()}`,
          agentId: agent.id, status: "done",
          source: agent.currentTask?.source || "openclaw",
          title: agent.currentTask?.title || "Task",
          timestamp: new Date().toISOString()
        });
      } else if ((state === "task_done" || state === "task_failed") && now >= agent.stateUntil) {
        agent.currentTask = null;
        if (agent.queue.length > 0) assignTask(agent, agent.queue.shift());
        else returnToDesk(agent);

      } else if (state === "idle_desk" && now >= agent.stateUntil) {
        if (agent.activity === "meeting" || agent.activity === "corridor" || agent.activity === "coffee" || agent.activity === "lounge" || agent.activity === "pingpong") {
          returnToDesk(agent);
        } else {
          scheduleActivity(agent);
        }

      } else if (state === "idle_wander" && agent.target) {
        if (moveToward(agent, agent.target)) {
          if (agent.route.length > 0) {
            agent.target = agent.route.shift();
          } else {
            agent.target = null;
            agent.state = "idle_desk";
            agent.statusNote = ACTIVITY_LABELS[agent.activity] || "At Desk";
            if (now >= agent.stateUntil || agent.activity === "desk") {
              agent.stateUntil = now + (agent.activity === "desk"
                ? 9000 + Math.random() * 10000
                : 6000 + Math.random() * 8000);
              const ab = ACTIVITY_ARRIVE_BUBBLES[agent.activity];
              if (ab) setBubble(agent, rand(ab), 2500);
            }
          }
        } else if (now >= agent.stateUntil && agent.activity !== "meeting") {
          returnToDesk(agent);
        }
      } else if (state === "idle_chat" && now >= agent.stateUntil) {
        scheduleActivity(agent);
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
      evtSource.onmessage = e => { try { applyEvent(JSON.parse(e.data)); } catch (_) {} };
      evtSource.onerror = () => {
        connPill.textContent = "RETRYING"; connPill.style.color = "#ffbf69";
        evtSource.close(); evtSource = null;
        setTimeout(() => connectSSE(apiBase), 4000);
      };
    } catch (_) {}
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
    const agentIds = ["main","coder","marketer","daily","kalshi"];
    const titles   = ["New thread","Code fix","Campaign tweak","Schedule task","Market check"];
    setInterval(() => {
      if (taskMap.size > 0) return;
      const agentId = rand(agentIds), source = rand(["slack","telegram","openclaw"]);
      const taskId = `${source}-${Date.now()}`;
      applyEvent({ eventId:`${taskId}-a`, taskId, agentId, source, status:"assigned", title:rand(titles), timestamp:new Date().toISOString() });
      setTimeout(() => applyEvent({ eventId:`${taskId}-s`, taskId, agentId, source, status:"started", title:rand(titles), timestamp:new Date().toISOString() }), 500);
    }, 14000);
  }

  // ── INIT ─────────────────────────────────────────────────
  renderStatus();
  scheduleMeetings();
  const configuredBase = (window.OFFICE_CONFIG?.apiBase || "").replace(/\/$/, "");
  if (configuredBase) connectSSE(configuredBase);
  else pollVercel();

  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") demoPulse();

  requestAnimationFrame(tick);
})();
