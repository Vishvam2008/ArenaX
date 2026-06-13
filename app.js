const state = {
  wallet: 420,
  walletFrozen: false,
  withdrawalsBlocked: false,
  game: "freefire",
  sortHighPrize: false,
  nextId: 10,
  requests: [
    { id: 1, type: "Withdrawal", user: "RogueRavi", amount: 250, status: "Pending admin review", reason: "UPI payout request" },
    { id: 2, type: "Reward Approval", user: "NovaAditi", amount: 300, status: "Screenshot proof pending", reason: "Manual rank #2 reward" }
  ],
  ledger: [
    { label: "Admin signup bonus", amount: 150, type: "credit", actor: "Admin", audit: "AUD-1001" },
    { label: "Manual correction", amount: -30, type: "debit", actor: "Admin", audit: "AUD-1002" },
    { label: "Approved result reward", amount: 300, type: "credit", actor: "Admin", audit: "AUD-1003" }
  ],
  audit: [
    "AUD-1003 - Admin credited approved result reward to RogueRavi.",
    "AUD-1002 - Admin deducted manual correction with reason.",
    "AUD-1001 - Admin credited signup bonus."
  ],
  tournaments: [
    {
      id: 1,
      game: "freefire",
      title: "Free Fire Max Clash",
      mode: "Squad",
      map: "Bermuda",
      time: "Today, 7:30 PM",
      entry: 40,
      prize: 8000,
      playerLimit: 100,
      teamLimit: 25,
      registration: "Admin window",
      slots: "71/100",
      rewards: {
        perKill: 5,
        booyah: 50,
        rank1: 500,
        rank2: 300,
        rank3: 200,
        rank4to10: 75,
        mvp: 100,
        specialRewards: "Manual special rewards"
      }
    },
    {
      id: 2,
      game: "freefire",
      title: "Solo Headshot Rush",
      mode: "Solo",
      map: "Purgatory",
      time: "Today, 9:00 PM",
      entry: 20,
      prize: 2500,
      playerLimit: 48,
      teamLimit: 48,
      registration: "Admin window",
      slots: "43/48",
      rewards: {
        perKill: 3,
        booyah: 35,
        rank1: 250,
        rank2: 150,
        rank3: 90,
        rank4to10: 25,
        mvp: 75,
        specialRewards: "None"
      }
    },
    {
      id: 3,
      game: "freefire",
      title: "Grandmaster Squad Cup",
      mode: "Squad",
      map: "Kalahari",
      time: "Tomorrow, 6:00 PM",
      entry: 75,
      prize: 15000,
      playerLimit: 100,
      teamLimit: 25,
      registration: "Admin window",
      slots: "28/100",
      rewards: {
        perKill: 8,
        booyah: 100,
        rank1: 1200,
        rank2: 800,
        rank3: 500,
        rank4to10: 150,
        mvp: 300,
        specialRewards: "Clutch bonus reviewed manually"
      }
    },
    {
      id: 4,
      game: "bgmi",
      title: "BGMI Early Access Scrim",
      mode: "Squad",
      map: "Erangel",
      time: "Waitlist",
      entry: 0,
      prize: 0,
      playerLimit: 100,
      teamLimit: 25,
      registration: "Future support",
      slots: "Beta",
      rewards: {
        perKill: 0,
        booyah: 0,
        rank1: 0,
        rank2: 0,
        rank3: 0,
        rank4to10: 0,
        mvp: 0,
        specialRewards: "BGMI rewards not live"
      }
    }
  ],
  leaders: [
    { name: "RogueRavi", mode: "Solo", kills: 86, wins: 14, points: 1840 },
    { name: "NovaAditi", mode: "Squad", kills: 74, wins: 12, points: 1725 },
    { name: "BlazeX", mode: "Solo", kills: 69, wins: 10, points: 1604 },
    { name: "Team Vortex", mode: "Squad", kills: 122, wins: 9, points: 1550 },
    { name: "KiraOP", mode: "Solo", kills: 58, wins: 8, points: 1408 }
  ]
};

function saveStateToLocalStorage() {
  try {
    var toSave = {
      wallet: state.wallet,
      walletFrozen: state.walletFrozen,
      withdrawalsBlocked: state.withdrawalsBlocked,
      nextId: state.nextId,
      requests: state.requests,
      ledger: state.ledger,
      audit: state.audit,
      tournaments: state.tournaments,
      leaders: state.leaders,
      paymentNextId: state.paymentNextId,
      qrConfig: state.qrConfig,
      usedUTRs: state.usedUTRs,
      screenshotHashes: state.screenshotHashes,
      paymentRequests: state.paymentRequests,
      playerProfiles: state.playerProfiles,
      recentWinners: state.recentWinners,
      tournamentNextId: state.tournamentNextId
    };
    localStorage.setItem("ax_state", JSON.stringify(toSave));
  } catch (e) {
    console.error("Failed to save state:", e);
  }
}

function loadStateFromLocalStorage() {
  try {
    var raw = localStorage.getItem("ax_state");
    if (!raw) return;
    var loaded = JSON.parse(raw);
    if (!loaded) return;
    
    if (loaded.wallet !== undefined) state.wallet = loaded.wallet;
    if (loaded.walletFrozen !== undefined) state.walletFrozen = loaded.walletFrozen;
    if (loaded.withdrawalsBlocked !== undefined) state.withdrawalsBlocked = loaded.withdrawalsBlocked;
    if (loaded.nextId !== undefined) state.nextId = loaded.nextId;
    if (loaded.requests !== undefined) state.requests = loaded.requests;
    if (loaded.ledger !== undefined) state.ledger = loaded.ledger;
    if (loaded.audit !== undefined) state.audit = loaded.audit;
    if (loaded.tournaments !== undefined) state.tournaments = loaded.tournaments;
    if (loaded.leaders !== undefined) state.leaders = loaded.leaders;
    if (loaded.paymentNextId !== undefined) state.paymentNextId = loaded.paymentNextId;
    if (loaded.qrConfig !== undefined) state.qrConfig = loaded.qrConfig;
    if (loaded.usedUTRs !== undefined) state.usedUTRs = loaded.usedUTRs;
    if (loaded.screenshotHashes !== undefined) state.screenshotHashes = loaded.screenshotHashes;
    if (loaded.paymentRequests !== undefined) state.paymentRequests = loaded.paymentRequests;
    if (loaded.playerProfiles !== undefined) state.playerProfiles = loaded.playerProfiles;
    if (loaded.recentWinners !== undefined) state.recentWinners = loaded.recentWinners;
    if (loaded.tournamentNextId !== undefined) state.tournamentNextId = loaded.tournamentNextId;
  } catch (e) {
    console.error("Failed to load state:", e);
  }
}

// Restore state from localStorage immediately on script load
loadStateFromLocalStorage();

const refs = {
  walletMini: document.querySelector("#walletMini"),
  walletBalance: document.querySelector("#walletBalance"),
  tournamentList: document.querySelector("#tournamentList"),
  ledger: document.querySelector("#ledger"),
  leaderboard: document.querySelector("#leaderboard"),
  toast: document.querySelector("#toast"),
  search: document.querySelector("#searchInput"),
  walletRequests: document.querySelector("#walletRequests"),
  approvalQueue: document.querySelector("#approvalQueue"),
  auditLog: document.querySelector("#auditLog"),
  resultTournament: document.querySelector("#resultTournament")
};

function money(value) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function rupees(value) {
  return `\u20b9${money(value)}`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeDataUrl(value) {
  var raw = String(value || "");
  return /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(raw) ? raw : "";
}

function safeNumber(value, fallback = 0) {
  var num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function showToast(message) {
  refs.toast.textContent = String(message ?? "");
  refs.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => refs.toast.classList.remove("show"), 3000);
}

function setView(view) {
  if (!/^[a-z0-9_-]+$/i.test(view)) return;
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === view);
  });
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
  document.querySelector(`#${view}`)?.scrollIntoView({ block: "start" });
}

function audit(message) {
  const id = `AUD-${1000 + state.audit.length + 1}`;
  state.audit.unshift(`${id} - ${message}`);
  renderAudit();
  saveStateToLocalStorage();
  return id;
}

function addLedger(label, amount, type, actor, auditId) {
  state.ledger.unshift({ label, amount, type, actor, audit: auditId });
  renderLedger();
  saveStateToLocalStorage();
}

function addRequest(type, amount, reason, user = "RogueRavi") {
  const request = {
    id: state.nextId++,
    type,
    user,
    amount,
    status: "Pending admin review",
    reason
  };
  state.requests.unshift(request);
  audit(`${type} request created for ${user}; no balance change performed.`);
  renderRequests();
  saveStateToLocalStorage();
  return request;
}

function updateWallet() {
  refs.walletMini.textContent = money(state.wallet);
  refs.walletBalance.textContent = money(state.wallet);
}

function rewardSummary(rewards) {
  return [
    `Kill ${rupees(rewards.perKill)}`,
    `Booyah ${rupees(rewards.booyah)}`,
    `#1 ${rupees(rewards.rank1)}`,
    `#2 ${rupees(rewards.rank2)}`,
    `#3 ${rupees(rewards.rank3)}`,
    `#4-10 ${rupees(rewards.rank4to10)}`,
    `MVP ${rupees(rewards.mvp)}`
  ].join(" | ");
}

function renderTournaments() {
  const query = refs.search.value.trim().toLowerCase();
  let items = state.tournaments.filter((item) => item.game === state.game);

  if (query) {
    items = items.filter((item) => {
      return [item.title, item.mode, item.map, item.time, item.registration].join(" ").toLowerCase().includes(query);
    });
  }

  if (state.sortHighPrize) {
    items = [...items].sort((a, b) => b.prize - a.prize);
  }

  refs.tournamentList.innerHTML = items.map((item) => {
    const disabled = item.game === "bgmi";
    const prize = item.prize ? rupees(item.prize) : "Admin setup pending";
    const entry = item.entry ? `${rupees(item.entry)} entry` : "Waitlist";

    return `
      <article class="tournament-card">
        <div>
          <div class="tournament-top">
            <h3 class="tournament-title">${escapeHTML(item.title)}</h3>
            <span class="mode-badge">${escapeHTML(item.mode)}</span>
          </div>
          <div class="tournament-meta">
            <span>${escapeHTML(item.map)}</span>
            <span>${escapeHTML(item.time)}</span>
            <span>${entry}</span>
            <span>${item.slots} slots</span>
            <strong>${prize}</strong>
          </div>
          <div class="reward-summary">${rewardSummary(item.rewards)}</div>
          <p class="muted">Registration, result verification, rewards, and payouts require admin approval. Screenshot proof is mandatory.</p>
        </div>
        <button class="${disabled ? "secondary-action" : "primary-action"}" type="button" data-join="${item.id}">
          ${disabled ? "Join Waitlist" : "Request Entry"}
        </button>
      </article>
    `;
  }).join("");

  if (!items.length) {
    refs.tournamentList.innerHTML = `<article class="tournament-card"><strong>No matches found</strong><span>Try another search or game filter.</span></article>`;
  }

  renderTournamentOptions();
}

function renderLedger() {
  refs.ledger.innerHTML = state.ledger.map((row) => `
    <div class="ledger-row">
      <div>
          <strong>${escapeHTML(row.label)}</strong>
        <span>${escapeHTML(row.actor)} | ${escapeHTML(row.audit)}</span>
      </div>
      <strong>${row.amount > 0 ? "+" : "-"}${rupees(Math.abs(row.amount))}</strong>
    </div>
  `).join("");
}

function renderRequests() {
  const walletMarkup = state.requests.map((request) => `
    <div class="request-row">
      <div>
        <strong>${escapeHTML(request.type)}</strong>
        <span>${escapeHTML(request.user)} | ${escapeHTML(request.status)} | ${escapeHTML(request.reason)}</span>
      </div>
      <strong>${rupees(safeNumber(request.amount))}</strong>
    </div>
  `).join("");

  const adminMarkup = state.requests.map((request) => `
    <div class="request-row">
      <div>
        <strong>${escapeHTML(request.type)}</strong>
        <span>${escapeHTML(request.user)} | ${escapeHTML(request.status)} | ${escapeHTML(request.reason)}</span>
      </div>
      <strong>${rupees(safeNumber(request.amount))}</strong>
      <div class="request-actions">
        <button type="button" data-approve-request="${request.id}">Approve</button>
        <button type="button" data-reject-request="${request.id}">Reject</button>
      </div>
    </div>
  `).join("");

  refs.walletRequests.innerHTML = walletMarkup || `<div class="request-row"><strong>No pending wallet requests</strong><span>All financial changes still require audit.</span></div>`;
  refs.approvalQueue.innerHTML = adminMarkup || `<div class="request-row"><strong>No pending approvals</strong><span>Admin queue is clear.</span></div>`;
}

function renderAudit() {
  refs.auditLog.innerHTML = state.audit.map((entry) => `<div>${escapeHTML(entry)}</div>`).join("");
}

function renderTournamentOptions() {
  refs.resultTournament.innerHTML = state.tournaments.map((item) => {
    return `<option value="${Number(item.id)}">${escapeHTML(item.title)}</option>`;
  }).join("");
}

function renderLeaderboard() {
  const showSolo = document.querySelector("#soloToggle").checked;
  const showSquad = document.querySelector("#squadToggle").checked;
  const leaders = state.leaders.filter((player) => {
    return (player.mode === "Solo" && showSolo) || (player.mode === "Squad" && showSquad);
  });

  refs.leaderboard.innerHTML = leaders.map((player, index) => `
    <div class="leader-row">
      <strong>#${index + 1}</strong>
      <div class="leader-name">
        <strong>${escapeHTML(player.name)}</strong>
        <span>${escapeHTML(player.mode)} - ${safeNumber(player.kills)} kills - ${safeNumber(player.wins)} wins - admin verified</span>
      </div>
      <strong>${player.points}</strong>
    </div>
  `).join("");
}

function applyAdminCredit(label, amount, actorMessage) {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized balance modification.");
    return;
  }
  state.wallet += amount;
  updateWallet();
  const auditId = audit(actorMessage);
  addLedger(label, amount, "credit", "Admin", auditId);
  saveStateToLocalStorage();
}

function applyAdminDebit(label, amount, actorMessage) {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized balance modification.");
    return false;
  }
  if (amount > state.wallet) {
    showToast("Admin debit blocked: insufficient wallet balance.");
    return false;
  }
  state.wallet -= amount;
  updateWallet();
  const auditId = audit(actorMessage);
  addLedger(label, -amount, "debit", "Admin", auditId);
  saveStateToLocalStorage();
  return true;
}

function approveRequest(id) {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized operation.");
    return;
  }
  const request = state.requests.find((item) => item.id === id);
  if (!request) return;

  if (request.type === "Deposit") {
    applyAdminCredit("Approved deposit", request.amount, `Admin approved deposit for ${request.user}.`);
  } else if (request.type === "Withdrawal") {
    if (state.withdrawalsBlocked || state.walletFrozen) {
      showToast("Withdrawal approval blocked by wallet controls.");
      return;
    }
    if (!applyAdminDebit("Approved withdrawal", request.amount, `Admin approved withdrawal for ${request.user}.`)) return;
  } else if (request.type === "Tournament Entry") {
    if (state.walletFrozen) {
      showToast("Entry approval blocked: wallet is frozen.");
      return;
    }
    if (!applyAdminDebit("Approved tournament entry", request.amount, `Admin approved tournament entry for ${request.user}.`)) return;

    // Automatically approve the participant in the tournament
    if (request.tournamentId && request.userId) {
      var t = state.tournaments.find(function(x) { return x.id === request.tournamentId; });
      if (t) {
        var p = t.participants.find(function(x) { return x.userId === request.userId; });
        if (p) {
          p.status = "approved";
          t.filledSlots = t.participants.filter(function(x) { return x.status === "approved"; }).length;
          audit("Auto-approved participant " + p.userName + " for " + t.title + " on wallet request approval.");
          if (typeof renderAdminTournaments === "function") renderAdminTournaments();
          if (typeof renderTournaments === "function") renderTournaments();
        }
      }
    }
  } else if (request.type === "Reward Approval") {
    applyAdminCredit("Approved winnings", request.amount, `Admin approved final winnings for ${request.user} after result verification.`);
  } else if (request.type === "Refund") {
    applyAdminCredit("Approved refund", request.amount, `Admin approved refund for ${request.user}.`);
  }

  request.status = "Approved";
  state.requests = state.requests.filter((item) => item.id !== id);
  renderRequests();
  saveStateToLocalStorage();
  showToast(`${request.type} approved with audit trail.`);
}

function rejectRequest(id) {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized operation.");
    return;
  }
  const request = state.requests.find((item) => item.id === id);
  if (!request) return;
  request.status = "Rejected";
  audit(`Admin rejected ${request.type} for ${request.user}; no balance change performed.`);
  state.requests = state.requests.filter((item) => item.id !== id);
  renderRequests();
  saveStateToLocalStorage();
  showToast(`${request.type} rejected and logged.`);
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    setView(viewButton.dataset.view);
  }

  const segment = event.target.closest("[data-game]");
  if (segment) {
    state.game = segment.dataset.game;
    document.querySelectorAll(".segment").forEach((button) => {
      button.classList.toggle("active", button === segment);
    });
    renderTournaments();
    showToast(state.game === "bgmi" ? "BGMI support is in beta waitlist mode." : "Free Fire admin-controlled rooms loaded.");
  }

  const preset = event.target.closest("[data-amount]");
  if (preset) {
    document.querySelector("#topupAmount").value = preset.dataset.amount;
  }

  const joinButton = event.target.closest("[data-join]");
  if (joinButton) {
    const tournament = state.tournaments.find((item) => item.id === Number(joinButton.dataset.join));
    if (!tournament) return;
    if (tournament.game === "bgmi") {
      addRequest("Tournament Entry", 0, "BGMI launch waitlist");
      showToast("BGMI waitlist request submitted for admin review.");
      return;
    }
    addRequest("Tournament Entry", tournament.entry, `${tournament.title} registration approval`);
    showToast("Entry request submitted. Wallet is unchanged until admin approval.");
  }

  const approveButton = event.target.closest("[data-approve-request]");
  if (approveButton) {
    approveRequest(Number(approveButton.dataset.approveRequest));
  }

  const rejectButton = event.target.closest("[data-reject-request]");
  if (rejectButton) {
    rejectRequest(Number(rejectButton.dataset.rejectRequest));
  }

  const adminButton = event.target.closest("[data-admin-action]");
  if (adminButton) {
    audit(`Admin action logged: ${adminButton.dataset.adminAction}.`);
    showToast(`Admin action logged: ${adminButton.dataset.adminAction}.`);
  }
});

document.querySelector("#sortPrize").addEventListener("click", () => {
  state.sortHighPrize = !state.sortHighPrize;
  renderTournaments();
  showToast(state.sortHighPrize ? "Highest prize pool first." : "Default tournament order restored.");
});

refs.search.addEventListener("input", renderTournaments);

  const topupBtn = document.querySelector("#topupButton");
  if (topupBtn) {
    topupBtn.addEventListener("click", () => {
      const amount = Number(document.querySelector("#topupAmount").value);
      if (!Number.isFinite(amount) || amount < 10) {
        showToast("Minimum deposit request is \u20b910.");
        return;
      }
      addRequest("Deposit", amount, "User deposit request");
      showToast("Deposit request submitted. Balance will change only after admin approval.");
    });
  }

  const withdrawBtn = document.querySelector("#withdrawButton");
  if (withdrawBtn) {
    withdrawBtn.addEventListener("click", () => {
      const amount = Number(document.querySelector("#withdrawAmount").value);
      if (!Number.isFinite(amount) || amount < 50) {
        showToast("Minimum withdrawal request is \u20b950.");
        return;
      }
      if (state.withdrawalsBlocked || state.walletFrozen) {
        showToast("Withdrawal request blocked by admin wallet controls.");
        return;
      }
      addRequest("Withdrawal", amount, "User withdrawal request");
      showToast("Withdrawal request submitted. No balance change until admin approval.");
    });
  }

  const roomFrm = document.querySelector("#roomForm");
  if (roomFrm) {
    roomFrm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      audit(`Admin published room ${form.get("room")} to approved players.`);
      showToast(`Room ${form.get("room")} published to approved players.`);
      event.currentTarget.reset();
    });
  }

  const tournamentFrm = document.querySelector("#tournamentForm");
  if (tournamentFrm) {
    tournamentFrm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const tournament = {
        id: state.nextId++,
        game: state.game,
        title: form.get("name"),
        mode: form.get("matchType"),
        map: state.game === "bgmi" ? "Erangel" : "Custom",
        time: `${form.get("registrationStart")} to ${form.get("registrationEnd")}`,
        entry: Number(form.get("entryFee")),
        prize: Number(form.get("prizePool")),
        playerLimit: Number(form.get("playerLimit")),
        teamLimit: Number(form.get("teamLimit")),
        registration: `${form.get("registrationStart")} - ${form.get("registrationEnd")}`,
        slots: `0/${form.get("playerLimit")}`,
        rewards: {
          perKill: Number(form.get("perKill")),
          booyah: Number(form.get("booyah")),
          rank1: Number(form.get("rank1")),
          rank2: Number(form.get("rank2")),
          rank3: Number(form.get("rank3")),
          rank4to10: Number(form.get("rank4to10")),
          mvp: Number(form.get("mvp")),
          specialRewards: form.get("specialRewards") || "Manual review"
        }
      };
      state.tournaments.unshift(tournament);
      audit(`Admin created tournament ${tournament.title} with manual reward structure.`);
      renderTournaments();
      showToast("Tournament created with admin-controlled rewards.");
      event.currentTarget.reset();
    });
  }

  const walletAdminFrm = document.querySelector("#walletAdminForm");
  if (walletAdminFrm) {
    walletAdminFrm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const action = form.get("walletAction");
      const user = form.get("user");
      const amount = Number(form.get("amount")) || 0;
      const reason = form.get("reason");

      if (action === "credit" || action === "bonus" || action === "correction") {
        applyAdminCredit(`Admin ${action}`, amount, `Admin credited ${user}: ${reason}.`);
      } else if (action === "debit") {
        applyAdminDebit("Admin deduction", amount, `Admin deducted from ${user}: ${reason}.`);
      } else if (action === "freeze") {
        state.walletFrozen = true;
        audit(`Admin froze wallet for ${user}: ${reason}.`);
      } else if (action === "unfreeze") {
        state.walletFrozen = false;
        audit(`Admin unfroze wallet for ${user}: ${reason}.`);
      } else if (action === "block-withdrawals") {
        state.withdrawalsBlocked = true;
        audit(`Admin blocked withdrawals for ${user}: ${reason}.`);
      } else if (action === "unblock-withdrawals") {
        state.withdrawalsBlocked = false;
        audit(`Admin unblocked withdrawals for ${user}: ${reason}.`);
      }

      showToast("Wallet admin action completed with audit trail.");
    });
  }

  const resultFrm = document.querySelector("#resultForm");
  if (resultFrm) {
    resultFrm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const tournament = state.tournaments.find((item) => item.id === Number(form.get("tournamentId")));
      const amount = Number(form.get("approvedAmount"));
      const user = form.get("winner");

      addRequest("Reward Approval", amount, `Verified result for ${tournament?.title || "tournament"}; screenshot proof received`, user);
      showToast("Verified reward moved to admin approval queue. No automatic payout.");
      event.currentTarget.reset();
    });
  }

  const refundFrm = document.querySelector("#refundForm");
  if (refundFrm) {
    refundFrm.addEventListener("submit", (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const amount = Number(form.get("amount"));
      addRequest("Refund", amount, `${form.get("refundType")}: ${form.get("reason")}`);
      showToast("Refund request queued. Credit occurs only after admin approval.");
      event.currentTarget.reset();
    });
  }

  const downloadBtn = document.querySelector("#downloadButton");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      showToast("APK download placeholder triggered. Connect this to your signed build URL.");
    });
  }

document.querySelector("#themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
});

document.querySelector("#soloToggle").addEventListener("change", renderLeaderboard);
document.querySelector("#squadToggle").addEventListener("change", renderLeaderboard);

updateWallet();
renderTournaments();
renderLedger();
renderRequests();
renderAudit();
renderLeaderboard();
