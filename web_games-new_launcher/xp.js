(() => {
  const bootScreen = document.getElementById("boot-screen");
  const bootTitle = bootScreen?.querySelector(".boot-title");
  const bootHint = bootScreen?.querySelector(".boot-hint");
  const bootSkip = document.getElementById("boot-skip");
  const desktop = document.getElementById("desktop");
  const startBtn = document.getElementById("start-btn");
  const startMenu = document.getElementById("start-menu");
  const iconPong = document.getElementById("icon-pong");
  const startMenuItems = document.querySelectorAll(".start-menu-item[data-app='pong']");
  const lockItem = document.querySelector(".start-menu-item[data-action='lock']");
  const windowPong = document.getElementById("xp-window-pong");
  const titlebar = windowPong?.querySelector(".xp-titlebar");
  const minimizeBtn = windowPong?.querySelector("[data-action='minimize']");
  const closeBtn = windowPong?.querySelector("[data-action='close']");
  const fullscreenBtn = windowPong?.querySelector("[data-action='fullscreen']");
  const taskButton = document.getElementById("task-pong");
  const clockEl = document.getElementById("task-clock");
  const selectionBox = document.getElementById("selection-box");

  const sounds = {
    startup: document.getElementById("sound-startup"),
    shutdown: document.getElementById("sound-shutdown"),
    menu: document.getElementById("sound-menu"),
    open: document.getElementById("sound-open"),
  };

  const pendingSounds = new Set();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
    bootSkip.textContent = "Пропустить";
    bootTitle.textContent = defaultBootTitle;
    bootHint.textContent = defaultBootHint;
    showDesktop(true);
  };

  const bootTimer = setTimeout(finishInitialBoot, 5000);

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
    bootTitle.textContent = "Система заблокирована";
    bootHint.textContent = "Нажмите «Войти», чтобы разблокировать";
    bootSkip.textContent = "Войти";
    bootScreen?.classList.remove("is-hidden");
    desktop?.classList.add("is-hidden");
    startMenu?.classList.add("is-hidden");
    windowPong?.classList.add("is-hidden");
    taskButton?.classList.add("is-hidden");
    taskButton?.classList.remove("is-active");
    window.__pong?.pause?.(true);
    window.__pong?.stopAudio?.();
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

  const centerWindow = () => {
    if (!windowPong) return;
    const rect = windowPong.getBoundingClientRect();
    const left = (window.innerWidth - rect.width) / 2;
    const top = Math.max(12, (window.innerHeight - rect.height) / 2);
    windowPong.style.left = `${left}px`;
    windowPong.style.top = `${top}px`;
    windowPong.style.transform = "none";
  };

  const openPong = () => {
    finishInitialBoot();
    startMenu?.classList.add("is-hidden");
    windowPong?.classList.remove("is-hidden", "is-minimized");
    taskButton?.classList.remove("is-hidden");
    taskButton?.classList.add("is-active");
    document.body.classList.add("game-open");
    if (windowPong && !windowPong.dataset.placed) {
      centerWindow();
      windowPong.dataset.placed = "1";
    }
    window.__pong?.resize?.();
  };

  const minimizePong = () => {
    windowPong?.classList.add("is-minimized");
    taskButton?.classList.remove("is-active");
    window.__pong?.pause?.(true);
  };

  const closePong = () => {
    windowPong?.classList.add("is-hidden");
    document.body.classList.remove("game-open");
    taskButton?.classList.add("is-hidden");
    taskButton?.classList.remove("is-active");
    window.__pong?.pause?.(true);
    window.__pong?.stopAudio?.();
  };

  const toggleFullscreen = () => {
    if (!windowPong) return;
    const willFull = !windowPong.classList.contains("is-fullscreen");
    if (willFull) {
      windowPong.dataset.prevLeft = windowPong.style.left;
      windowPong.dataset.prevTop = windowPong.style.top;
      windowPong.classList.add("is-fullscreen");
    } else {
      windowPong.classList.remove("is-fullscreen");
      windowPong.style.left = windowPong.dataset.prevLeft || windowPong.style.left;
      windowPong.style.top = windowPong.dataset.prevTop || windowPong.style.top;
      if (!windowPong.style.left) centerWindow();
    }
    window.__pong?.resize?.();
  };

  let iconSelected = false;
  const selectIcon = (isSelected) => {
    iconSelected = isSelected;
    if (!iconPong) return;
    iconPong.classList.toggle("is-selected", isSelected);
  };

  iconPong?.addEventListener("click", () => {
    selectIcon(true);
  });

  iconPong?.addEventListener("dblclick", () => {
    selectIcon(true);
    play("open");
    openPong();
  });

  iconPong?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && iconSelected) {
      play("open");
      openPong();
    }
  });

  startMenuItems.forEach((item) => {
    item.addEventListener("click", () => {
      play("open");
      openPong();
    });
  });

  lockItem?.addEventListener("click", () => {
    startMenu?.classList.add("is-hidden");
    lockDesktop();
  });

  minimizeBtn?.addEventListener("click", minimizePong);
  closeBtn?.addEventListener("click", closePong);
  fullscreenBtn?.addEventListener("click", toggleFullscreen);

  taskButton?.addEventListener("click", () => {
    const isHidden = windowPong?.classList.contains("is-hidden");
    const isMinimized = windowPong?.classList.contains("is-minimized");
    if (isHidden || isMinimized) {
      windowPong?.classList.remove("is-hidden", "is-minimized");
      taskButton.classList.add("is-active");
      document.body.classList.add("game-open");
      window.__pong?.resize?.();
      return;
    }
    minimizePong();
  });

  // Drag window
  let dragging = false;
  let dragOffset = { x: 0, y: 0 };
  titlebar?.addEventListener("mousedown", (event) => {
    if (event.target.closest(".xp-window-actions")) return;
    if (windowPong?.classList.contains("is-fullscreen")) return;
    dragging = true;
    const rect = windowPong.getBoundingClientRect();
    dragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    windowPong.style.transform = "none";
  });

  window.addEventListener("mousemove", (event) => {
    if (!dragging || !windowPong) return;
    const left = clamp(event.clientX - dragOffset.x, 0, window.innerWidth - windowPong.offsetWidth);
    const top = clamp(event.clientY - dragOffset.y, 0, window.innerHeight - windowPong.offsetHeight);
    windowPong.style.left = `${left}px`;
    windowPong.style.top = `${top}px`;
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
  });

  // Selection rectangle
  let selectionActive = false;
  let selectionStart = { x: 0, y: 0 };

  const startSelection = (event) => {
    if (!selectionBox) return;
    if (event.button !== 0) return;
    if (
      event.target.closest(".taskbar") ||
      event.target.closest(".desktop-icon") ||
      event.target.closest(".xp-window") ||
      event.target.closest("#start-menu")
    )
      return;
    selectIcon(false);
    selectionActive = true;
    selectionStart = { x: event.clientX, y: event.clientY };
    updateSelection(event.clientX, event.clientY);
    selectionBox.style.display = "block";
  };

  const updateSelection = (x, y) => {
    if (!selectionBox) return;
    const left = Math.min(selectionStart.x, x);
    const top = Math.min(selectionStart.y, y);
    const width = Math.abs(x - selectionStart.x);
    const height = Math.abs(y - selectionStart.y);
    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
  };

  const endSelection = () => {
    if (!selectionBox) return;
    if (!selectionActive) return;
    selectionActive = false;
    selectionBox.style.display = "none";
  };

  desktop?.addEventListener("mousedown", startSelection);
  window.addEventListener("mousemove", (event) => {
    if (!selectionActive) return;
    updateSelection(event.clientX, event.clientY);
  });
  window.addEventListener("mouseup", endSelection);
  window.addEventListener("blur", endSelection);
  desktop?.addEventListener("click", (event) => {
    if (event.target.closest(".desktop-icon")) return;
    selectIcon(false);
  });

  const tickClock = () => {
    if (!clockEl) return;
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, "0");
    const mm = now.getMinutes().toString().padStart(2, "0");
    clockEl.textContent = `${hh}:${mm}`;
  };
  tickClock();
  setInterval(tickClock, 30000);

  // Allow boot to finish on first interaction if autoplay is blocked
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
