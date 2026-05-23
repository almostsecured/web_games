(() => {
  const bootScreen = document.getElementById("boot-screen");
  const bootTitle = bootScreen?.querySelector(".boot-title");
  const bootHint = bootScreen?.querySelector(".boot-hint");
  const bootSkip = document.getElementById("boot-skip");
  const desktop = document.getElementById("desktop");
  const startBtn = document.getElementById("start-btn");
  const startMenu = document.getElementById("start-menu");
  const clockEl = document.getElementById("task-clock");
  const selectionBox = document.getElementById("selection-box");

  // XP Dialog
  const xpDialog = document.getElementById("xp-dialog");
  const dialogTitle = document.getElementById("dialog-title");
  const dialogText = document.getElementById("dialog-text");
  const dialogCloseBtn = document.getElementById("dialog-close-btn");
  const dialogOkBtn = document.getElementById("dialog-ok-btn");

  const sounds = {
    startup: document.getElementById("sound-startup"),
    shutdown: document.getElementById("sound-shutdown"),
    menu: document.getElementById("sound-menu"),
    open: document.getElementById("sound-open"),
    ding: document.getElementById("sound-ding"),
    error: document.getElementById("sound-error"),
  };

  const pendingSounds = new Set();
  const play = (name) => {
    const audio = sounds[name];
    if (!audio) return;
    audio.currentTime = 0;
    const maybe = audio.play();
    if (maybe && typeof maybe.catch === "function") {
      maybe.catch(() => {
        pendingSounds.add(name);
      });
    }
  };

  const defaultBootTitle = bootTitle?.textContent || "";
  const defaultBootHint = bootHint?.textContent || "";

  let bootCompleted = false;
  let locked = false;

  const showDesktop = (withSound = true) => {
    bootScreen?.classList.add("is-hidden");
    desktop?.classList.remove("is-hidden");
    startMenu?.classList.add("is-hidden");
    if (withSound) play("startup");
  };

  const finishInitialBoot = () => {
    if (bootCompleted && !locked) return;
    bootCompleted = true;
    locked = false;
    if (bootSkip) bootSkip.textContent = "Пропустить";
    if (bootTitle) bootTitle.textContent = defaultBootTitle;
    if (bootHint) bootHint.textContent = defaultBootHint;
    showDesktop(true);
  };

  // Automate boot after 3 seconds
  const bootTimer = setTimeout(finishInitialBoot, 3000);

  bootSkip?.addEventListener("click", () => {
    if (locked) {
      finishInitialBoot();
      return;
    }
    clearTimeout(bootTimer);
    finishInitialBoot();
  });

  const lockDesktop = () => {
    locked = true;
    if (bootTitle) bootTitle.textContent = "Система заблокирована";
    if (bootHint) bootHint.textContent = "Нажмите «Войти», чтобы продолжить";
    if (bootSkip) bootSkip.textContent = "Войти";
    bootScreen?.classList.remove("is-hidden");
    desktop?.classList.add("is-hidden");
    startMenu?.classList.add("is-hidden");
    play("shutdown");
  };

  const toggleStartMenu = () => {
    if (!startMenu) return;
    const wasHidden = startMenu.classList.contains("is-hidden");
    startMenu.classList.toggle("is-hidden");
    if (wasHidden) play("menu");
  };

  startBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleStartMenu();
  });

  document.addEventListener("click", (event) => {
    if (!startMenu || startMenu.classList.contains("is-hidden")) return;
    const target = event.target;
    if (startMenu.contains(target) || startBtn?.contains(target)) return;
    startMenu.classList.add("is-hidden");
  });

  // Handle Game Launch redirects and Dev Popup alerts
  const gameNames = {
    pong: "Neon Pong",
    slither: "Slither.io Clone",
    platformer: "Paper Platformer",
    cursors: "Cursor Sync",
    cards: "Neon Cards"
  };

  const launchGame = (gameId) => {
    startMenu?.classList.add("is-hidden");
    if (gameId === "pong") {
      play("open");
      // Wait for sound to play briefly before redirecting
      setTimeout(() => {
        window.location.href = "/games/pong/index.html";
      }, 500);
    } else {
      // Pop up XP style warning dialog!
      play("error");
      if (dialogTitle) dialogTitle.textContent = "Системное предупреждение";
      if (dialogText) dialogText.textContent = `Игра "${gameNames[gameId] || gameId}" в данный момент находится в стадии разработки. Загляните в следующих обновлениях!`;
      xpDialog?.classList.remove("is-hidden");
    }
  };

  // Close Warning Dialog
  const closeDialog = () => {
    play("ding");
    xpDialog?.classList.add("is-hidden");
  };

  dialogCloseBtn?.addEventListener("click", closeDialog);
  dialogOkBtn?.addEventListener("click", closeDialog);

  // Desktop Icons logic
  const desktopIcons = document.querySelectorAll(".desktop-icon");
  desktopIcons.forEach((icon) => {
    const gameId = icon.dataset.game;
    
    icon.addEventListener("click", (event) => {
      event.stopPropagation();
      desktopIcons.forEach((i) => i.classList.remove("is-selected"));
      icon.classList.add("is-selected");
    });

    icon.addEventListener("dblclick", () => {
      desktopIcons.forEach((i) => i.classList.remove("is-selected"));
      launchGame(gameId);
    });
  });

  // Start Menu items logic
  const startMenuItems = document.querySelectorAll(".start-menu-item");
  startMenuItems.forEach((item) => {
    const gameId = item.dataset.game;
    const action = item.dataset.action;
    
    item.addEventListener("click", () => {
      if (gameId) {
        launchGame(gameId);
      } else if (action === "lock") {
        lockDesktop();
      }
    });
  });

  // Click on desktop clear selections
  desktop?.addEventListener("click", (event) => {
    if (event.target.closest(".desktop-icon") || event.target.closest(".taskbar")) return;
    desktopIcons.forEach((i) => i.classList.remove("is-selected"));
  });

  // Ticking task clock
  const tickClock = () => {
    if (!clockEl) return;
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    clockEl.textContent = `${hh}:${mm}`;
  };
  tickClock();
  setInterval(tickClock, 10000);

  // Browser autoplay unlocking
  const unlockAudio = () => {
    Object.values(sounds).forEach((a) => {
      if (!a) return;
      a.muted = false;
      a.play().catch(() => {});
      a.pause();
      a.currentTime = 0;
    });
    pendingSounds.forEach((name) => play(name));
    pendingSounds.clear();
    document.removeEventListener("pointerdown", unlockAudio);
  };
  document.addEventListener("pointerdown", unlockAudio);
})();
