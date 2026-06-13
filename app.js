const state = {
  game: "freefire",
  sortHighPrize: false,
  nextId: 10,
  requests: [],
  ledger: [],
  audit: [],
  users: [],
  wallets: {},
  currentUser: null,
  tournaments: [],
  leaders: [
    { name: "RogueRavi", mode: "Solo", kills: 86, wins: 14, points: 1840 },
    { name: "NovaAditi", mode: "Squad", kills: 74, wins: 12, points: 1725 },
    { name: "BlazeX", mode: "Solo", kills: 69, wins: 10, points: 1604 },
    { name: "Team Vortex", mode: "Squad", kills: 122, wins: 9, points: 1550 },
    { name: "KiraOP", mode: "Solo", kills: 58, wins: 8, points: 1408 }
  ],
  _walletBalance: 0,
  _walletFrozen: false,
  _withdrawalsBlocked: false
};

// API Server Root Configuration
const API_BASE = "http://localhost:4400";

function apiFetch(url, options = {}) {
  const token = sessionStorage.getItem("ax_session_token") || localStorage.getItem("ax_session_token");
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const fetchUrl = url.startsWith('http') ? url : `${API_BASE}${url}`;
  return fetch(fetchUrl, { ...options, headers }).then(async (res) => {
    if (res.status === 401 && !url.includes('/api/auth/login')) {
      sessionStorage.removeItem("ax_session_token");
      localStorage.removeItem("ax_session_token");
      state.currentUser = null;
      if (typeof updatePlayerContext === "function") updatePlayerContext();
      if (typeof updateAuthOverlayVisibility === "function") updateAuthOverlayVisibility();
    }
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || `Server error (${res.status})`);
      return payload;
    }
    if (!res.ok) throw new Error(`Server error (${res.status})`);
    return res;
  });
}

async function loadStateFromServer() {
  try {
    const res = await apiFetch("/api/tournaments");
    if (res.success && res.tournaments) {
      state.tournaments = res.tournaments;
    }
  } catch (err) {
    console.warn("Failed to load tournaments from database:", err.message);
  }

  try {
    const res = await apiFetch("/api/apk/version");
    if (res.success && res.apk) {
      const chip = document.querySelector(".version-chip");
      if (chip) chip.textContent = res.apk.version;
      const downloadBtn = document.getElementById("downloadButton");
      if (downloadBtn) {
        const sizeSpan = document.querySelector(".download-meta span:first-child");
        if (sizeSpan) sizeSpan.textContent = res.apk.file_size;
        const osSpan = document.querySelector(".download-meta span:nth-child(2)");
        if (osSpan) osSpan.textContent = res.apk.android_version;
        downloadBtn.onclick = function() {
          if (res.apk.download_url && res.apk.download_url !== "#") {
            window.open(res.apk.download_url, "_blank");
          } else {
            showToast("APK download URL is currently unconfigured.");
          }
        };
      }
    }
  } catch (err) {
    console.warn("Failed to load APK version from database:", err.message);
  }
  
  if (typeof renderTournaments === "function") renderTournaments();
}

function saveStateToLocalStorage() {
  // Database is now the source of truth; local saving is disabled
}

async function hashPassword(password) {
  // Passwords are securely hashed with bcrypt on the server side
  return password;
}

function loadStateFromLocalStorage() {
  // Database is now the source of truth, loading from localStorage is disabled
}

// Define ES5 getters/setters mapping to API cache values
Object.defineProperty(state, 'wallet', {
  get: function() {
    return state._walletBalance;
  },
  set: function(val) {
    state._walletBalance = Number(val);
  },
  configurable: true,
  enumerable: true
});

Object.defineProperty(state, 'walletFrozen', {
  get: function() {
    return state._walletFrozen;
  },
  set: function(val) {
    state._walletFrozen = !!val;
  },
  configurable: true,
  enumerable: true
});

Object.defineProperty(state, 'withdrawalsBlocked', {
  get: function() {
    return state._withdrawalsBlocked;
  },
  set: function(val) {
    state._withdrawalsBlocked = !!val;
  },
  configurable: true,
  enumerable: true
});

// Restore session from API immediately on script load
loadStateFromServer();

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

function addLedger(label, amount, type, actor, auditId, targetUserId = null) {
  var uId = targetUserId || (state.currentUser ? state.currentUser.id : "USR102");
  state.ledger.unshift({ userId: uId, label, amount, type, actor, audit: auditId });
  renderLedger();
  saveStateToLocalStorage();
}

function addRequest(type, amount, reason, user = null) {
  var uName = user || (state.currentUser ? state.currentUser.name : "RogueRavi");
  var uId = state.currentUser ? state.currentUser.id : "USR102";
  
  if (user) {
    var found = state.users.find(u => u.username === user || u.id === user || (u.freeFireUid && u.freeFireUid === user));
    if (found) {
      uId = found.id;
      uName = found.username;
    }
  }

  const request = {
    id: state.nextId++,
    type,
    userId: uId,
    user: uName,
    amount,
    status: "Pending admin review",
    reason
  };
  state.requests.unshift(request);
  audit(`${type} request created for ${uName}; no balance change performed.`);
  renderRequests();
  saveStateToLocalStorage();
  return request;
}

function updateWallet() {
  var bal = state.currentUser ? state.wallet : 0;
  refs.walletMini.textContent = money(bal);
  refs.walletBalance.textContent = money(bal);
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
  if (!state.currentUser) {
    refs.ledger.innerHTML = '<div class="empty-state"><span>Log in to view transactions</span></div>';
    return;
  }
  var filtered = state.ledger.filter(function(row) {
    return row.userId === state.currentUser.id;
  });
  refs.ledger.innerHTML = filtered.map((row) => `
    <div class="ledger-row">
      <div>
          <strong>${escapeHTML(row.label)}</strong>
        <span>${escapeHTML(row.actor)} | ${escapeHTML(row.audit)}</span>
      </div>
      <strong>${row.amount > 0 ? "+" : "-"}${rupees(Math.abs(row.amount))}</strong>
    </div>
  `).join("") || '<div class="empty-state"><span>No transactions yet</span></div>';
}

function renderRequests() {
  if (!state.currentUser) {
    refs.walletRequests.innerHTML = '<div class="empty-state"><span>Log in to view requests</span></div>';
    return;
  }
  var userRequests = state.requests.filter(function(r) {
    return r.userId === state.currentUser.id;
  });

  const walletMarkup = userRequests.map((request) => `
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

function applyAdminCredit(label, amount, actorMessage, targetUserId = null) {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized balance modification.");
    return;
  }
  var uId = targetUserId || (state.currentUser ? state.currentUser.id : null);
  if (!uId) {
    showToast("No target user selected for credit.");
    return;
  }
  fetch("http://localhost:4400/api/admin/credit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": state.adminSession.authHeader
    },
    body: JSON.stringify({
      userId: uId,
      amount: amount,
      label: actorMessage || label
    })
  })
  .then(function(res) { return res.json(); })
  .then(function(res) {
    if (res.success) {
      showToast("Wallet credited successfully.");
      if (typeof syncAdminUsers === "function") syncAdminUsers();
      if (typeof updatePlayerContext === "function") updatePlayerContext();
    } else {
      showToast("Credit failed: " + res.error);
    }
  })
  .catch(function(err) {
    showToast("Server connection error: " + err.message);
  });
}

function applyAdminDebit(label, amount, actorMessage, targetUserId = null) {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized balance modification.");
    return false;
  }
  var uId = targetUserId || (state.currentUser ? state.currentUser.id : null);
  if (!uId) {
    showToast("No target user selected for debit.");
    return false;
  }
  fetch("http://localhost:4400/api/admin/debit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": state.adminSession.authHeader
    },
    body: JSON.stringify({
      userId: uId,
      amount: amount,
      label: actorMessage || label
    })
  })
  .then(function(res) { return res.json(); })
  .then(function(res) {
    if (res.success) {
      showToast("Wallet debited successfully.");
      if (typeof syncAdminUsers === "function") syncAdminUsers();
      if (typeof updatePlayerContext === "function") updatePlayerContext();
    } else {
      showToast("Debit failed: " + res.error);
    }
  })
  .catch(function(err) {
    showToast("Server connection error: " + err.message);
  });
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
    if (typeof approvePayment === "function") {
      approvePayment(id);
    }
  } else if (request.type === "Withdrawal") {
    showToast("Processing withdrawal approval...");
    adminApiFetch("/api/admin/requests/action", {
      method: "POST",
      body: { withdrawalId: id, action: "approve", notes: "Approved by Admin" }
    })
    .then(function(res) {
      if (res.success) {
        showToast("Withdrawal approved successfully.");
        if (typeof syncAdminRequests === "function") syncAdminRequests();
        if (typeof syncAdminUsers === "function") syncAdminUsers();
        if (typeof syncAdminAuditLogs === "function") syncAdminAuditLogs();
      }
    })
    .catch(function(err) {
      showToast("Approval failed: " + err.message);
    });
  }
}

function rejectRequest(id) {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized operation.");
    return;
  }
  const request = state.requests.find((item) => item.id === id);
  if (!request) return;

  if (request.type === "Deposit") {
    if (typeof rejectPayment === "function") {
      rejectPayment(id);
    }
  } else if (request.type === "Withdrawal") {
    var reason = prompt("Enter rejection reason:");
    if (reason === null) return;
    showToast("Processing withdrawal rejection...");
    adminApiFetch("/api/admin/requests/action", {
      method: "POST",
      body: { withdrawalId: id, action: "reject", notes: reason || "Rejected by Admin" }
    })
    .then(function(res) {
      if (res.success) {
        showToast("Withdrawal rejected successfully.");
        if (typeof syncAdminRequests === "function") syncAdminRequests();
        if (typeof syncAdminUsers === "function") syncAdminUsers();
        if (typeof syncAdminAuditLogs === "function") syncAdminAuditLogs();
      }
    })
    .catch(function(err) {
      showToast("Rejection failed: " + err.message);
    });
  }
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
     function loadStateFromLocalStorage() {
  // Database is now the source of truth
}

// Restore state from database immediately on script load
loadStateFromServer();

// Define ES5 getters/setters for active user wallet mapping to API cache values
Object.defineProperty(state, 'wallet', {
  get: function() {
    return state._walletBalance;
  },
  set: function(val) {
    state._walletBalance = Number(val);
  },
  configurable: true,
  enumerable: true
});

Object.defineProperty(state, 'walletFrozen', {
  get: function() {
    return state._walletFrozen;
  },
  set: function(val) {
    state._walletFrozen = !!val;
  },
  configurable: true,
  enumerable: true
});

Object.defineProperty(state, 'withdrawalsBlocked', {
  get: function() {
    return state._withdrawalsBlocked;
  },
  set: function(val) {
    state._withdrawalsBlocked = !!val;
  },
  configurable: true,
  enumerable: true
});
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

      function findUserByInput(inputVal) {
        if (!inputVal) return null;
        var val = inputVal.trim().toLowerCase();
        return state.users.find(function(u) {
          return u.id.toLowerCase() === val || u.username.toLowerCase() === val || (u.freeFireUid && u.freeFireUid.toLowerCase() === val);
        });
      }

      var targetUser = findUserByInput(user);
      if (!targetUser) {
        showToast("User not found: " + user);
        return;
      }
      var targetId = targetUser.id;

      if (action === "credit" || action === "bonus" || action === "correction") {
        applyAdminCredit(`Admin ${action}`, amount, `Admin credited ${targetUser.username}: ${reason}.`, targetId);
      } else if (action === "debit") {
        applyAdminDebit("Admin deduction", amount, `Admin deducted from ${targetUser.username}: ${reason}.`, targetId);
      } else if (action === "freeze") {
        if (typeof adminApiFetch === "function") {
          adminApiFetch("/api/admin/users/status", { method: "POST", body: { userId: targetId, frozen: true } })
            .then(res => { showToast(`Wallet frozen for ${targetUser.username}`); if (typeof syncAdminUsers === "function") syncAdminUsers(); })
            .catch(err => showToast(err.message));
        }
      } else if (action === "unfreeze") {
        if (typeof adminApiFetch === "function") {
          adminApiFetch("/api/admin/users/status", { method: "POST", body: { userId: targetId, frozen: false } })
            .then(res => { showToast(`Wallet unfrozen for ${targetUser.username}`); if (typeof syncAdminUsers === "function") syncAdminUsers(); })
            .catch(err => showToast(err.message));
        }
      } else if (action === "block-withdrawals") {
        if (typeof adminApiFetch === "function") {
          adminApiFetch("/api/admin/users/status", { method: "POST", body: { userId: targetId, withdrawalsBlocked: true } })
            .then(res => { showToast(`Withdrawals blocked for ${targetUser.username}`); if (typeof syncAdminUsers === "function") syncAdminUsers(); })
            .catch(err => showToast(err.message));
        }
      } else if (action === "unblock-withdrawals" || action === "allow-withdrawals") {
        if (typeof adminApiFetch === "function") {
          adminApiFetch("/api/admin/users/status", { method: "POST", body: { userId: targetId, withdrawalsBlocked: false } })
            .then(res => { showToast(`Withdrawals allowed for ${targetUser.username}`); if (typeof syncAdminUsers === "function") syncAdminUsers(); })
            .catch(err => showToast(err.message));
        }
      }
      showToast("Wallet admin action completed with audit trail.");
      event.currentTarget.reset();
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
      const userVal = form.get("refundUser");
      addRequest("Refund", amount, `${form.get("refundType")}: ${form.get("reason")}`, userVal);
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

// =============================================================
// PLAYER AUTHENTICATION SYSTEM CONTROLLERS
// =============================================================

function switchAuthTab(tab) {
  var loginForm = document.getElementById("playerLoginForm");
  var registerForm = document.getElementById("playerRegisterForm");
  var resetForm = document.getElementById("playerResetForm");
  var forceForm = document.getElementById("playerForceResetForm");
  
  var tabLogin = document.getElementById("authTabLogin");
  var tabRegister = document.getElementById("authTabRegister");
  var tabReset = document.getElementById("authTabReset");

  loginForm.style.display = tab === 'login' ? 'block' : 'none';
  registerForm.style.display = tab === 'register' ? 'block' : 'none';
  resetForm.style.display = tab === 'reset' ? 'block' : 'none';
  forceForm.style.display = 'none';

  tabLogin.style.display = 'block';
  tabRegister.style.display = 'block';
  tabReset.style.display = 'block';

  tabLogin.classList.toggle("active", tab === 'login');
  tabRegister.classList.toggle("active", tab === 'register');
  tabReset.classList.toggle("active", tab === 'reset');

  document.getElementById("loginError").classList.remove("show");
  document.getElementById("registerError").classList.remove("show");
  document.getElementById("resetError").classList.remove("show");
  document.getElementById("resetSuccess").classList.remove("show");
  document.getElementById("forceResetError").classList.remove("show");

  document.getElementById("resetStep1").style.display = 'block';
  document.getElementById("resetStep2").style.display = 'none';
}

async function handlePlayerLogin(e) {
  if (e) e.preventDefault();
  var u = (document.getElementById("loginUsername").value || "").trim();
  var p = document.getElementById("loginPassword").value || "";
  var remember = document.getElementById("loginRememberMe").checked;
  var errDiv = document.getElementById("loginError");

  errDiv.classList.remove("show");

  try {
    const res = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: u, password: p })
    });

    if (res.success && res.sessionToken) {
      if (remember) {
        localStorage.setItem("ax_session_token", res.sessionToken);
      } else {
        localStorage.removeItem("ax_session_token");
      }
      sessionStorage.setItem("ax_session_token", res.sessionToken);

      if (res.user.forcePasswordReset) {
        state.pendingResetUser = res.user;
        
        document.getElementById("playerLoginForm").style.display = 'none';
        document.getElementById("playerRegisterForm").style.display = 'none';
        document.getElementById("playerResetForm").style.display = 'none';
        
        document.getElementById("authTabLogin").style.display = 'none';
        document.getElementById("authTabRegister").style.display = 'none';
        document.getElementById("authTabReset").style.display = 'none';
        
        var forceForm = document.getElementById("playerForceResetForm");
        forceForm.style.display = 'block';
        document.getElementById("forceNewPassword").value = "";
        document.getElementById("forceConfirmPassword").value = "";
        document.getElementById("forceResetError").classList.remove("show");
        
        showToast("Demo account detected. Password change required.");
        return;
      }

      state.currentUser = res.user;
      await updatePlayerContext();
      document.getElementById("playerAuthOverlay").classList.remove("active");
      showToast("Logged in as " + res.user.name + ".");
    }
  } catch (err) {
    errDiv.textContent = err.message;
    errDiv.classList.add("show");
  }
}

async function handlePlayerForceReset(e) {
  if (e) e.preventDefault();
  var newP = document.getElementById("forceNewPassword").value || "";
  var confP = document.getElementById("forceConfirmPassword").value || "";
  var errDiv = document.getElementById("forceResetError");

  errDiv.classList.remove("show");

  if (!state.pendingResetUser) {
    errDiv.textContent = "No user session selected.";
    errDiv.classList.add("show");
    return;
  }
  if (newP.length < 8) {
    errDiv.textContent = "Password must be at least 8 characters long.";
    errDiv.classList.add("show");
    return;
  }
  if (newP !== confP) {
    errDiv.textContent = "Passwords do not match.";
    errDiv.classList.add("show");
    return;
  }

  try {
    const res = await apiFetch("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        username: state.pendingResetUser.name,
        email: state.pendingResetUser.email,
        token: state.pendingResetUser.resetToken || "MIGRATED", // Handled transparently by reset API
        newPassword: newP
      })
    });

    if (res.success) {
      state.pendingResetUser = null;
      showToast("Password reset successfully. Please login.");
      
      document.getElementById("playerForceResetForm").style.display = 'none';
      document.getElementById("playerLoginForm").style.display = 'block';
      document.getElementById("authTabLogin").style.display = 'block';
      document.getElementById("authTabRegister").style.display = 'block';
      document.getElementById("authTabReset").style.display = 'block';
      switchAuthTab('login');
    }
  } catch (err) {
    errDiv.textContent = err.message;
    errDiv.classList.add("show");
  }
}

async function requestResetToken() {
  var u = (document.getElementById("resetUsername").value || "").trim();
  var email = (document.getElementById("resetEmail").value || "").trim();
  var errDiv = document.getElementById("resetError");

  errDiv.classList.remove("show");

  try {
    const res = await apiFetch("/api/auth/reset-token", {
      method: "POST",
      body: JSON.stringify({ username: u, email: email })
    });

    if (res.success) {
      var form = document.getElementById("playerResetForm");
      form.dataset.resetUsername = u;
      form.dataset.resetEmail = email;

      document.getElementById("resetStep1").style.display = 'none';
      document.getElementById("resetStep2").style.display = 'block';
      
      if (res.token) {
        document.getElementById("resetTokenNotification").innerHTML = "Verification code generated! <br/><strong>Token: " + res.token + "</strong> (Expires in 5 mins)";
      }
      showToast("Reset token generated.");
    }
  } catch (err) {
    errDiv.textContent = err.message;
    errDiv.classList.add("show");
  }
}

async function confirmPasswordReset() {
  var tokenVal = (document.getElementById("resetTokenInput").value || "").trim();
  var newP = document.getElementById("resetNewPassword").value || "";
  var errDiv = document.getElementById("resetError");
  var succDiv = document.getElementById("resetSuccess");
  
  var form = document.getElementById("playerResetForm");
  var u = form.dataset.resetUsername;
  var email = form.dataset.resetEmail;

  errDiv.classList.remove("show");
  succDiv.classList.remove("show");

  try {
    const res = await apiFetch("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({
        username: u,
        email: email,
        token: tokenVal,
        newPassword: newP
      })
    });

    if (res.success) {
      succDiv.textContent = "Password updated successfully! Logging you in...";
      succDiv.classList.add("show");

      setTimeout(async function() {
        try {
          const loginRes = await apiFetch("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({ username: u, password: newP })
          });
          if (loginRes.success && loginRes.sessionToken) {
            sessionStorage.setItem("ax_session_token", loginRes.sessionToken);
            state.currentUser = loginRes.user;
            await updatePlayerContext();
            document.getElementById("playerAuthOverlay").classList.remove("active");
            showToast("Password reset complete. Welcome back.");
          }
        } catch (e) {
          switchAuthTab('login');
        }
      }, 1200);
    }
  } catch (err) {
    errDiv.textContent = err.message;
    errDiv.classList.add("show");
  }
}

async function handlePlayerRegister(e) {
  if (e) e.preventDefault();
  var u = (document.getElementById("regUsername").value || "").trim();
  var email = (document.getElementById("regEmail").value || "").trim();
  var p = document.getElementById("regPassword").value || "";
  var phone = (document.getElementById("regPhone").value || "").trim();
  var ffUid = (document.getElementById("regFfUid").value || "").trim();
  var ffUser = (document.getElementById("regFfUsername").value || "").trim();
  var errDiv = document.getElementById("registerError");

  errDiv.classList.remove("show");

  if (u.length < 3) {
    errDiv.textContent = "Username must be at least 3 characters long.";
    errDiv.classList.add("show");
    return;
  }
  if (p.length < 8) {
    errDiv.textContent = "Password must be at least 8 characters long.";
    errDiv.classList.add("show");
    return;
  }
  if (!email.includes("@")) {
    errDiv.textContent = "Please enter a valid email address.";
    errDiv.classList.add("show");
    return;
  }
  if (phone.length < 6) {
    errDiv.textContent = "Please enter a valid phone number.";
    errDiv.classList.add("show");
    return;
  }

  try {
    const res = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username: u,
        email: email,
        password: p,
        phone: phone,
        freeFireUid: ffUid,
        freeFireUsername: ffUser
      })
    });

    if (res.success) {
      showToast("Account created successfully. Please login.");
      switchAuthTab('login');
      document.getElementById("loginUsername").value = u;
      document.getElementById("loginPassword").focus();
    }
  } catch (err) {
    errDiv.textContent = err.message;
    errDiv.classList.add("show");
  }
}

async function logoutPlayer() {
  if (state.currentUser) {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (e) {}
  }
  state.currentUser = null;
  localStorage.removeItem("ax_session_token");
  sessionStorage.removeItem("ax_session_token");
  await updatePlayerContext();
  updateAuthOverlayVisibility();
  setView("tournaments");
  showToast("Logged out successfully.");
}

async function updatePlayerContext() {
  var topbarPill = document.querySelector(".profile-pill");
  var topAvatar = document.querySelector(".avatar");
  var card = document.getElementById("playerProfileCard");
  
  if (state.currentUser) {
    var letter = state.currentUser.name.charAt(0).toUpperCase();
    if (topAvatar) topAvatar.textContent = letter;
    if (topbarPill) topbarPill.style.display = "flex";
    if (card) {
      card.style.display = "block";
      document.getElementById("profileAvatar").textContent = letter;
      document.getElementById("profileUsername").textContent = state.currentUser.name;
      document.getElementById("profileEmail").textContent = state.currentUser.email;
      document.getElementById("profilePhone").textContent = state.currentUser.phone;
      document.getElementById("profileFfUid").textContent = state.currentUser.freeFireUid;
      document.getElementById("profileFfUsername").textContent = state.currentUser.freeFireUsername;
    }

    try {
      const res = await apiFetch("/api/auth/session");
      if (res.success) {
        state._walletBalance = Number(res.wallet);
        state._walletFrozen = !!res.frozen;
        state._withdrawalsBlocked = !!res.withdrawalsBlocked;
      }
    } catch (e) {}

    try {
      const res = await apiFetch("/api/wallet/history");
      if (res.success && res.ledger) {
        state.ledger = res.ledger;
      }
    } catch (e) {}

    try {
      const res = await apiFetch("/api/payments");
      if (res.success && res.payments) {
        state.paymentRequests = res.payments;
        state.requests = res.payments
          .filter(p => p.status === 'Pending Verification')
          .map(p => ({
            id: p.request_id,
            type: 'Deposit',
            userId: p.user_id,
            user: p.username || state.currentUser.name,
            amount: p.amount,
            status: p.status,
            reason: `UTR: ${p.utr_number}`
          }));
      }
    } catch (e) {}

    try {
      const res = await apiFetch("/api/notifications");
      if (res.success && res.notifications && res.notifications.length > 0) {
        res.notifications.forEach(n => {
          showToast(`🔔 ${n.title}: ${n.message}`);
        });
      }
    } catch (e) {}

  } else {
    if (topbarPill) topbarPill.style.display = "none";
    if (card) card.style.display = "none";
  }

  updateWallet();
  renderLedger();
  renderRequests();
  if (typeof renderUserPayments === "function") renderUserPayments();
  if (typeof renderTournaments === "function") renderTournaments();
}

function updateAuthOverlayVisibility() {
  var hash = window.location.hash.replace("#", "").replace("/", "");
  var overlay = document.getElementById("playerAuthOverlay");
  if (!overlay) return;

  if (state.currentUser || hash === "admin" || state.adminAuthenticated) {
    overlay.classList.remove("active");
  } else {
    overlay.classList.add("active");
    switchAuthTab('login');
  }
}

async function restorePlayerSession() {
  var token = sessionStorage.getItem("ax_session_token") || localStorage.getItem("ax_session_token");
  if (token) {
    try {
      const res = await apiFetch("/api/auth/session");
      if (res.success && res.user) {
        state.currentUser = res.user;
        await updatePlayerContext();
      } else {
        sessionStorage.removeItem("ax_session_token");
        localStorage.removeItem("ax_session_token");
      }
    } catch (e) {
      sessionStorage.removeItem("ax_session_token");
      localStorage.removeItem("ax_session_token");
    }
  }
  updateAuthOverlayVisibility();
}

// Immediately attempt session restore on run
restorePlayerSession();

window.addEventListener("hashchange", updateAuthOverlayVisibility);

// Initial setup triggers
updateWallet();
loadStateFromServer();
renderLedger();
renderRequests();
if (typeof renderLeaderboard === "function") renderLeaderboard();

window.switchAuthTab = switchAuthTab;
window.handlePlayerLogin = handlePlayerLogin;
window.handlePlayerRegister = handlePlayerRegister;
window.requestResetToken = requestResetToken;
window.confirmPasswordReset = confirmPasswordReset;
window.handlePlayerForceReset = handlePlayerForceReset;
window.logoutPlayer = logoutPlayer;
window.updatePlayerContext = updatePlayerContext;
window.updateAuthOverlayVisibility = updateAuthOverlayVisibility;

window.addEventListener("storage", function(e) {
  if (e.key === "ax_session_token") {
    restorePlayerSession();
  }
});


