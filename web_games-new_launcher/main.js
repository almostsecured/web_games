(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreLeftEl = document.getElementById("score-left");
  const scoreRightEl = document.getElementById("score-right");
  const statusEl = document.getElementById("status-text");
  const winnerBanner = document.getElementById("winner-banner");
  const menuEl = document.getElementById("menu");
  const localBtn = document.getElementById("local-btn");
  const onlineBtn = document.getElementById("online-btn");
  const settingsBtn = document.getElementById("settings-btn");
  const restartBtn = document.getElementById("restart-btn");
  const createLobbyBtn = document.getElementById("create-lobby-btn");
  const joinLobbyBtn = document.getElementById("join-lobby-btn");
  const lobbyBackBtn = document.getElementById("lobby-back-btn");
  const lobbyLeaveBtn = document.getElementById("lobby-leave-btn");
  const settingsBackBtn = document.getElementById("settings-back-btn");
  const lobbyCodeEl = document.getElementById("lobby-code");
  const lobbyStatusEl = document.getElementById("lobby-status");
  const joinCodeGroup = document.getElementById("join-code");
  const joinCodeBoxes = joinCodeGroup ? Array.from(joinCodeGroup.querySelectorAll(".code-box")) : [];
  const screenMain = document.getElementById("screen-main");
  const screenLobby = document.getElementById("screen-lobby");
  const screenSettings = document.getElementById("screen-settings");
  const toggleMusic = document.getElementById("toggle-music");
  const toggleSfx = document.getElementById("toggle-sfx");
  const toggleVfx = document.getElementById("toggle-vfx");

  const BASE = { w: 1280, h: 720 };
  const TAU = Math.PI * 2;

  const state = {
    running: false,
    paused: true,
    winner: null,
    serveTimer: 0,
    time: 0,
    lastTime: 0,
    scoreLeft: 0,
    scoreRight: 0,
    scoreLimit: 9,
    vfxBoost: true,
    mode: "local",
    role: "left",
  };

  const input = {
    keys: new Set(),
    pointer: {
      x: BASE.w / 2,
      y: BASE.h / 2,
      active: false,
      lastMove: 0,
    },
  };

  const screens = {
    main: screenMain,
    lobby: screenLobby,
    settings: screenSettings,
  };

  const net = {
    socket: null,
    connected: false,
    roomCode: "",
    role: null,
    status: "offline",
    lastSend: 0,
    pendingPayload: null,
    local: { y: BASE.h / 2, vy: 0 },
    targetState: null,
    renderState: null,
    lastStateAt: 0,
    score: { left: 0, right: 0 },
    ready: { left: false, right: false },
  };

  let restartPulseTimer = null;
  let winnerHideTimer = null;

  const left = {
    x: 88,
    y: BASE.h / 2,
    w: 18,
    h: 130,
    speed: 740,
    accel: 2400,
    vy: 0,
  };

  const right = {
    x: BASE.w - 88,
    y: BASE.h / 2,
    w: 18,
    h: 130,
    speed: 740,
    accel: 2400,
    vy: 0,
  };

  const ball = {
    x: BASE.w / 2,
    y: BASE.h / 2,
    r: 10,
    vx: 0,
    vy: 0,
    speed: 520,
    maxSpeed: 980,
  };

  const particles = [];
  const trails = [];

  const AUDIO_FILES = {
    music: "audio/bg-loop.mp3",
    hit: "audio/sfx-hit.wav",
    wall: "audio/sfx-wall.wav",
    score: "audio/sfx-score.wav",
    ready: "audio/sfx-ready.wav",
  };

  const audio = {
    enabledMusic: true,
    enabledSfx: true,
    ready: false,
    music: null,
    pools: {},

    init() {
      if (this.ready) return;
      this.music = new Audio(AUDIO_FILES.music);
      this.music.loop = true;
      this.music.volume = 0.35;
      this.music.addEventListener("error", () => {
        this.enabledMusic = false;
      });

      this.pools.hit = createAudioPool(AUDIO_FILES.hit, 6, 0.5);
      this.pools.wall = createAudioPool(AUDIO_FILES.wall, 4, 0.4);
      this.pools.score = createAudioPool(AUDIO_FILES.score, 3, 0.6);
      this.pools.ready = createAudioPool(AUDIO_FILES.ready, 2, 0.6);
      this.ready = true;
    },

    unlock() {
      this.init();
      if (this.enabledMusic) {
        this.music.play().then(() => {
          if (!this.enabledMusic) this.music.pause();
        }).catch(() => {});
      }
    },

    setMusic(on) {
      this.enabledMusic = on;
      if (!this.ready) return;
      if (on) {
        this.music.play().catch(() => {});
      } else {
        this.music.pause();
      }
    },

    setSfx(on) {
      this.enabledSfx = on;
    },

    stopAll() {
      if (this.music) {
        this.music.pause();
        this.music.currentTime = 0;
      }
      Object.values(this.pools).forEach((pool) => {
        pool.forEach((sound) => {
          sound.pause();
          sound.currentTime = 0;
        });
      });
    },

    play(name) {
      if (!this.ready || !this.enabledSfx) return;
      const pool = this.pools[name];
      if (!pool || pool.length === 0) return;
      const sound = pool.shift();
      sound.currentTime = 0;
      sound.play().catch(() => {}).finally(() => pool.push(sound));
    },
  };

  function createAudioPool(src, size, volume) {
    const pool = [];
    for (let i = 0; i < size; i += 1) {
      const audioEl = new Audio(src);
      audioEl.volume = volume;
      audioEl.addEventListener("error", () => {
        audio.enabledSfx = false;
      });
      pool.push(audioEl);
    }
    return pool;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function approach(current, target, delta) {
    if (current < target) {
      return Math.min(current + delta, target);
    }
    return Math.max(current - delta, target);
  }

  function drawRoundedRect(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function resize() {
    const container = canvas.parentElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(BASE.w * dpr);
    canvas.height = Math.floor(BASE.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function showScreen(name) {
    Object.keys(screens).forEach((key) => {
      screens[key].classList.toggle("is-active", key === name);
    });
  }

  function setLobbyStatus(text) {
    lobbyStatusEl.textContent = text;
  }

  function setLobbyCode(code) {
    lobbyCodeEl.textContent = code || "----";
  }

  function normalizeServerUrl() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const fallbackHost = window.location.host
      ? `${protocol}://${window.location.host}`
      : "ws://localhost:8080";
    const base = fallbackHost;
    const withScheme = base.startsWith("ws://") || base.startsWith("wss://") ? base : `ws://${base}`;
    return withScheme.endsWith("/ws") ? withScheme : `${withScheme}/ws`;
  }

  function setConnectionState(connected) {
    net.connected = connected;
    lobbyLeaveBtn.disabled = !connected;
  }

  function resetBall(direction) {
    const angle = rand(-0.4, 0.4);
    const speed = ball.speed;
    ball.x = BASE.w / 2;
    ball.y = BASE.h / 2;
    ball.vx = Math.cos(angle) * speed * direction;
    ball.vy = Math.sin(angle) * speed;
  }

  function startServe(direction) {
    state.serveTimer = 1.1;
    ball.vx = 0;
    ball.vy = 0;
    ball.x = BASE.w / 2;
    ball.y = BASE.h / 2;
    ball.serveDirection = direction;
  }

  function spawnParticles(x, y, tint, count) {
    const burst = count || 16;
    for (let i = 0; i < burst; i += 1) {
      particles.push({
        x,
        y,
        vx: rand(-140, 140),
        vy: rand(-140, 140),
        life: rand(0.35, 0.8),
        size: rand(1.5, 3.4),
        tint,
      });
    }
  }

  function spawnTrail(x, y, tint) {
    trails.push({
      x,
      y,
      life: 0.35,
      size: rand(14, 20),
      tint,
    });
  }

  function updatePaddle(paddle, inputY, dt) {
    const targetVy = inputY * paddle.speed;
    paddle.vy = approach(paddle.vy, targetVy, paddle.accel * dt);
    paddle.y += paddle.vy * dt;

    paddle.y = clamp(paddle.y, paddle.h / 2 + 18, BASE.h - paddle.h / 2 - 18);
  }

  function applyMouseControl(target, dt) {
    const now = performance.now();
    const pointerActive = now - input.pointer.lastMove < 1200;
    if (!pointerActive) return false;
    const prev = target.y;
    target.y = lerp(target.y, input.pointer.y, 0.45);
    target.y = clamp(target.y, left.h / 2 + 18, BASE.h - left.h / 2 - 18);
    target.vy = (target.y - prev) / dt;
    return true;
  }

  function checkPaddleCollision(paddle, direction) {
    const halfW = paddle.w / 2;
    const halfH = paddle.h / 2;
    if (
      ball.x + ball.r < paddle.x - halfW ||
      ball.x - ball.r > paddle.x + halfW ||
      ball.y + ball.r < paddle.y - halfH ||
      ball.y - ball.r > paddle.y + halfH
    ) {
      return false;
    }

    const offset = clamp((ball.y - paddle.y) / halfH, -1, 1);
    const angle = offset * (Math.PI / 3);
    const speed = Math.min(ball.maxSpeed, Math.hypot(ball.vx, ball.vy) + 35);

    ball.vx = Math.cos(angle) * speed * direction;
    ball.vy = Math.sin(angle) * speed + paddle.vy * 0.35;
    ball.x = paddle.x + (halfW + ball.r + 2) * direction;

    spawnParticles(ball.x, ball.y, direction > 0 ? "cyan" : "pink", 18);
    audio.play("hit");
    return true;
  }

  function updateBall(dt) {
    if (state.serveTimer > 0) {
      state.serveTimer -= dt;
      if (state.serveTimer <= 0) {
        resetBall(state.serveDirection || (Math.random() > 0.5 ? 1 : -1));
      }
      return;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    spawnTrail(ball.x, ball.y, "ball");

    if (ball.y - ball.r <= 0) {
      ball.y = ball.r;
      ball.vy = Math.abs(ball.vy);
      spawnParticles(ball.x, ball.y, "cyan", 10);
      audio.play("wall");
    } else if (ball.y + ball.r >= BASE.h) {
      ball.y = BASE.h - ball.r;
      ball.vy = -Math.abs(ball.vy);
      spawnParticles(ball.x, ball.y, "pink", 10);
      audio.play("wall");
    }

    if (ball.vx < 0) {
      checkPaddleCollision(left, 1);
    } else {
      checkPaddleCollision(right, -1);
    }

    if (ball.x < -60) {
      scorePoint("right");
    } else if (ball.x > BASE.w + 60) {
      scorePoint("left");
    }
  }

  function scorePoint(side) {
    if (side === "left") {
      state.scoreLeft += 1;
    } else {
      state.scoreRight += 1;
    }

    audio.play("score");
    updateScore();
    spawnParticles(BASE.w / 2, BASE.h / 2, "score", 26);

    if (state.scoreLeft >= state.scoreLimit || state.scoreRight >= state.scoreLimit) {
      state.winner = state.scoreLeft > state.scoreRight ? "left" : "right";
      pauseGame(true);
    } else {
      startServe(side === "left" ? 1 : -1);
    }
  }

  function updateScore(leftScore = state.scoreLeft, rightScore = state.scoreRight) {
    scoreLeftEl.textContent = leftScore;
    scoreRightEl.textContent = rightScore;
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function getWinnerText() {
    if (!state.winner) return "";
    if (state.mode === "online") {
      return state.winner === "left" ? "Победа" : "Поражение";
    }
    return state.winner === "left" ? "Победа слева" : "Победа справа";
  }

  function updateWinnerBanner() {
    const text = getWinnerText();
    if (winnerHideTimer) {
      clearTimeout(winnerHideTimer);
      winnerHideTimer = null;
    }
    winnerBanner.textContent = text;
    winnerBanner.classList.toggle("is-visible", Boolean(text));
    if (text) {
      winnerHideTimer = setTimeout(() => {
        winnerBanner.classList.remove("is-visible");
      }, 2500);
    }
  }

  function pulseRestartButton() {
    if (!restartBtn) return;
    restartBtn.classList.add("btn-pulse");
    if (restartPulseTimer) clearTimeout(restartPulseTimer);
    restartPulseTimer = setTimeout(() => {
      restartBtn.classList.remove("btn-pulse");
    }, 1800);
  }

  function getJoinCode() {
    return joinCodeBoxes.map((box) => box.value.trim()).join("");
  }

  function clearJoinCode() {
    joinCodeBoxes.forEach((box) => {
      box.value = "";
    });
    if (joinCodeBoxes[0]) joinCodeBoxes[0].focus();
  }

  function startLocalGame() {
    disconnectFromServer();
    state.mode = "local";
    state.role = "left";
    state.running = true;
    state.paused = false;
    state.winner = null;
    state.scoreLeft = 0;
    state.scoreRight = 0;
    updateScore();
    startServe(Math.random() > 0.5 ? 1 : -1);
    setMenuVisible(false);
    restartBtn.disabled = false;
    restartBtn.classList.remove("btn-pulse");
    setStatus("В игре");
    updateWinnerBanner();
    audio.unlock();
  }

  function resumeGame() {
    if (!state.running || state.winner) return;
    state.paused = false;
    setMenuVisible(false);
    setStatus(state.mode === "online" ? "Онлайн матч" : "В игре");
    updateWinnerBanner();
  }

  function pauseGame(showMenu) {
    if (!state.running) return;
    state.paused = true;
    if (state.winner) {
      setStatus(getWinnerText());
    } else {
      setStatus("Пауза");
    }
    updateWinnerBanner();
    if (showMenu) setMenuVisible(true);
  }

  function setMenuVisible(visible, screen) {
    menuEl.classList.toggle("is-visible", visible);
    if (visible) {
      showScreen(screen || "main");
    }
  }

  function openLobby() {
    setLobbyStatus("Не подключено");
    setLobbyCode("");
    clearJoinCode();
    setMenuVisible(true, "lobby");
  }

  function openSettings() {
    setMenuVisible(true, "settings");
  }

  function startOnlineMatch(role, scoreLimit) {
    state.mode = "online";
    state.role = role || "left";
    state.running = true;
    state.paused = false;
    state.winner = null;
    if (scoreLimit) state.scoreLimit = scoreLimit;
    net.renderState = null;
    net.targetState = null;
    net.local.y = BASE.h / 2;
    net.local.vy = 0;
    net.score.left = 0;
    net.score.right = 0;
    net.ready.left = false;
    net.ready.right = false;
    left.y = BASE.h / 2;
    right.y = BASE.h / 2;
    ball.x = BASE.w / 2;
    ball.y = BASE.h / 2;
    updateScoreForRole();
    restartBtn.disabled = false;
    restartBtn.classList.remove("btn-pulse");
    setStatus("Онлайн матч");
    setMenuVisible(false);
    updateWinnerBanner();
    audio.unlock();
  }

  function updateScoreForRole() {
    if (state.mode !== "online") {
      updateScore();
      return;
    }
    if (state.role === "right") {
      updateScore(net.score.right, net.score.left);
    } else {
      updateScore(net.score.left, net.score.right);
    }
  }

  function applyNetSnapshot(snapshot) {
    if (!snapshot) return;
    net.targetState = snapshot;
    net.lastStateAt = performance.now();
    if (snapshot.score) {
      net.score.left = snapshot.score.left;
      net.score.right = snapshot.score.right;
      updateScoreForRole();
    }
  }

  function updateNetView(dt) {
    if (!net.targetState) return;
    if (!net.renderState) {
      net.renderState = JSON.parse(JSON.stringify(net.targetState));
    }

    const target = net.targetState;
    const current = net.renderState;

    current.ball.x = lerp(current.ball.x, target.ball.x, 0.35);
    current.ball.y = lerp(current.ball.y, target.ball.y, 0.35);
    current.paddles.left.y = lerp(current.paddles.left.y, target.paddles.left.y, 0.4);
    current.paddles.right.y = lerp(current.paddles.right.y, target.paddles.right.y, 0.4);

    const flip = state.role === "right";
    const leftY = flip ? current.paddles.right.y : current.paddles.left.y;
    const rightY = flip ? current.paddles.left.y : current.paddles.right.y;
    left.y = leftY;
    right.y = rightY;
    ball.x = flip ? BASE.w - current.ball.x : current.ball.x;
    ball.y = current.ball.y;
  }

  function updateOnlineInput(dt) {
    const inputY =
      (input.keys.has("ArrowUp") ? -1 : 0) + (input.keys.has("ArrowDown") ? 1 : 0);
    const targetVy = inputY * left.speed;
    net.local.vy = approach(net.local.vy, targetVy, left.accel * dt);
    net.local.y += net.local.vy * dt;

    applyMouseControl(net.local, dt);
    net.local.y = clamp(net.local.y, left.h / 2 + 18, BASE.h - left.h / 2 - 18);

    const now = performance.now();
    if (now - net.lastSend > 33) {
      sendNet({ type: "input", y: net.local.y });
      net.lastSend = now;
    }
  }

  function sendNet(payload) {
    if (!net.socket || net.socket.readyState !== WebSocket.OPEN) return;
    net.socket.send(JSON.stringify(payload));
  }

  function connectToServer(pendingPayload) {
    const url = normalizeServerUrl();
    if (net.socket) {
      net.socket.close();
    }
    setLobbyStatus("Подключение...");
    setConnectionState(false);
    net.pendingPayload = pendingPayload || null;
    net.socket = new WebSocket(url);
    net.socket.addEventListener("open", () => {
      setConnectionState(true);
      setLobbyStatus("Подключено");
      if (net.pendingPayload) {
        sendNet(net.pendingPayload);
        net.pendingPayload = null;
      }
    });
    net.socket.addEventListener("message", (event) => {
      handleNetMessage(event.data);
    });
    net.socket.addEventListener("close", () => {
      setConnectionState(false);
      if (state.mode === "online") {
        pauseGame(true);
        setStatus("Соединение потеряно");
      }
      setLobbyStatus("Соединение закрыто");
    });
    net.socket.addEventListener("error", () => {
      setLobbyStatus("Ошибка подключения");
    });
  }

  function disconnectFromServer() {
    if (net.socket) {
      net.socket.close();
      net.socket = null;
    }
    setConnectionState(false);
    net.roomCode = "";
    net.role = null;
    net.pendingPayload = null;
    net.ready.left = false;
    net.ready.right = false;
    restartBtn.classList.remove("btn-pulse");
    setLobbyCode("");
  }

  function handleNetMessage(raw) {
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      return;
    }
    if (!data || !data.type) return;

    if (data.type === "created") {
      net.roomCode = data.code;
      setLobbyCode(data.code);
      setLobbyStatus("Ожидание соперника");
      return;
    }

    if (data.type === "joined") {
      net.roomCode = data.code;
      setLobbyCode(data.code);
      setLobbyStatus("Ожидание запуска");
      return;
    }

    if (data.type === "start") {
      net.role = data.role;
      startOnlineMatch(data.role, data.scoreLimit);
      return;
    }

    if (data.type === "state") {
      applyNetSnapshot(data.state);
      return;
    }

    if (data.type === "event") {
      const flip = state.role === "right";
      const x = flip ? BASE.w - data.x : data.x;
      const y = data.y;
      if (typeof x === "number" && typeof y === "number") {
        spawnParticles(x, y, data.tint || "cyan", data.count || 14);
      }
      if (data.name) audio.play(data.name);
      return;
    }

    if (data.type === "ready") {
      if (data.ready) {
        net.ready.left = Boolean(data.ready.left);
        net.ready.right = Boolean(data.ready.right);
        const count = (net.ready.left ? 1 : 0) + (net.ready.right ? 1 : 0);
        setStatus(`Готовы: ${count}/2`);
        if (data.from && data.from !== state.role) {
          pulseRestartButton();
          audio.play("ready");
        }
      }
      return;
    }

    if (data.type === "gameover") {
      if (state.role === "right") {
        state.winner = data.winner === "left" ? "right" : "left";
      } else {
        state.winner = data.winner;
      }
      pauseGame(true);
      return;
    }

    if (data.type === "opponent_left") {
      pauseGame(true);
      setStatus("Соперник вышел");
      return;
    }

    if (data.type === "error") {
      setLobbyStatus(data.message || "Ошибка");
    }
  }

  function update(dt) {
    state.time += dt;
    if (state.mode === "online") {
      updateNetView(dt);
      if (!state.running) return;
      if (!state.paused) {
        updateOnlineInput(dt);
        spawnTrail(ball.x, ball.y, "ball");
      }
      return;
    }

    if (!state.running || state.paused) return;

    const leftInputY =
      (input.keys.has("KeyW") ? -1 : 0) + (input.keys.has("KeyS") ? 1 : 0);
    const rightInputY =
      (input.keys.has("ArrowUp") ? -1 : 0) + (input.keys.has("ArrowDown") ? 1 : 0);

    updatePaddle(left, leftInputY, dt);
    updatePaddle(right, rightInputY, dt);

    updateBall(dt);
  }

  function renderBackground() {
    ctx.clearRect(0, 0, BASE.w, BASE.h);

    const glow = state.vfxBoost ? 1 : 0.6;
    const time = state.time;

    const grad = ctx.createLinearGradient(0, 0, BASE.w, BASE.h);
    grad.addColorStop(0, "#05060f");
    grad.addColorStop(1, "#0d172f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, BASE.w, BASE.h);

    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(77, 238, 234, 0.15)";
    ctx.lineWidth = 1;
    const spacing = 40;
    for (let x = 0; x <= BASE.w; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, BASE.h);
      ctx.stroke();
    }
    for (let y = 0; y <= BASE.h; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(BASE.w, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.6 * glow;
    ctx.shadowBlur = 30 * glow;
    ctx.shadowColor = "rgba(77, 238, 234, 0.6)";
    ctx.strokeStyle = "rgba(77, 238, 234, 0.4)";
    ctx.setLineDash([10, 18]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(BASE.w / 2, 40);
    ctx.lineTo(BASE.w / 2, BASE.h - 40);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.4 * glow;
    ctx.strokeStyle = "rgba(255, 93, 177, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(BASE.w / 2, BASE.h / 2, 160 + Math.sin(time * 0.4) * 6, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  function renderPaddle(paddle, tint) {
    const glow = state.vfxBoost ? 1 : 0.6;
    ctx.save();
    ctx.shadowBlur = 26 * glow;
    ctx.shadowColor = tint === "left" ? "rgba(77, 238, 234, 0.9)" : "rgba(255, 93, 177, 0.9)";

    const grad = ctx.createLinearGradient(paddle.x - paddle.w, paddle.y, paddle.x + paddle.w, paddle.y);
    if (tint === "left") {
      grad.addColorStop(0, "rgba(77, 238, 234, 0.4)");
      grad.addColorStop(1, "rgba(77, 238, 234, 0.9)");
    } else {
      grad.addColorStop(0, "rgba(255, 93, 177, 0.9)");
      grad.addColorStop(1, "rgba(255, 93, 177, 0.4)");
    }

    ctx.fillStyle = grad;
    drawRoundedRect(
      paddle.x - paddle.w / 2,
      paddle.y - paddle.h / 2,
      paddle.w,
      paddle.h,
      10
    );
    ctx.fill();
    ctx.restore();
  }

  function renderBall() {
    const glow = state.vfxBoost ? 1 : 0.6;
    const grad = ctx.createRadialGradient(ball.x, ball.y, 2, ball.x, ball.y, ball.r * 2.6);
    grad.addColorStop(0, "rgba(214, 255, 77, 1)");
    grad.addColorStop(1, "rgba(214, 255, 77, 0.1)");

    ctx.save();
    ctx.fillStyle = grad;
    ctx.shadowBlur = 24 * glow;
    ctx.shadowColor = "rgba(214, 255, 77, 0.9)";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function renderParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      ctx.save();
      ctx.globalAlpha = Math.max(p.life * 1.5, 0);
      ctx.fillStyle = p.tint === "pink" ? "rgba(255, 93, 177, 0.9)" : "rgba(77, 238, 234, 0.9)";
      if (p.tint === "score") {
        ctx.fillStyle = "rgba(214, 255, 77, 0.9)";
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function renderTrails(dt) {
    for (let i = trails.length - 1; i >= 0; i -= 1) {
      const t = trails[i];
      t.life -= dt;
      if (t.life <= 0) {
        trails.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = t.life * 0.8;
      ctx.strokeStyle = "rgba(214, 255, 77, 0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.size * (1 - t.life), 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  function render(dt) {
    renderBackground();
    renderTrails(dt);
    renderPaddle(left, "left");
    renderPaddle(right, "right");
    renderBall();
    renderParticles(dt);
  }

  function loop(timestamp) {
    if (!state.lastTime) state.lastTime = timestamp;
    const dt = Math.min(0.033, (timestamp - state.lastTime) / 1000) || 0.016;
    state.lastTime = timestamp;

    update(dt);
    render(dt);
    requestAnimationFrame(loop);
  }

  function handlePointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * BASE.w;
    const y = ((event.clientY - rect.top) / rect.height) * BASE.h;
    input.pointer.x = clamp(x, 0, BASE.w);
    input.pointer.y = clamp(y, 0, BASE.h);
    input.pointer.active = true;
    input.pointer.lastMove = performance.now();
  }

  window.addEventListener("resize", resize);
  window.addEventListener("blur", () => pauseGame(true));
  canvas.addEventListener("mousemove", handlePointer);
  canvas.addEventListener("pointerdown", (event) => {
    handlePointer(event);
    audio.unlock();
  });
  canvas.addEventListener("touchmove", (event) => {
    if (event.touches.length > 0) {
      handlePointer(event.touches[0]);
    }
  });

  document.addEventListener("keydown", (event) => {
    const isInput = ["INPUT", "TEXTAREA"].includes(event.target.tagName);
    if (!isInput && ["ArrowUp", "ArrowDown", "Space"].includes(event.code)) {
      event.preventDefault();
    }
    input.keys.add(event.code);

    if (event.code === "Space") {
      if (state.paused) {
        resumeGame();
      } else {
        pauseGame(true);
      }
    }

    if (event.code === "Escape") {
      if (menuEl.classList.contains("is-visible")) {
        resumeGame();
      } else {
        pauseGame(true);
      }
    }
  });

  document.addEventListener("keyup", (event) => {
    input.keys.delete(event.code);
  });

  localBtn.addEventListener("click", () => startLocalGame());
  onlineBtn.addEventListener("click", () => {
    if (state.running && !state.paused) {
      pauseGame(true);
    }
    openLobby();
  });
  settingsBtn.addEventListener("click", () => openSettings());
  lobbyBackBtn.addEventListener("click", () => showScreen("main"));
  settingsBackBtn.addEventListener("click", () => showScreen("main"));
  lobbyLeaveBtn.addEventListener("click", () => {
    disconnectFromServer();
    setLobbyStatus("Отключено");
  });

  joinCodeBoxes.forEach((box, index) => {
    box.addEventListener("input", (event) => {
      const cleaned = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      event.target.value = cleaned.slice(0, 1);
      if (cleaned && joinCodeBoxes[index + 1]) {
        joinCodeBoxes[index + 1].focus();
      }
    });
    box.addEventListener("keydown", (event) => {
      if (event.key === "Backspace" && !event.target.value && joinCodeBoxes[index - 1]) {
        joinCodeBoxes[index - 1].focus();
      }
      if (event.key === "Enter") {
        joinLobbyBtn.click();
      }
    });
    box.addEventListener("paste", (event) => {
      const text = event.clipboardData
        .getData("text")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, joinCodeBoxes.length);
      if (!text) return;
      event.preventDefault();
      joinCodeBoxes.forEach((target, idx) => {
        target.value = text[idx] || "";
      });
      const focusIndex = Math.min(text.length, joinCodeBoxes.length) - 1;
      if (joinCodeBoxes[focusIndex]) joinCodeBoxes[focusIndex].focus();
    });
  });

  createLobbyBtn.addEventListener("click", () => {
    connectToServer({ type: "create" });
  });

  joinLobbyBtn.addEventListener("click", () => {
    const code = getJoinCode().toUpperCase();
    if (code.length !== joinCodeBoxes.length) {
      setLobbyStatus("Введите код");
      return;
    }
    connectToServer({ type: "join", code });
  });

  restartBtn.addEventListener("click", () => {
    if (state.mode === "online") {
      if (!state.winner) return;
      sendNet({ type: "ready" });
    } else {
      startLocalGame();
    }
  });

  toggleMusic.addEventListener("change", (event) => {
    audio.setMusic(event.target.checked);
  });

  toggleSfx.addEventListener("change", (event) => {
    audio.setSfx(event.target.checked);
  });

  toggleVfx.addEventListener("change", (event) => {
    state.vfxBoost = event.target.checked;
  });

  function init() {
    resize();
    state.scoreLeft = 0;
    state.scoreRight = 0;
    updateScore();
    setStatus("Пауза");
    restartBtn.disabled = true;
    showScreen("main");
    updateWinnerBanner();
    requestAnimationFrame(loop);
  }

  window.__pong = {
    pause: (showMenu = true) => pauseGame(showMenu),
    resume: () => resumeGame(),
    resize: () => resize(),
    stopAudio: () => audio.stopAll(),
  };

  init();
})();
