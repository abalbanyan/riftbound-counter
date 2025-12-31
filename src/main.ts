const ANCHOR_CONFIGS = {
  "top-left": { x: 0, y: 0, width: 0.5, height: 0.5, rotation: "rotate-180" },
  "top-right": { x: 0.5, y: 0, width: 0.5, height: 0.5, rotation: "rotate-180" },
  "bottom-left": { x: 0, y: 0.5, width: 0.5, height: 0.5, rotation: "" },
  "bottom-right": { x: 0.5, y: 0.5, width: 0.5, height: 0.5, rotation: "" },
  left: { x: 0, y: 0, width: 0.5, height: 1, rotation: "rotate-90" },
  right: { x: 0.5, y: 0, width: 0.5, height: 1, rotation: "rotate-270" },
  top: { x: 0, y: 0, width: 1, height: 0.5, rotation: "rotate-180" },
  bottom: { x: 0, y: 0.5, width: 1, height: 0.5, rotation: "" },
} as const;

type AnchorName = keyof typeof ANCHOR_CONFIGS;

interface Legend {
  name: string;
  photoUrl: string;
  rarity: string;
  tags: string[];
  setName: string;
}

class RiftboundCounter {
  playerCount: number;
  scores: Record<number, number>;
  names: Record<number, string>;
  legends: Record<number, string>;
  slotAssignments: Record<number, AnchorName>;
  draggedElement: HTMLElement | null;
  draggedPlayerId: number | null;
  gameAreaRect: DOMRect | null;
  dragStartPos:
    | { offsetX: number; offsetY: number; initialLeft: number; initialTop: number }
    | null;
  legendsCache: Legend[] | null;
  currentLegendPlayerIndex: number | null;

  constructor() {
    this.playerCount = parseInt(localStorage.getItem("playerCount") ?? "", 10) || 2;
    this.scores = JSON.parse(localStorage.getItem("scores") ?? "null") || {};
    this.names = JSON.parse(localStorage.getItem("names") ?? "null") || {};
    this.legends = JSON.parse(localStorage.getItem("legends") ?? "null") || {};
    this.slotAssignments = JSON.parse(localStorage.getItem("slotAssignments") ?? "null") || {};
    this.draggedElement = null;
    this.draggedPlayerId = null;
    this.gameAreaRect = null;
    this.dragStartPos = null;
    this.legendsCache = null;
    this.currentLegendPlayerIndex = null;

    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updatePlayerButtons();
    this.updateGameAreaRect();
    this.ensureSlotAssignments();
    this.renderCounters();

    window.addEventListener("resize", () => {
      this.updateGameAreaRect();
      this.positionAllCounters();
    });

    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        this.updateGameAreaRect();
        this.positionAllCounters();
      }, 100);
    });
  }

  setupEventListeners() {
    document.querySelectorAll<HTMLButtonElement>(".player-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.currentTarget;
        const newCount = parseInt(target.dataset.players ?? "", 10);
        if (newCount !== this.playerCount) {
          this.playerCount = newCount;
          localStorage.setItem("playerCount", String(this.playerCount));
          this.updatePlayerButtons();
          this.reassignAllPlayers();
          this.renderCounters();
        }
      });
    });

    document.getElementById("randomBtn")?.addEventListener("click", () => this.pickRandomPlayer());

    document.getElementById("resetBtn")?.addEventListener("click", () => {
      document.getElementById("resetModal")?.classList.add("active");
    });

    document.getElementById("resetScoresBtn")?.addEventListener("click", () => {
      this.resetScores();
      document.getElementById("resetModal")?.classList.remove("active");
    });

    document.getElementById("resetAllBtn")?.addEventListener("click", () => {
      this.resetAll();
      document.getElementById("resetModal")?.classList.remove("active");
    });

    document.getElementById("cancelResetBtn")?.addEventListener("click", () => {
      document.getElementById("resetModal")?.classList.remove("active");
    });

    document.getElementById("closeRandomBtn")?.addEventListener("click", () => {
      document.getElementById("randomModal")?.classList.remove("active");
    });

    document.getElementById("closeLegendBtn")?.addEventListener("click", () => {
      document.getElementById("legendModal")?.classList.remove("active");
    });

    // Close modals when clicking outside
    document.querySelectorAll<HTMLElement>(".modal").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.classList.remove("active");
        }
      });
    });
  }

  updatePlayerButtons() {
    document.querySelectorAll<HTMLButtonElement>(".player-btn").forEach((btn) => {
      btn.classList.toggle("active", parseInt(btn.dataset.players ?? "", 10) === this.playerCount);
    });
  }

  updateGameAreaRect() {
    const gameArea = document.getElementById("gameArea");
    if (!gameArea) return;
    this.gameAreaRect = gameArea.getBoundingClientRect();
  }

  reassignAllPlayers() {
    this.slotAssignments = {};
    this.ensureSlotAssignments();
  }

  ensureSlotAssignments() {
    for (let i = this.playerCount; i < 4; i++) {
      delete this.slotAssignments[i];
    }

    const defaultAssignments: AnchorName[] =
      this.playerCount === 2
        ? ["top", "bottom"]
        : this.playerCount === 3
          ? ["top-left", "top-right", "bottom-left"]
          : ["top-left", "top-right", "bottom-left", "bottom-right"];

    const usedSlots = new Set(Object.values(this.slotAssignments));

    for (let playerId = 0; playerId < this.playerCount; playerId++) {
      if (this.slotAssignments[playerId] === undefined) {
        for (const slot of defaultAssignments) {
          if (!usedSlots.has(slot)) {
            this.slotAssignments[playerId] = slot;
            usedSlots.add(slot);
            break;
          }
        }
      }
    }

    localStorage.setItem("slotAssignments", JSON.stringify(this.slotAssignments));
  }

  getAvailableAnchors() {
    const occupied: Record<string, number> = {};

    for (const [playerIdStr, slot] of Object.entries(this.slotAssignments)) {
      if (parseInt(playerIdStr, 10) !== this.draggedPlayerId) {
        occupied[slot] = parseInt(playerIdStr, 10);
      }
    }

    const available = new Set<AnchorName>(Object.keys(ANCHOR_CONFIGS) as AnchorName[]);

    if (occupied["left"] !== undefined || occupied["top-left"] !== undefined || occupied["bottom-left"] !== undefined) {
      available.delete("left");
    }
    if (occupied["right"] !== undefined || occupied["top-right"] !== undefined || occupied["bottom-right"] !== undefined) {
      available.delete("right");
    }
    if (occupied["top"] !== undefined || occupied["top-left"] !== undefined || occupied["top-right"] !== undefined) {
      available.delete("top");
    }
    if (occupied["bottom"] !== undefined || occupied["bottom-left"] !== undefined || occupied["bottom-right"] !== undefined) {
      available.delete("bottom");
    }

    if (occupied["top-left"] !== undefined || occupied["bottom-left"] !== undefined) {
      available.delete("left");
    }
    if (occupied["top-right"] !== undefined || occupied["bottom-right"] !== undefined) {
      available.delete("right");
    }
    if (occupied["top-left"] !== undefined || occupied["top-right"] !== undefined) {
      available.delete("top");
    }
    if (occupied["bottom-left"] !== undefined || occupied["bottom-right"] !== undefined) {
      available.delete("bottom");
    }

    Object.keys(occupied).forEach((slot) => available.delete(slot as AnchorName));

    return { available, occupied };
  }

  renderCounters() {
    const gameArea = document.getElementById("gameArea");
    if (!gameArea) return;

    gameArea.querySelectorAll(".score-counter").forEach((c) => c.remove());

    for (let i = 0; i < this.playerCount; i++) {
      const counter = this.createCounter(i);
      gameArea.appendChild(counter);
    }

    this.positionAllCounters();
  }

  createCounter(playerIndex: number) {
    const counter = document.createElement("div");
    counter.className = "score-counter";
    counter.dataset.player = String(playerIndex);

    const name = this.names[playerIndex] || `Player ${playerIndex + 1}`;
    const score = this.scores[playerIndex] || 0;

    const hasLegend = !!this.legends[playerIndex];

    counter.innerHTML = `
      <button class="counter-btn minus">-</button>
      <div class="score-center${hasLegend ? " has-legend" : ""}">
        <div class="score-info">
          <input type="text" class="player-name" value="${escapeHtml(name)}" maxlength="20" data-player="${playerIndex}">
          <div class="score-display">${score}</div>
        </div>
        <button class="legend-btn" data-player="${playerIndex}" title="Choose legend">+</button>
      </div>
      <button class="counter-btn plus">+</button>
    `;

    // Apply legend background if one exists
    if (hasLegend) {
      const center = counter.querySelector<HTMLElement>(".score-center")!;
      center.style.background = `
        linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)),
        url("${this.legends[playerIndex]}") center top / cover no-repeat`;
    }

    const nameInput = counter.querySelector<HTMLInputElement>(".player-name")!;
    nameInput.addEventListener("mousedown", (e) => e.stopPropagation());
    nameInput.addEventListener("touchstart", (e) => e.stopPropagation());
    nameInput.addEventListener("change", (e) => this.updateName(playerIndex, (e.target as HTMLInputElement).value));
    nameInput.addEventListener("blur", (e) => this.updateName(playerIndex, (e.target as HTMLInputElement).value));

    const center = counter.querySelector<HTMLElement>(".score-center")!;

    center.addEventListener("mousedown", (e) => {
      if ((e.target as HTMLElement).classList.contains("player-name")) return;
      if ((e.target as HTMLElement).classList.contains("legend-btn")) return;
      this.startDrag(e as MouseEvent, counter, playerIndex);
    });
    center.addEventListener(
      "touchstart",
      (e) => {
        if ((e.target as HTMLElement).classList.contains("player-name")) return;
        if ((e.target as HTMLElement).classList.contains("legend-btn")) return;
        this.startDrag(e as TouchEvent, counter, playerIndex);
      },
      { passive: false }
    );

    const legendBtn = counter.querySelector<HTMLButtonElement>(".legend-btn")!;
    legendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.openLegendModal(playerIndex);
    });
    legendBtn.addEventListener("mousedown", (e) => e.stopPropagation());
    legendBtn.addEventListener("touchstart", (e) => e.stopPropagation());

    counter.querySelector<HTMLButtonElement>(".minus")!.addEventListener("click", (e) => {
      e.stopPropagation();
      this.changeScore(playerIndex, -1);
    });

    counter.querySelector<HTMLButtonElement>(".plus")!.addEventListener("click", (e) => {
      e.stopPropagation();
      this.changeScore(playerIndex, 1);
    });

    return counter;
  }

  async openLegendModal(playerIndex: number) {
    this.currentLegendPlayerIndex = playerIndex;

    if (!this.legendsCache) {
      const legendGrid = document.getElementById("legendGrid");
      if (legendGrid) {
        legendGrid.innerHTML = '<div class="modal-text">Loading legends...</div>';
      }
      document.getElementById("legendModal")?.classList.add("active");

      try {
        const response = await fetch("./legends.json");
        this.legendsCache = await response.json();
      } catch (error) {
        console.error("Failed to load legends:", error);
        const legendGrid = document.getElementById("legendGrid");
        if (legendGrid) {
          legendGrid.innerHTML = '<div class="modal-text">Failed to load legends</div>';
        }
        return;
      }
    } else {
      document.getElementById("legendModal")?.classList.add("active");
    }

    this.renderLegendGrid();
  }

  renderLegendGrid() {
    const legendGrid = document.getElementById("legendGrid");
    if (!legendGrid || !this.legendsCache) return;

    const setNameMap: Record<string, string> = {
      SFD: "Spiritforged",
    };

    // Load collapsed states from localStorage
    const collapsedSets: Record<string, boolean> = JSON.parse(localStorage.getItem("collapsedSets") ?? "{}");

    // Filter out Showcase rarity and dedupe by photoUrl
    const seenUrls = new Set<string>();
    const filteredLegends = this.legendsCache.filter((legend) => {
      if (legend.rarity === "Showcase") return false;
      if (seenUrls.has(legend.photoUrl)) return false;
      seenUrls.add(legend.photoUrl);
      return true;
    });

    // Group legends by setName
    const groupedLegends: Record<string, Legend[]> = {};
    for (const legend of filteredLegends) {
      if (!groupedLegends[legend.setName]) {
        groupedLegends[legend.setName] = [];
      }
      groupedLegends[legend.setName].push(legend);
    }

    legendGrid.innerHTML = "";

    // Reverse the order of sets
    const setEntries = Object.entries(groupedLegends).reverse();

    for (const [setName, legends] of setEntries) {
      const group = document.createElement("div");
      group.className = "legend-set-group";

      // Restore collapsed state
      if (collapsedSets[setName]) {
        group.classList.add("collapsed");
      }

      const title = document.createElement("div");
      title.className = "legend-set-title";
      title.textContent = setNameMap[setName] || setName;
      group.appendChild(title);

      const cards = document.createElement("div");
      cards.className = "legend-set-cards";

      for (const legend of legends) {
        const card = document.createElement("div");
        card.className = "legend-card";
        card.innerHTML = `<img src="${legend.photoUrl}" alt="${escapeHtml(legend.name)}" loading="lazy">`;
        card.addEventListener("click", () => this.selectLegend(legend.photoUrl));
        cards.appendChild(card);
      }

      group.appendChild(cards);
      legendGrid.appendChild(group);

      // Click title to toggle collapse and save state
      title.addEventListener("click", () => {
        group.classList.toggle("collapsed");
        const isCollapsed = group.classList.contains("collapsed");
        const currentCollapsed: Record<string, boolean> = JSON.parse(localStorage.getItem("collapsedSets") ?? "{}");
        if (isCollapsed) {
          currentCollapsed[setName] = true;
        } else {
          delete currentCollapsed[setName];
        }
        localStorage.setItem("collapsedSets", JSON.stringify(currentCollapsed));
      });
    }
  }

  selectLegend(photoUrl: string) {
    if (this.currentLegendPlayerIndex === null) return;

    this.legends[this.currentLegendPlayerIndex] = photoUrl;
    localStorage.setItem("legends", JSON.stringify(this.legends));

    // Update the background of the score-center
    const counter = document.querySelector<HTMLElement>(`.score-counter[data-player="${this.currentLegendPlayerIndex}"]`);
    if (counter) {
      const center = counter.querySelector<HTMLElement>(".score-center");
      if (center) {
        center.classList.add("has-legend");
        center.style.background = `
          linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6)),
          url("${photoUrl}") center top / cover no-repeat`;
      }
    }

    document.getElementById("legendModal")?.classList.remove("active");
    this.currentLegendPlayerIndex = null;
  }

  startDrag(e: MouseEvent | TouchEvent, counter: HTMLElement, playerIndex: number) {
    e.preventDefault();
    e.stopPropagation();

    this.draggedElement = counter;
    this.draggedPlayerId = playerIndex;
    this.updateGameAreaRect();
    if (!this.gameAreaRect) return;

    const rect = counter.getBoundingClientRect();
    const clientX = isTouch(e) ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch(e) ? e.touches[0].clientY : e.clientY;

    this.dragStartPos = {
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      initialLeft: rect.left - this.gameAreaRect.left,
      initialTop: rect.top - this.gameAreaRect.top,
    };

    counter.classList.add("dragging");

    // Show all valid anchors (available + swappable occupied ones)
    const { available, occupied } = this.getAvailableAnchors();
    const validAnchors = this.getValidDropTargets(available, occupied);
    document.querySelectorAll<HTMLElement>(".anchor-point").forEach((anchor) => {
      const anchorName = anchor.dataset.anchor as AnchorName;
      if (validAnchors.has(anchorName) || anchorName === this.slotAssignments[playerIndex]) {
        anchor.classList.add("active");
      }
    });

    const moveHandler = (ev: MouseEvent | TouchEvent) => this.onDrag(ev);
    const endHandler = (ev: MouseEvent | TouchEvent) => this.endDrag(ev, moveHandler, endHandler);

    document.addEventListener("mousemove", moveHandler);
    document.addEventListener("touchmove", moveHandler, { passive: false });
    document.addEventListener("mouseup", endHandler);
    document.addEventListener("touchend", endHandler);
  }

  // Get all valid drop targets: available anchors + occupied anchors that can be swapped
  getValidDropTargets(available: Set<AnchorName>, occupied: Record<string, number>): Set<AnchorName> {
    const valid = new Set(available);
    // Add occupied anchors (for swapping)
    for (const slot of Object.keys(occupied)) {
      valid.add(slot as AnchorName);
    }
    return valid;
  }

  onDrag(e: MouseEvent | TouchEvent) {
    if (!this.draggedElement || !this.gameAreaRect || !this.dragStartPos) return;
    e.preventDefault();

    const clientX = isTouch(e) ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch(e) ? e.touches[0].clientY : e.clientY;

    const x = clientX - this.gameAreaRect.left - this.dragStartPos.offsetX;
    const y = clientY - this.gameAreaRect.top - this.dragStartPos.offsetY;

    this.draggedElement.style.left = `${x}px`;
    this.draggedElement.style.top = `${y}px`;

    this.highlightNearestAnchor(clientX, clientY);
  }

  highlightNearestAnchor(clientX: number, clientY: number) {
    if (!this.gameAreaRect || this.draggedPlayerId === null) return;

    const relX = (clientX - this.gameAreaRect.left) / this.gameAreaRect.width;
    const relY = (clientY - this.gameAreaRect.top) / this.gameAreaRect.height;

    const { available, occupied } = this.getAvailableAnchors();
    const validAnchors = this.getValidDropTargets(available, occupied);
    validAnchors.add(this.slotAssignments[this.draggedPlayerId]);

    let closestAnchor: AnchorName | null = null;
    let minDistance = Infinity;

    for (const anchorName of validAnchors) {
      const config = ANCHOR_CONFIGS[anchorName];
      let centerX = config.x + config.width / 2;
      let centerY = config.y + config.height / 2;

      if (anchorName === "left") centerX = config.x + config.width * 0.15;
      else if (anchorName === "right") centerX = config.x + config.width * 0.85;
      else if (anchorName === "top") centerY = config.y + config.height * 0.15;
      else if (anchorName === "bottom") centerY = config.y + config.height * 0.85;

      const distance = Math.hypot(centerX - relX, centerY - relY);

      if (distance < minDistance) {
        minDistance = distance;
        closestAnchor = anchorName;
      }
    }

    document.querySelectorAll<HTMLElement>(".anchor-point").forEach((anchor) => {
      const anchorName = anchor.dataset.anchor as AnchorName;
      anchor.classList.remove("highlight");

      if (anchorName === closestAnchor && validAnchors.has(anchorName)) {
        anchor.classList.add("highlight");
        this.updateAnchorPreview(anchor, ANCHOR_CONFIGS[anchorName]);
      }
    });
  }

  updateAnchorPreview(anchor: HTMLElement, config: (typeof ANCHOR_CONFIGS)[AnchorName]) {
    if (!this.gameAreaRect) return;

    const padding = 15;
    const width = this.gameAreaRect.width * config.width - padding * 2;
    const height = this.gameAreaRect.height * config.height - padding * 2;
    const x = this.gameAreaRect.width * config.x + padding;
    const y = this.gameAreaRect.height * config.y + padding;

    anchor.style.left = `${x}px`;
    anchor.style.top = `${y}px`;
    anchor.style.width = `${width}px`;
    anchor.style.height = `${height}px`;
  }

  endDrag(
    e: MouseEvent | TouchEvent,
    moveHandler: (ev: MouseEvent | TouchEvent) => void,
    endHandler: (ev: MouseEvent | TouchEvent) => void
  ) {
    if (!this.draggedElement || !this.gameAreaRect || this.draggedPlayerId === null) return;

    document.removeEventListener("mousemove", moveHandler);
    document.removeEventListener("touchmove", moveHandler);
    document.removeEventListener("mouseup", endHandler);
    document.removeEventListener("touchend", endHandler);

    const clientX = isTouch(e) ? e.changedTouches[0].clientX : (e as MouseEvent).clientX;
    const clientY = isTouch(e) ? e.changedTouches[0].clientY : (e as MouseEvent).clientY;

    const relX = (clientX - this.gameAreaRect.left) / this.gameAreaRect.width;
    const relY = (clientY - this.gameAreaRect.top) / this.gameAreaRect.height;

    const { available, occupied } = this.getAvailableAnchors();
    const validAnchors = this.getValidDropTargets(available, occupied);
    validAnchors.add(this.slotAssignments[this.draggedPlayerId]);

    let targetAnchor: AnchorName | null = null;
    let minDistance = Infinity;

    for (const anchorName of validAnchors) {
      const config = ANCHOR_CONFIGS[anchorName];
      let centerX = config.x + config.width / 2;
      let centerY = config.y + config.height / 2;

      if (anchorName === "left") centerX = config.x + config.width * 0.15;
      else if (anchorName === "right") centerX = config.x + config.width * 0.85;
      else if (anchorName === "top") centerY = config.y + config.height * 0.15;
      else if (anchorName === "bottom") centerY = config.y + config.height * 0.85;

      const distance = Math.hypot(centerX - relX, centerY - relY);

      if (distance < minDistance) {
        minDistance = distance;
        targetAnchor = anchorName;
      }
    }

    if (targetAnchor && validAnchors.has(targetAnchor)) {
      const playerInTarget = occupied[targetAnchor];
      if (playerInTarget !== undefined) {
        // Swap: move the other player to our current slot
        const currentSlot = this.slotAssignments[this.draggedPlayerId];
        this.slotAssignments[playerInTarget] = currentSlot;
      }

      this.slotAssignments[this.draggedPlayerId] = targetAnchor;
      localStorage.setItem("slotAssignments", JSON.stringify(this.slotAssignments));
    }

    this.draggedElement.classList.remove("dragging");
    this.draggedElement = null;
    this.draggedPlayerId = null;
    this.dragStartPos = null;

    document.querySelectorAll<HTMLElement>(".anchor-point").forEach((anchor) => {
      anchor.classList.remove("active", "highlight");
    });

    this.positionAllCounters();
  }

  positionAllCounters() {
    if (!this.gameAreaRect) this.updateGameAreaRect();
    if (!this.gameAreaRect) return;

    document.querySelectorAll<HTMLElement>(".score-counter").forEach((counter) => {
      const playerIndex = parseInt(counter.dataset.player ?? "0", 10);
      const anchorName = this.slotAssignments[playerIndex];

      if (anchorName && ANCHOR_CONFIGS[anchorName] && this.gameAreaRect) {
        const config = ANCHOR_CONFIGS[anchorName];
        const padding = 15;
        const width = this.gameAreaRect.width * config.width - padding * 2;
        const height = this.gameAreaRect.height * config.height - padding * 2;
        const x = this.gameAreaRect.width * config.x + padding;
        const y = this.gameAreaRect.height * config.y + padding;

        counter.style.left = `${x}px`;
        counter.style.top = `${y}px`;
        counter.style.width = `${width}px`;
        counter.style.height = `${height}px`;

        counter.className = `score-counter ${config.rotation}`.trim();
      }
    });
  }

  changeScore(playerIndex: number, delta: number) {
    const newScore = (this.scores[playerIndex] || 0) + delta;
    if (newScore < 0) return;

    this.scores[playerIndex] = newScore;
    localStorage.setItem("scores", JSON.stringify(this.scores));

    const counter = document.querySelector<HTMLElement>(`[data-player="${playerIndex}"]`);
    if (counter) {
        counter.querySelector<HTMLElement>(".score-display")!.textContent = String(this.scores[playerIndex]);
    }
  }

  updateName(playerIndex: number, newName: string) {
    const trimmedName = newName.trim();
    if (trimmedName) {
      this.names[playerIndex] = trimmedName;
      localStorage.setItem("names", JSON.stringify(this.names));
    }
  }

  pickRandomPlayer() {
    const randomIndex = Math.floor(Math.random() * this.playerCount);
    const playerName = this.names[randomIndex] || `Player ${randomIndex + 1}`;

    const text = document.getElementById("randomPlayerText");
    if (text) text.textContent = `${playerName} starts!`;
    document.getElementById("randomModal")?.classList.add("active");
  }

  resetScores() {
    this.scores = {};
    localStorage.setItem("scores", JSON.stringify(this.scores));
    document.querySelectorAll<HTMLElement>(".score-display").forEach((display) => (display.textContent = "0"));
  }

  resetAll() {
    this.scores = {};
    this.names = {};
    this.legends = {};
    this.slotAssignments = {};
    localStorage.setItem("scores", JSON.stringify(this.scores));
    localStorage.setItem("names", JSON.stringify(this.names));
    localStorage.setItem("legends", JSON.stringify(this.legends));
    localStorage.setItem("slotAssignments", JSON.stringify(this.slotAssignments));
    this.ensureSlotAssignments();
    this.renderCounters();
  }
}

function isTouch(e: MouseEvent | TouchEvent): e is TouchEvent {
  return "touches" in e;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

new RiftboundCounter();
