const express = require("express");
const http = require("http");
const path = require("path");
const socketIo = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

// Serve all static assets inside the client folder
app.use(express.static(path.join(ROOT, "client")));

const BASE = { w: 1280, h: 720 };
const PADDLE = { w: 18, h: 130 };
const BALL = { r: 10, speed: 520, maxSpeed: 980 };

const rooms = new Map();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function makeState() {
  return {
    paddles: {
      left: { y: BASE.h / 2, vy: 0 },
      right: { y: BASE.h / 2, vy: 0 },
    },
    ball: { x: BASE.w / 2, y: BASE.h / 2, vx: 0, vy: 0 },
    score: { left: 0, right: 0 },
    serveTimer: 1.1,
    serveDirection: Math.random() > 0.5 ? 1 : -1,
    winner: null,
  };
}

function resetBall(state, direction) {
  const angle = rand(-0.4, 0.4);
  const speed = BALL.speed;
  state.ball.x = BASE.w / 2;
  state.ball.y = BASE.h / 2;
  state.ball.vx = Math.cos(angle) * speed * direction;
  state.ball.vy = Math.sin(angle) * speed;
}

function startServe(state, direction) {
  state.serveTimer = 1.1;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.x = BASE.w / 2;
  state.ball.y = BASE.h / 2;
  state.serveDirection = direction;
}

function checkPaddleCollision(state, paddle, direction) {
  const halfW = PADDLE.w / 2;
  const halfH = PADDLE.h / 2;
  const ball = state.ball;

  const paddleX = direction > 0 ? 88 : BASE.w - 88;
  if (
    ball.x + BALL.r < paddleX - halfW ||
    ball.x - BALL.r > paddleX + halfW ||
    ball.y + BALL.r < paddle.y - halfH ||
    ball.y - BALL.r > paddle.y + halfH
  ) {
    return false;
  }

  const offset = clamp((ball.y - paddle.y) / halfH, -1, 1);
  const angle = offset * (Math.PI / 3);
  const speed = Math.min(BALL.maxSpeed, Math.hypot(ball.vx, ball.vy) + 35);

  ball.vx = Math.cos(angle) * speed * direction;
  ball.vy = Math.sin(angle) * speed + paddle.vy * 0.35;
  ball.x = paddleX + (halfW + BALL.r + 2) * direction;
  return true;
}

class Client {
  constructor(socket) {
    this.socket = socket;
    this.room = null;
    this.role = null;
  }

  send(data) {
    if (!this.socket.connected) return;
    this.socket.send(JSON.stringify(data));
  }

  handleMessage(raw) {
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      return;
    }

    if (!data || !data.type) return;

    if ((data.type === "create" || data.type === "join") && this.room) {
      this.room.removeClient(this);
    }

    if (data.type === "create") {
      const room = createRoom(this, data.scoreLimit || 5);
      this.send({ type: "created", code: room.code });
      return;
    }

    if (data.type === "join") {
      const code = (data.code || "").toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        this.send({ type: "error", message: "Комната не найдена" });
        return;
      }
      if (room.clients.right) {
        this.send({ type: "error", message: "Комната заполнена" });
        return;
      }
      room.addClient(this, "right");
      this.send({ type: "joined", code });
      if (room.clients.left) {
        room.clients.left.send({ type: "joined", code });
      }
      room.startGame();
      return;
    }

    if (data.type === "input" && this.room) {
      const y = Number(data.y);
      if (Number.isFinite(y)) {
        this.room.inputs[this.role] = clamp(y, PADDLE.h / 2 + 18, BASE.h - PADDLE.h / 2 - 18);
      }
      return;
    }

    if (data.type === "ready" && this.room) {
      if (!this.room.state.winner) return;
      this.room.ready[this.role] = true;
      this.room.broadcast({
        type: "ready",
        ready: this.room.ready,
        from: this.role,
      });
      if (this.room.ready.left && this.room.ready.right) {
        this.room.startGame();
      }
      return;
    }
  }

  close() {
    if (this.room) {
      this.room.removeClient(this);
    }
  }
}

class Room {
  constructor(code, scoreLimit = 5) {
    this.code = code;
    this.scoreLimit = scoreLimit;
    this.clients = { left: null, right: null };
    this.inputs = { left: BASE.h / 2, right: BASE.h / 2 };
    this.state = makeState();
    this.ready = { left: false, right: false };
    this.interval = null;
    this.lastTick = Date.now();
  }

  addClient(client, role) {
    this.clients[role] = client;
    client.room = this;
    client.role = role;
  }

  removeClient(client) {
    const role = client.role;
    if (role && this.clients[role] === client) {
      this.clients[role] = null;
    }
    client.room = null;
    client.role = null;
    if (this.clients.left || this.clients.right) {
      this.broadcast({ type: "opponent_left" });
    }
    this.stop();
    if (!this.clients.left && !this.clients.right) {
      rooms.delete(this.code);
    }
  }

  broadcast(payload) {
    if (this.clients.left) this.clients.left.send(payload);
    if (this.clients.right) this.clients.right.send(payload);
  }

  startGame() {
    if (!this.clients.left || !this.clients.right) return;
    this.state = makeState();
    this.inputs.left = BASE.h / 2;
    this.inputs.right = BASE.h / 2;
    this.ready.left = false;
    this.ready.right = false;
    if (this.clients.left) {
      this.clients.left.send({ type: "start", role: "left", scoreLimit: this.scoreLimit, code: this.code });
    }
    if (this.clients.right) {
      this.clients.right.send({ type: "start", role: "right", scoreLimit: this.scoreLimit, code: this.code });
    }
    this.lastTick = Date.now();
    if (!this.interval) {
      this.interval = setInterval(() => this.tick(), 1000 / 60);
    }
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.033, (now - this.lastTick) / 1000) || 0.016;
    this.lastTick = now;

    const state = this.state;
    if (state.winner) return;

    const left = state.paddles.left;
    const right = state.paddles.right;

    const leftPrev = left.y;
    const rightPrev = right.y;
    left.y = lerp(left.y, this.inputs.left, 0.45);
    right.y = lerp(right.y, this.inputs.right, 0.45);
    left.y = clamp(left.y, PADDLE.h / 2 + 18, BASE.h - PADDLE.h / 2 - 18);
    right.y = clamp(right.y, PADDLE.h / 2 + 18, BASE.h - PADDLE.h / 2 - 18);
    left.vy = (left.y - leftPrev) / dt;
    right.vy = (right.y - rightPrev) / dt;

    if (state.serveTimer > 0) {
      state.serveTimer -= dt;
      if (state.serveTimer <= 0) {
        resetBall(state, state.serveDirection);
      }
    } else {
      state.ball.x += state.ball.vx * dt;
      state.ball.y += state.ball.vy * dt;

      if (state.ball.y - BALL.r <= 0) {
        state.ball.y = BALL.r;
        state.ball.vy = Math.abs(state.ball.vy);
        this.broadcast({ type: "event", name: "wall", x: state.ball.x, y: state.ball.y, tint: "cyan" });
      } else if (state.ball.y + BALL.r >= BASE.h) {
        state.ball.y = BASE.h - BALL.r;
        state.ball.vy = -Math.abs(state.ball.vy);
        this.broadcast({ type: "event", name: "wall", x: state.ball.x, y: state.ball.y, tint: "pink" });
      }

      if (state.ball.vx < 0) {
        if (checkPaddleCollision(state, left, 1)) {
          this.broadcast({ type: "event", name: "hit", x: state.ball.x, y: state.ball.y, tint: "cyan" });
        }
      } else {
        if (checkPaddleCollision(state, right, -1)) {
          this.broadcast({ type: "event", name: "hit", x: state.ball.x, y: state.ball.y, tint: "pink" });
        }
      }

      if (state.ball.x < -60) {
        state.score.right += 1;
        this.broadcast({ type: "event", name: "score", x: BASE.w / 2, y: BASE.h / 2, tint: "score" });
        if (state.score.right >= this.scoreLimit) {
          state.winner = "right";
          this.broadcast({ type: "gameover", winner: "right" });
          this.stop();
        } else {
          startServe(state, -1);
        }
      } else if (state.ball.x > BASE.w + 60) {
        state.score.left += 1;
        this.broadcast({ type: "event", name: "score", x: BASE.w / 2, y: BASE.h / 2, tint: "score" });
        if (state.score.left >= this.scoreLimit) {
          state.winner = "left";
          this.broadcast({ type: "gameover", winner: "left" });
          this.stop();
        } else {
          startServe(state, 1);
        }
      }
    }

    this.broadcast({
      type: "state",
      state: {
        ball: state.ball,
        paddles: state.paddles,
        score: state.score,
        serveTimer: state.serveTimer,
      },
    });
  }
}

function createRoom(client, scoreLimit) {
  let code = generateCode();
  while (rooms.has(code)) {
    code = generateCode();
  }
  const room = new Room(code, scoreLimit);
  rooms.set(code, room);
  room.addClient(client, "left");
  return room;
}

// Socket.io Connection Handler
io.on("connection", (socket) => {
  const client = new Client(socket);
  
  socket.on("message", (data) => {
    client.handleMessage(data);
  });
  
  socket.on("disconnect", () => {
    client.close();
  });
  
  socket.on("error", () => {
    client.close();
  });
});

server.listen(PORT, () => {
  console.log(`Express + Socket.io Games Server running on http://localhost:${PORT}`);
});
