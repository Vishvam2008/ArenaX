// ============================================================
// ArenaX — Tournament System Module
// Premium cards, detail views, participant management, check-in,
// result verification, prize distribution, analytics, emergency controls.
// Loads AFTER app.js, admin.js, payment.js.
// ============================================================

// --------------- Extend State ---------------
state.tournamentNextId = state.tournamentNextId || 100;
state.activeTournamentView = state.activeTournamentView || null;
state.tournamentStatusFilter = state.tournamentStatusFilter || "all";
state.recentWinners = state.recentWinners || [
  { name: "RogueRavi", tournament: "Free Fire Max Clash", prize: 500, date: "2026-06-12" },
  { name: "NovaAditi", tournament: "Solo Headshot Rush", prize: 250, date: "2026-06-11" },
  { name: "BlazeX", tournament: "Grandmaster Squad Cup", prize: 1200, date: "2026-06-10" }
];
state.hallOfFame = state.hallOfFame || [
  { name: "RogueRavi", earnings: 14200, wins: 14, kills: 86 },
  { name: "NovaAditi", earnings: 11800, wins: 12, kills: 74 },
  { name: "BlazeX", earnings: 9500, wins: 10, kills: 69 }
];
state.playerProfiles = state.playerProfiles || {
  "USR102": { totalTournaments: 6, totalWinnings: 1840, totalWithdrawals: 500, rejectedResults: 0, fraudFlags: [], banHistory: [], isBanned: false }
};

// Enhance existing tournaments with new fields
(function enhanceTournaments() {
  var now = new Date();
  var defaults = {
    description: "", rules: "Standard tournament rules apply. Admin decisions are final.",
    bannerData: null, status: "registration_open",
    totalSlots: 100, filledSlots: 0, participants: [],
    perKill: 5, booyah: 50,
    rankRewards: [{ rank: "1st", amount: 500 }, { rank: "2nd", amount: 300 }, { rank: "3rd", amount: 200 }],
    registrationStart: new Date(now.getTime() - 3600000).toISOString(),
    registrationEnd: new Date(now.getTime() + 7200000).toISOString(),
    matchStartTime: new Date(now.getTime() + 10800000).toISOString(),
    roomReleaseTime: new Date(now.getTime() + 9000000).toISOString(),
    roomId: "", roomPassword: "", roomReleased: false,
    results: [], featured: false, createdAt: now.toISOString(), completedAt: null,
    checkInOpen: false, checkedInPlayers: [],
    emergencyAnnouncement: "", paused: false
  };
  state.tournaments.forEach(function(t) {
    for (var key in defaults) {
      if (!(key in t)) t[key] = defaults[key];
    }
    t.totalSlots = t.playerLimit || t.totalSlots;
    t.perKill = t.rewards ? t.rewards.perKill : t.perKill;
    t.booyah = t.rewards ? t.rewards.booyah : t.booyah;
    if (t.rewards) {
      t.rankRewards = [
        { rank: "1st", amount: t.rewards.rank1 },
        { rank: "2nd", amount: t.rewards.rank2 },
        { rank: "3rd", amount: t.rewards.rank3 },
        { rank: "4th-10th", amount: t.rewards.rank4to10 },
        { rank: "MVP", amount: t.rewards.mvp }
      ];
    }
    // Parse existing slots
    if (typeof t.slots === "string" && t.slots.indexOf("/") !== -1) {
      t.filledSlots = parseInt(t.slots) || 0;
    }
  });
  // Mark first tournament as featured
  if (state.tournaments[0]) state.tournaments[0].featured = true;
})();

// --------------- Status Helpers ---------------
var STATUS_CONFIG = {
  upcoming:              { label: "Upcoming",             color: "var(--accent)",   icon: "\u{1F551}" },
  registration_open:     { label: "Registration Open",    color: "var(--primary)",  icon: "\u2705" },
  registration_closed:   { label: "Registration Closed",  color: "var(--warning)",  icon: "\u{1F512}" },
  live:                  { label: "LIVE",                 color: "#ff4757",         icon: "\uD83D\uDD34" },
  verification_pending:  { label: "Verification Pending", color: "var(--warning)",  icon: "\u23F3" },
  completed:             { label: "Completed",            color: "var(--muted)",    icon: "\uD83C\uDFC6" },
  cancelled:             { label: "Cancelled",            color: "var(--danger)",   icon: "\u274C" },
  paused:                { label: "Paused",               color: "var(--warning)",  icon: "\u23F8" }
};

function getStatusConfig(status) { return STATUS_CONFIG[status] || STATUS_CONFIG.upcoming; }
function getRemainingSlots(t) { return Math.max(0, t.totalSlots - t.filledSlots); }

function isRoomVisible(t) {
  if (t.roomReleased) return true;
  if (!t.roomReleaseTime) return false;
  return new Date() >= new Date(t.roomReleaseTime);
}

function getCountdown(dateStr) {
  var diff = new Date(dateStr) - new Date();
  if (diff <= 0) return "Now";
  var h = Math.floor(diff / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  if (h > 0) return h + "h " + m + "m";
  return m + "m";
}

// --------------- Tournament Profit Preview ---------------
function calculateFinancials(t) {
  var totalCollection = t.filledSlots * t.entryFee;
  var prizePool = t.prizePool;
  var rankBudget = t.rankRewards.reduce(function(s, r) { return s + r.amount; }, 0);
  var perKillBudget = t.perKill * (t.filledSlots * 2);
  var booyahBudget = t.booyah * (t.mode === "Squad" ? Math.ceil(t.totalSlots / 4) : t.totalSlots);
  var platformRevenue = totalCollection - prizePool;
  var estimatedProfit = totalCollection - rankBudget - perKillBudget - booyahBudget;
  return { totalCollection: totalCollection, prizePool: prizePool, rankBudget: rankBudget, perKillBudget: perKillBudget, booyahBudget: booyahBudget, platformRevenue: platformRevenue, estimatedProfit: estimatedProfit };
}

// --------------- Premium Tournament Cards ---------------
var _origRenderTournaments = renderTournaments;
renderTournaments = function() {
  var query = refs.search.value.trim().toLowerCase();
  var items = state.tournaments.filter(function(t) { return t.game === state.game; });

  if (query) {
    items = items.filter(function(t) {
      return [t.title, t.mode, t.map, t.time, t.status, t.description].join(" ").toLowerCase().indexOf(query) !== -1;
    });
  }
  if (state.tournamentStatusFilter !== "all") {
    if (state.tournamentStatusFilter === "my_tournaments") {
      if (!state.currentUser) {
        items = [];
      } else {
        items = items.filter(function(t) {
          return t.participants && t.participants.some(function(p) { return p.userId === state.currentUser.id; });
        });
      }
    } else {
      items = items.filter(function(t) { return t.status === state.tournamentStatusFilter; });
    }
  }
  if (state.sortHighPrize) items = items.slice().sort(function(a, b) { return b.prize - a.prize; });

  // Featured section
  var featured = items.filter(function(t) { return t.featured; });
  var featuredEl = document.getElementById("featuredCarousel");
  if (featuredEl) {
    featuredEl.innerHTML = featured.length ? featured.map(function(t) {
      var sc = getStatusConfig(t.status);
      return '<div class="featured-card" data-view-tournament="' + t.id + '">' +
        (t.bannerData ? '<img class="featured-banner" src="' + safeDataUrl(t.bannerData) + '" alt="' + escapeHTML(t.title) + '">' : '<div class="featured-banner-placeholder">' + escapeHTML(t.title) + '</div>') +
        '<div class="featured-info">' +
          '<span class="tournament-status-dot" style="color:' + sc.color + '">' + sc.icon + ' ' + sc.label + '</span>' +
          '<h3>' + escapeHTML(t.title) + '</h3>' +
          '<div class="featured-meta"><span>' + escapeHTML(t.mode) + '</span><span>' + rupees(t.prize) + ' Prize</span><span>' + rupees(t.entryFee || t.entry) + ' Entry</span></div>' +
        '</div>' +
      '</div>';
    }).join("") : "";
  }

  // Live tournaments
  var liveItems = state.tournaments.filter(function(t) { return t.status === "live"; });
  var liveEl = document.getElementById("liveTournaments");
  if (liveEl) {
    liveEl.innerHTML = liveItems.length ? '<div class="section-label"><span class="live-pulse"></span>Live Now</div>' +
      liveItems.map(function(t) {
        return '<div class="live-card" data-view-tournament="' + Number(t.id) + '"><strong>' + escapeHTML(t.title) + '</strong><span>' + escapeHTML(t.mode) + ' \u2022 ' + escapeHTML(t.map) + '</span></div>';
      }).join("") : "";
  }

  // Main tournament grid
  refs.tournamentList.innerHTML = items.map(function(t) {
    var sc = getStatusConfig(t.status);
    var remaining = getRemainingSlots(t);
    var fillPct = t.totalSlots > 0 ? Math.round((t.filledSlots / t.totalSlots) * 100) : 0;
    var fee = t.entryFee || t.entry || 0;
    var canJoin = t.status === "registration_open" && remaining > 0;
    var disabled = t.game === "bgmi";

    return '<article class="tournament-card-premium" data-view-tournament="' + t.id + '">' +
      '<div class="tcard-header">' +
        '<div class="tcard-title-row">' +
          '<h3 class="tournament-title">' + escapeHTML(t.title) + '</h3>' +
          '<span class="tournament-status-dot" style="color:' + sc.color + '">' + sc.icon + ' ' + sc.label + '</span>' +
        '</div>' +
        '<div class="tcard-badges">' +
          '<span class="mode-badge">' + escapeHTML(t.mode) + '</span>' +
          '<span class="map-badge">' + escapeHTML(t.map) + '</span>' +
          (t.featured ? '<span class="featured-badge">\u2B50 Featured</span>' : '') +
        '</div>' +
      '</div>' +
      '<div class="tcard-stats-grid">' +
        '<div class="tcard-stat"><span>Entry</span><strong>' + (fee ? rupees(fee) : "Free") + '</strong></div>' +
        '<div class="tcard-stat"><span>Prize Pool</span><strong>' + rupees(t.prize) + '</strong></div>' +
        '<div class="tcard-stat"><span>Per Kill</span><strong>' + rupees(t.perKill) + '</strong></div>' +
        '<div class="tcard-stat"><span>Booyah</span><strong>' + rupees(t.booyah) + '</strong></div>' +
      '</div>' +
      '<div class="tcard-slots">' +
        '<div class="slots-info"><span>' + t.filledSlots + '/' + t.totalSlots + ' slots</span><span>' + remaining + ' remaining</span></div>' +
        '<div class="slots-bar"><div class="slots-fill" style="width:' + fillPct + '%"></div></div>' +
      '</div>' +
      '<div class="tcard-times">' +
        '<span>Reg closes: ' + getCountdown(t.registrationEnd) + '</span>' +
        '<span>Match: ' + getCountdown(t.matchStartTime) + '</span>' +
      '</div>' +
      '<div class="tcard-footer">' +
        (canJoin && !disabled ?
          '<button class="primary-action" type="button" data-join-tournament="' + t.id + '">Join Tournament</button>' :
          disabled ? '<button class="secondary-action" type="button" data-join="' + t.id + '">Join Waitlist</button>' :
          '<button class="secondary-action" disabled>Registration ' + (remaining <= 0 ? "Full" : "Closed") + '</button>'
        ) +
        '<button class="ghost-button" type="button" data-view-tournament="' + t.id + '">View Details</button>' +
      '</div>' +
    '</article>';
  }).join("");

  if (!items.length) {
    refs.tournamentList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">\uD83C\uDFAE</div><span>No tournaments found for this game. Try a different filter.</span></div>';
  }

  // Recent Winners
  var winnersEl = document.getElementById("recentWinners");
  if (winnersEl && state.recentWinners.length) {
    winnersEl.innerHTML = '<div class="section-label">\uD83C\uDFC6 Recent Winners</div>' +
      state.recentWinners.map(function(w) {
        return '<div class="winner-card"><strong>' + escapeHTML(w.name) + '</strong><span>' + escapeHTML(w.tournament) + '</span><span class="winner-prize">' + rupees(w.prize) + '</span></div>';
      }).join("");
  }

  renderTournamentOptions();
};

// --------------- Tournament Detail View ---------------
function showTournamentDetail(id) {
  var t = state.tournaments.find(function(x) { return x.id === id; });
  if (!t) return;
  state.activeTournamentView = id;
  renderTournamentDetail(t);
  var detailView = document.getElementById("tournamentDetail");
  if (detailView) detailView.classList.add("active");
}

function closeTournamentDetail() {
  state.activeTournamentView = null;
  var detailView = document.getElementById("tournamentDetail");
  if (detailView) detailView.classList.remove("active");
}

function renderTournamentDetail(t) {
  var content = document.getElementById("tournamentDetailContent");
  if (!content) return;
  var sc = getStatusConfig(t.status);
  var remaining = getRemainingSlots(t);
  var fee = t.entryFee || t.entry || 0;
  var roomVisible = isRoomVisible(t);
  var canJoin = t.status === "registration_open" && remaining > 0;
  var approvedParticipants = t.participants.filter(function(p) { return p.status === "approved"; });

  content.innerHTML =
    // Hero
    '<div class="detail-hero">' +
      '<button class="detail-close-btn" type="button" id="closeTournamentDetail">\u2715</button>' +
      '<div class="detail-hero-info">' +
        '<span class="tournament-status-dot" style="color:' + sc.color + '">' + sc.icon + ' ' + sc.label + '</span>' +
        '<h2>' + escapeHTML(t.title) + '</h2>' +
        '<div class="detail-hero-meta"><span>' + escapeHTML(t.game.toUpperCase()) + '</span><span>' + escapeHTML(t.mode) + '</span><span>' + escapeHTML(t.map) + '</span></div>' +
      '</div>' +
    '</div>' +

    // Emergency announcement
    (t.emergencyAnnouncement ? '<div class="emergency-banner">\u26A0 ' + escapeHTML(t.emergencyAnnouncement) + '</div>' : '') +

    // Info grid
    '<div class="detail-info-grid">' +
      '<div class="detail-info-card">' +
        '<strong>Prize Breakdown</strong>' +
        '<div class="prize-breakdown">' +
          t.rankRewards.map(function(r) { return '<div class="prize-row"><span>' + r.rank + '</span><strong>' + rupees(r.amount) + '</strong></div>'; }).join("") +
          '<div class="prize-row"><span>Per Kill</span><strong>' + rupees(t.perKill) + '</strong></div>' +
          '<div class="prize-row"><span>Booyah Bonus</span><strong>' + rupees(t.booyah) + '</strong></div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-info-card">' +
        '<strong>Timing</strong>' +
        '<div class="timing-list">' +
          '<div><span>Registration</span><strong>' + new Date(t.registrationStart).toLocaleString("en-IN", {hour:"2-digit",minute:"2-digit"}) + ' \u2013 ' + new Date(t.registrationEnd).toLocaleString("en-IN", {hour:"2-digit",minute:"2-digit"}) + '</strong></div>' +
          '<div><span>Match Start</span><strong>' + new Date(t.matchStartTime).toLocaleString("en-IN") + '</strong></div>' +
          '<div><span>Room Release</span><strong>' + (roomVisible ? "Released" : getCountdown(t.roomReleaseTime)) + '</strong></div>' +
        '</div>' +
      '</div>' +
      '<div class="detail-info-card">' +
        '<strong>Slots</strong>' +
        '<div class="timing-list">' +
          '<div><span>Total</span><strong>' + t.totalSlots + '</strong></div>' +
          '<div><span>Filled</span><strong>' + t.filledSlots + '</strong></div>' +
          '<div><span>Remaining</span><strong>' + remaining + '</strong></div>' +
          '<div><span>Entry Fee</span><strong>' + (fee ? rupees(fee) : "Free") + '</strong></div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    // Room card
    '<div class="room-reveal-card">' +
      '<strong>Room Details</strong>' +
      (roomVisible && t.roomId ?
        '<div class="room-details-visible"><div><span>Room ID</span><strong>' + escapeHTML(t.roomId) + '</strong></div><div><span>Password</span><strong>' + escapeHTML(t.roomPassword) + '</strong></div></div>'
        : '<div class="room-hidden"><span>\uD83D\uDD12 Room details will be revealed ' + (t.roomReleaseTime ? getCountdown(t.roomReleaseTime) + ' before match' : 'by admin') + '</span></div>'
      ) +
    '</div>' +

    // Rules
    '<div class="detail-info-card"><strong>Rules</strong><p class="muted">' + escapeHTML(t.rules || "Standard rules apply.") + '</p></div>' +

    // Join / Check-in
    (canJoin ? '<button class="primary-action full-width" type="button" data-join-tournament="' + t.id + '">Join Tournament \u2014 ' + rupees(fee) + '</button>' : '') +
    (t.checkInOpen && t.participants.find(function(p) { return p.userId === state.currentUser.id && p.status === "approved"; }) ?
      '<button class="primary-action full-width" type="button" data-checkin-tournament="' + t.id + '">\u2705 Check In</button>' : '') +

    // Participants
    '<div class="participant-section">' +
      '<strong>Participants (' + approvedParticipants.length + '/' + t.totalSlots + ')</strong>' +
      '<div class="participant-list">' +
        (approvedParticipants.length ? approvedParticipants.map(function(p, i) {
          var checkedIn = t.checkedInPlayers.indexOf(p.userId) !== -1;
          return '<div class="participant-row">' +
            '<span>#' + (i + 1) + '</span>' +
            '<strong>' + escapeHTML(p.userName) + '</strong>' +
            '<span>' + new Date(p.joinedAt).toLocaleString("en-IN") + '</span>' +
            (t.checkInOpen ? '<span class="status-badge status-badge--' + (checkedIn ? 'approved' : 'pending') + '">' + (checkedIn ? 'Checked In' : 'Absent') + '</span>' : '') +
          '</div>';
        }).join("") : '<div class="empty-state"><span>No approved participants yet</span></div>') +
      '</div>' +
    '</div>' +

    // Result submission (if verification_pending)
    (t.status === "verification_pending" ?
      '<div class="result-submission-section">' +
        '<strong>Submit Your Result</strong>' +
        '<div class="result-form">' +
          '<label>Final Screenshot<input type="file" accept="image/*" id="resultScreenshot-' + t.id + '"></label>' +
          '<label>Kills<input type="number" min="0" id="resultKills-' + t.id + '" value="0"></label>' +
          '<label>Rank Position<input type="number" min="1" id="resultRank-' + t.id + '" value="1"></label>' +
          '<label><input type="checkbox" id="resultBooyah-' + t.id + '"> Claimed Booyah</label>' +
          '<button class="primary-action" type="button" data-submit-result="' + t.id + '">Submit Result</button>' +
        '</div>' +
      '</div>' : '');
}

// --------------- Gating Helper ---------------
function checkAdminGuard() {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized administrative operation.");
    return false;
  }
  return true;
}

// --------------- Participant Management ---------------
async function joinTournament(id) {
  var t = state.tournaments.find(function(x) { return x.id === id; });
  if (!t) return;
  if (t.status !== "registration_open") { showToast("Registration is not open."); return; }
  
  showToast("Submitting entry request...");
  try {
    const res = await apiFetch("/api/tournaments/join", {
      method: "POST",
      body: JSON.stringify({ tournamentId: id })
    });
    if (res.success) {
      showToast("Successfully joined " + t.title + "!");
      if (typeof updatePlayerContext === "function") {
        await updatePlayerContext();
      }
    }
  } catch (err) {
    showToast("Failed to join: " + err.message);
  }
}

function approveParticipant(tournamentId, userId) {
  if (!checkAdminGuard()) return;
  showToast("Approving participant...");
  adminApiFetch("/api/admin/participants/action", {
    method: "POST",
    body: { tournamentId: tournamentId, userId: userId, action: "approve" }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Participant approved.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Approval failed: " + err.message);
  });
}

function removeParticipant(tournamentId, userId) {
  if (!checkAdminGuard()) return;
  showToast("Removing participant...");
  adminApiFetch("/api/admin/participants/action", {
    method: "POST",
    body: { tournamentId: tournamentId, userId: userId, action: "delete" }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Participant removed.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Removal failed: " + err.message);
  });
}

function refundParticipant(tournamentId, userId) {
  if (!checkAdminGuard()) return;
  showToast("Refunding participant...");
  adminApiFetch("/api/admin/participants/action", {
    method: "POST",
    body: { tournamentId: tournamentId, userId: userId, action: "refund" }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Participant entry refunded.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Refund failed: " + err.message);
  });
}

function disqualifyParticipant(tournamentId, userId) {
  if (!checkAdminGuard()) return;
  showToast("Disqualifying participant...");
  adminApiFetch("/api/admin/participants/action", {
    method: "POST",
    body: { tournamentId: tournamentId, userId: userId, action: "disqualify" }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Participant disqualified.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Disqualification failed: " + err.message);
  });
}

function exportParticipants(tournamentId) {
  if (!checkAdminGuard()) return;
  var t = state.tournaments.find(function(x) { return x.id === tournamentId; });
  if (!t) return;
  var csv = "Name,UserID,Status,JoinedAt,CheckedIn\n";
  t.participants.forEach(function(p) {
    csv += p.userName + "," + p.userId + "," + p.status + "," + p.joinedAt + "," + (t.checkedInPlayers.indexOf(p.userId) !== -1) + "\n";
  });
  var blob = new Blob([csv], { type: "text/csv" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = t.title.replace(/\s+/g, "_") + "_participants.csv";
  a.click();
  showToast("Participant list exported.");
}

// --------------- Check-In System ---------------
function openCheckIn(tournamentId) {
  if (!checkAdminGuard()) return;
  var t = state.tournaments.find(function(x) { return x.id === tournamentId; });
  if (!t) return;
  t.checkInOpen = true;
  audit("Admin opened check-in for " + t.title + ".");
  renderAdminTournaments();
  showToast("Check-in opened for " + t.title + ".");
}

function closeCheckIn(tournamentId) {
  if (!checkAdminGuard()) return;
  var t = state.tournaments.find(function(x) { return x.id === tournamentId; });
  if (!t) return;
  t.checkInOpen = false;
  audit("Admin closed check-in for " + t.title + ".");
  renderAdminTournaments();
  showToast("Check-in closed.");
}

function playerCheckIn(tournamentId) {
  var t = state.tournaments.find(function(x) { return x.id === tournamentId; });
  if (!t || !t.checkInOpen) { showToast("Check-in is not open."); return; }
  if (t.checkedInPlayers.indexOf(state.currentUser.id) !== -1) { showToast("Already checked in."); return; }
  t.checkedInPlayers.push(state.currentUser.id);
  audit(state.currentUser.name + " checked in for " + t.title + ".");
  if (state.activeTournamentView === tournamentId) renderTournamentDetail(t);
  showToast("Checked in for " + t.title + "!");
}

// --------------- Result Verification ---------------
async function submitResult(tournamentId) {
  var t = state.tournaments.find(function(x) { return x.id === tournamentId; });
  if (!t) return;
  var fileInput = document.getElementById("resultScreenshot-" + tournamentId);
  var kills = Number(document.getElementById("resultKills-" + tournamentId)?.value) || 0;
  var rank = Number(document.getElementById("resultRank-" + tournamentId)?.value) || 0;
  var booyahClaimed = document.getElementById("resultBooyah-" + tournamentId)?.checked || false;

  if (!fileInput || !fileInput.files || !fileInput.files[0]) { showToast("Upload result screenshot."); return; }

  var file = fileInput.files[0];
  var reader = new FileReader();
  reader.onload = async function(e) {
    showToast("Submitting match results...");
    try {
      const res = await apiFetch("/api/tournaments/result", {
        method: "POST",
        body: JSON.stringify({
          tournamentId: tournamentId,
          kills: kills,
          rank: rank,
          booyah: booyahClaimed,
          screenshotFilename: state.currentUser.id + "_" + tournamentId + "_" + Date.now() + ".jpg",
          screenshotData: e.target.result
        })
      });
      if (res.success) {
        showToast("Results submitted for verification.");
        if (typeof updatePlayerContext === "function") {
          await updatePlayerContext();
        }
      }
    } catch (err) {
      showToast("Failed to submit: " + err.message);
    }
  };
  reader.readAsDataURL(file);
}

function approveResult(tournamentId, participantId) {
  if (!checkAdminGuard()) return;
  showToast("Approving result...");
  adminApiFetch("/api/admin/tournaments/result/action", {
    method: "POST",
    body: { tournamentId: tournamentId, participantId: participantId, action: "approve" }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Result approved.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Approval failed: " + err.message);
  });
}

function rejectResult(tournamentId, participantId) {
  if (!checkAdminGuard()) return;
  showToast("Rejecting result...");
  adminApiFetch("/api/admin/tournaments/result/action", {
    method: "POST",
    body: { tournamentId: tournamentId, participantId: participantId, action: "reject" }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Result rejected.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Rejection failed: " + err.message);
  });
}

function approveRewards(tournamentId) {
  if (!checkAdminGuard()) return;
  showToast("Distributing rewards...");
  adminApiFetch("/api/admin/tournaments/rewards", {
    method: "POST",
    body: { tournamentId: tournamentId }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Rewards distributed and tournament completed.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Rewards failed: " + err.message);
  });
}

function pauseTournament(id) {
  if (!checkAdminGuard()) return;
  var t = state.tournaments.find(function(x) { return x.id === id; });
  if (!t) return;
  var newPaused = !t.paused;
  var newStatus = newPaused ? "paused" : "registration_open";
  adminApiFetch("/api/admin/tournaments/status", {
    method: "POST",
    body: { tournamentId: id, status: newStatus }
  })
  .then(function(res) {
    if (res.success) {
      showToast(t.title + (newPaused ? " paused." : " resumed."));
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Failed to pause/resume: " + err.message);
  });
}

function cancelTournament(id) {
  if (!checkAdminGuard()) return;
  adminApiFetch("/api/admin/tournaments/status", {
    method: "POST",
    body: { tournamentId: id, status: "cancelled" }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Tournament cancelled.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Cancellation failed: " + err.message);
  });
}

function refundAllPlayers(id) {
  if (!checkAdminGuard()) return;
  var t = state.tournaments.find(function(x) { return x.id === id; });
  if (!t) return;
  var approved = t.participants.filter(function(p) { return p.status === "approved" && !p.refunded; });
  if (approved.length === 0) {
    showToast("No players to refund.");
    return;
  }
  showToast("Refunding " + approved.length + " players...");
  var promises = approved.map(function(p) {
    return adminApiFetch("/api/admin/participants/action", {
      method: "POST",
      body: { tournamentId: id, userId: p.userId, action: "refund" }
    });
  });
  Promise.all(promises)
  .then(function() {
    showToast("All players refunded successfully.");
    syncAdminTournaments();
  })
  .catch(function(err) {
    showToast("Some refunds failed: " + err.message);
    syncAdminTournaments();
  });
}

function sendEmergencyAnnouncement(id) {
  if (!checkAdminGuard()) return;
  var msg = prompt("Enter emergency announcement / notification message:");
  if (!msg) return;
  adminApiFetch("/api/admin/tournaments/status", {
    method: "POST",
    body: { tournamentId: id, announcement: msg }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Notification sent to all participants.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Failed to send: " + err.message);
  });
}

function changeRoomDetails(id) {
  if (!checkAdminGuard()) return;
  var t = state.tournaments.find(function(x) { return x.id === id; });
  if (!t) return;
  var newRoom = prompt("New Room ID:", t.roomId);
  var newPass = prompt("New Password:", t.roomPassword);
  if (newRoom === null && newPass === null) return;
  adminApiFetch("/api/admin/tournaments/status", {
    method: "POST",
    body: { tournamentId: id, roomId: newRoom !== null ? newRoom : t.roomId, roomPassword: newPass !== null ? newPass : t.roomPassword }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Room details updated.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Failed to update room: " + err.message);
  });
}

function updateTournamentStatus(id, newStatus) {
  if (!checkAdminGuard()) return;
  adminApiFetch("/api/admin/tournaments/status", {
    method: "POST",
    body: { tournamentId: id, status: newStatus }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Tournament status updated.");
      syncAdminTournaments();
    }
  })
  .catch(function(err) {
    showToast("Status update failed: " + err.message);
  });
}

// --------------- Player Risk & Fraud Tracking ---------------
function renderPlayerProfile(userId) {
  var p = state.playerProfiles[userId];
  if (!p) return '<div class="empty-state"><span>No data for this player</span></div>';
  return '<div class="player-risk-card">' +
    '<div class="risk-grid">' +
      '<div><span>Tournaments</span><strong>' + p.totalTournaments + '</strong></div>' +
      '<div><span>Winnings</span><strong>' + rupees(p.totalWinnings) + '</strong></div>' +
      '<div><span>Withdrawals</span><strong>' + rupees(p.totalWithdrawals) + '</strong></div>' +
      '<div><span>Rejected Results</span><strong style="color:' + (p.rejectedResults > 2 ? 'var(--danger)' : 'inherit') + '">' + p.rejectedResults + '</strong></div>' +
    '</div>' +
    (p.fraudFlags.length ? '<div class="fraud-flags"><strong>Fraud Flags</strong>' + p.fraudFlags.map(function(f) { return '<div class="duplicate-banner">' + escapeHTML(f) + '</div>'; }).join("") + '</div>' : '') +
    (p.banHistory.length ? '<div class="ban-history"><strong>Ban History</strong>' + p.banHistory.map(function(b) { return '<div class="admin-remark">' + escapeHTML(b) + '</div>'; }).join("") + '</div>' : '') +
    '<span class="status-badge status-badge--' + (p.isBanned ? 'rejected' : 'approved') + '">' + (p.isBanned ? 'BANNED' : 'Active') + '</span>' +
  '</div>';
}

function banPlayer(userId) {
  if (!checkAdminGuard()) return;
  var profile = state.playerProfiles[userId] || { isBanned: false };
  var newBan = !profile.isBanned;
  adminApiFetch("/api/admin/users/status", {
    method: "POST",
    body: { userId: userId, isBanned: newBan }
  })
  .then(function(res) {
    if (res.success) {
      showToast("Player " + userId + " " + (newBan ? "banned" : "unbanned") + ".");
      syncAdminUsers();
    }
  })
  .catch(function(err) {
    showToast("Failed to ban/unban player: " + err.message);
  });
}

// --------------- Tournament Analytics ---------------
function renderTournamentAnalytics() {
  var el = document.getElementById("tournamentAnalytics");
  if (!el) return;
  var totalReg = state.tournaments.reduce(function(s, t) { return s + t.filledSlots; }, 0);
  var totalRevenue = state.tournaments.reduce(function(s, t) { return s + (t.filledSlots * (t.entryFee || t.entry || 0)); }, 0);
  var totalPrize = state.tournaments.reduce(function(s, t) { return s + t.prize; }, 0);
  var totalRefunds = state.requests.filter(function(r) { return r.type === "Refund"; }).length;
  var profit = totalRevenue - totalPrize;

  el.innerHTML =
    '<div class="analytics-grid">' +
      '<div class="analytics-stat"><span>Total Registrations</span><strong>' + totalReg + '</strong></div>' +
      '<div class="analytics-stat"><span>Total Revenue</span><strong>' + rupees(totalRevenue) + '</strong></div>' +
      '<div class="analytics-stat"><span>Prize Pool Committed</span><strong>' + rupees(totalPrize) + '</strong></div>' +
      '<div class="analytics-stat"><span>Platform Profit</span><strong style="color:' + (profit >= 0 ? 'var(--primary)' : 'var(--danger)') + '">' + rupees(profit) + '</strong></div>' +
      '<div class="analytics-stat"><span>Refunds Issued</span><strong>' + totalRefunds + '</strong></div>' +
      '<div class="analytics-stat"><span>Active Tournaments</span><strong>' + state.tournaments.filter(function(t) { return t.status !== "completed" && t.status !== "cancelled"; }).length + '</strong></div>' +
    '</div>';
}

// --------------- Admin Tournament Management ---------------
function renderAdminTournaments() {
  var container = document.getElementById("adminTournamentList");
  if (!container || !state.adminAuthenticated) return;

  container.innerHTML = state.tournaments.map(function(t) {
    var sc = getStatusConfig(t.status);
    var fin = calculateFinancials(t);
    var pending = t.participants.filter(function(p) { return p.status === "pending"; });
    var approved = t.participants.filter(function(p) { return p.status === "approved"; });
    var pendingResults = t.results.filter(function(r) { return r.proofStatus === "pending"; });

    return '<div class="admin-tournament-card">' +
      '<div class="admin-tcard-header">' +
        '<div><strong>' + escapeHTML(t.title) + '</strong><span>' + escapeHTML(t.game.toUpperCase()) + ' \u2022 ' + escapeHTML(t.mode) + ' \u2022 ' + escapeHTML(t.map) + '</span></div>' +
        '<span class="tournament-status-dot" style="color:' + sc.color + '">' + sc.icon + ' ' + sc.label + '</span>' +
      '</div>' +

      // Profit preview
      '<div class="profit-preview">' +
        '<div><span>Collection</span><strong>' + rupees(fin.totalCollection) + '</strong></div>' +
        '<div><span>Prize Pool</span><strong>' + rupees(fin.prizePool) + '</strong></div>' +
        '<div><span>Kill Budget</span><strong>' + rupees(fin.perKillBudget) + '</strong></div>' +
        '<div><span>Booyah Budget</span><strong>' + rupees(fin.booyahBudget) + '</strong></div>' +
        '<div><span>Revenue</span><strong>' + rupees(fin.platformRevenue) + '</strong></div>' +
        '<div><span>Est. Profit</span><strong style="color:' + (fin.estimatedProfit >= 0 ? 'var(--primary)' : 'var(--danger)') + '">' + rupees(fin.estimatedProfit) + '</strong></div>' +
      '</div>' +

      // Pending entries
      (pending.length ? '<div class="pending-entries"><strong>Pending Entry Approvals (' + pending.length + ')</strong>' +
        pending.map(function(p) {
          return '<div class="participant-admin-row">' +
            '<span>' + escapeHTML(p.userName) + ' (' + escapeHTML(p.userId) + ')</span>' +
            '<div><button type="button" data-approve-participant="' + t.id + '|' + p.userId + '">\u2713</button>' +
            '<button type="button" data-remove-participant="' + t.id + '|' + p.userId + '">\u2715</button></div>' +
          '</div>';
        }).join("") + '</div>' : '') +

      // Approved participants
      '<div class="approved-participants"><strong>Approved (' + approved.length + '/' + t.totalSlots + ')</strong>' +
        (approved.length ? approved.map(function(p) {
          var ci = t.checkedInPlayers.indexOf(p.userId) !== -1;
          return '<div class="participant-admin-row">' +
            '<span>' + escapeHTML(p.userName) + (ci ? ' \u2705' : '') + '</span>' +
            '<div>' +
              '<button type="button" data-refund-participant="' + t.id + '|' + p.userId + '">Refund</button>' +
              '<button type="button" data-dq-participant="' + t.id + '|' + p.userId + '">DQ</button>' +
            '</div>' +
          '</div>';
        }).join("") : '<span class="muted">None</span>') +
        '<button class="ghost-button" type="button" data-export-participants="' + t.id + '">Export CSV</button>' +
      '</div>' +

      // Pending results
      (pendingResults.length ? '<div class="pending-results"><strong>Pending Results (' + pendingResults.length + ')</strong>' +
        pendingResults.map(function(r) {
          return '<div class="result-review-row">' +
            '<img src="' + safeDataUrl(r.proofScreenshot) + '" class="result-thumb" data-lightbox-src="' + safeDataUrl(r.proofScreenshot) + '">' +
            '<div><strong>' + escapeHTML(r.userName) + '</strong><span>Rank: ' + safeNumber(r.rank) + ' | Kills: ' + safeNumber(r.kills) + (r.booyahClaimed ? ' | Booyah' : '') + '</span></div>' +
            '<div>' +
              '<button type="button" data-approve-result="' + t.id + '|' + r.participantId + '">\u2713</button>' +
              '<button type="button" data-reject-result="' + t.id + '|' + r.participantId + '">\u2715</button>' +
            '</div>' +
          '</div>';
        }).join("") + '</div>' : '') +

      // Status controls
      '<div class="tournament-controls">' +
        '<label>Status <select data-status-change="' + t.id + '">' +
          Object.keys(STATUS_CONFIG).map(function(s) { return '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + STATUS_CONFIG[s].label + '</option>'; }).join("") +
        '</select></label>' +
        '<label>Room ID <input type="text" value="' + escapeHTML(t.roomId || '') + '" data-room-id="' + Number(t.id) + '"></label>' +
        '<label>Password <input type="text" value="' + escapeHTML(t.roomPassword || '') + '" data-room-pass="' + Number(t.id) + '"></label>' +
        '<div class="tournament-action-btns">' +
          '<button type="button" data-save-room="' + t.id + '">Save Room</button>' +
          '<button type="button" data-release-room="' + t.id + '">Release Room</button>' +
          '<button type="button" data-open-checkin="' + t.id + '">' + (t.checkInOpen ? 'Close Check-In' : 'Open Check-In') + '</button>' +
          '<button type="button" data-approve-rewards="' + t.id + '">Approve Rewards</button>' +
          '<button type="button" data-pause-tournament="' + t.id + '">' + (t.paused ? 'Resume' : 'Pause') + '</button>' +
          '<button type="button" data-cancel-tournament="' + t.id + '">Cancel</button>' +
          '<button type="button" data-refund-all="' + t.id + '">Refund All</button>' +
          '<button type="button" data-emergency-msg="' + t.id + '">Emergency Msg</button>' +
          '<button type="button" data-change-room="' + t.id + '">Change Room</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join("");
}

// --------------- Admin Tournament Builder (Enhanced) ---------------
function createEnhancedTournament() {
  var form = document.getElementById("adminTournamentForm");
  if (!form) return;
  var fd = new FormData(form);

  var bannerInput = document.getElementById("tournamentBanner");
  var handleBanner = function(bannerData) {
    var t = {
      game: state.game,
      title: fd.get("tName"),
      description: fd.get("tDesc") || "",
      rules: fd.get("tRules") || "Standard rules apply.",
      bannerData: bannerData,
      mode: fd.get("tMode"),
      map: fd.get("tMap") || "Custom",
      status: "upcoming",
      totalSlots: Number(fd.get("tSlots")) || 100,
      filledSlots: 0,
      participants: [],
      entry: Number(fd.get("tEntry")) || 0,
      entryFee: Number(fd.get("tEntry")) || 0,
      prize: Number(fd.get("tPrize")) || 0,
      prizePool: Number(fd.get("tPrize")) || 0,
      perKill: Number(fd.get("tPerKill")) || 0,
      booyah: Number(fd.get("tBooyah")) || 0,
      rankRewards: [
        { rank: "1st", amount: Number(fd.get("tRank1")) || 0 },
        { rank: "2nd", amount: Number(fd.get("tRank2")) || 0 },
        { rank: "3rd", amount: Number(fd.get("tRank3")) || 0 },
        { rank: "4th-10th", amount: Number(fd.get("tRank4")) || 0 },
        { rank: "MVP", amount: Number(fd.get("tMvp")) || 0 }
      ],
      rewards: {
        perKill: Number(fd.get("tPerKill")) || 0,
        booyah: Number(fd.get("tBooyah")) || 0,
        rank1: Number(fd.get("tRank1")) || 0,
        rank2: Number(fd.get("tRank2")) || 0,
        rank3: Number(fd.get("tRank3")) || 0,
        rank4to10: Number(fd.get("tRank4")) || 0,
        mvp: Number(fd.get("tMvp")) || 0,
        specialRewards: fd.get("tSpecial") || "Manual review"
      },
      registrationStart: fd.get("tRegStart") ? new Date(fd.get("tRegStart")).toISOString() : new Date().toISOString(),
      registrationEnd: fd.get("tRegEnd") ? new Date(fd.get("tRegEnd")).toISOString() : new Date(Date.now() + 7200000).toISOString(),
      matchStartTime: fd.get("tMatchStart") ? new Date(fd.get("tMatchStart")).toISOString() : new Date(Date.now() + 10800000).toISOString(),
      roomReleaseTime: fd.get("tRoomRelease") ? new Date(fd.get("tRoomRelease")).toISOString() : new Date(Date.now() + 9000000).toISOString(),
      roomId: fd.get("tRoomId") || "",
      roomPassword: fd.get("tRoomPass") || "",
      roomReleased: false,
      results: [],
      featured: document.getElementById("tFeatured")?.checked || false,
      createdAt: new Date().toISOString(),
      completedAt: null,
      time: fd.get("tMatchStart") || "TBD",
      playerLimit: Number(fd.get("tSlots")) || 100,
      teamLimit: Number(fd.get("tSlots")) || 100,
      registration: "Admin window",
      slots: "0/" + (Number(fd.get("tSlots")) || 100),
      checkInOpen: false,
      checkedInPlayers: [],
      emergencyAnnouncement: "",
      paused: false
    };

    showToast("Creating tournament...");
    adminApiFetch("/api/admin/tournaments", {
      method: "POST",
      body: t
    })
    .then(function(res) {
      if (res.success) {
        showToast("Tournament '" + t.title + "' created.");
        form.reset();
        syncAdminTournaments();
      }
    })
    .catch(function(err) {
      showToast("Failed to create tournament: " + err.message);
    });
  };

  if (bannerInput && bannerInput.files && bannerInput.files[0]) {
    var reader = new FileReader();
    reader.onload = function(e) { handleBanner(e.target.result); };
    reader.readAsDataURL(bannerInput.files[0]);
  } else {
    handleBanner(null);
  }
}

// --------------- Event Delegation ---------------
document.addEventListener("click", function(e) {
  // View tournament detail
  var viewBtn = e.target.closest("[data-view-tournament]");
  if (viewBtn && !e.target.closest("button[data-join-tournament]")) {
    showTournamentDetail(Number(viewBtn.dataset.viewTournament));
    return;
  }

  // Join tournament
  var joinBtn = e.target.closest("[data-join-tournament]");
  if (joinBtn) { joinTournament(Number(joinBtn.dataset.joinTournament)); return; }

  // Close detail
  if (e.target.closest("#closeTournamentDetail")) { closeTournamentDetail(); return; }

  // Check-in
  var ciBtn = e.target.closest("[data-checkin-tournament]");
  if (ciBtn) { playerCheckIn(Number(ciBtn.dataset.checkinTournament)); return; }

  // Submit result
  var srBtn = e.target.closest("[data-submit-result]");
  if (srBtn) { submitResult(Number(srBtn.dataset.submitResult)); return; }

  // --- Admin actions ---
  var ap = e.target.closest("[data-approve-participant]");
  if (ap) { var parts = ap.dataset.approveParticipant.split("|"); approveParticipant(Number(parts[0]), parts[1]); return; }

  var rp = e.target.closest("[data-remove-participant]");
  if (rp) { var parts2 = rp.dataset.removeParticipant.split("|"); removeParticipant(Number(parts2[0]), parts2[1]); return; }

  var rfp = e.target.closest("[data-refund-participant]");
  if (rfp) { var parts3 = rfp.dataset.refundParticipant.split("|"); refundParticipant(Number(parts3[0]), parts3[1]); return; }

  var dqp = e.target.closest("[data-dq-participant]");
  if (dqp) { var parts4 = dqp.dataset.dqParticipant.split("|"); disqualifyParticipant(Number(parts4[0]), parts4[1]); return; }

  var exp = e.target.closest("[data-export-participants]");
  if (exp) { exportParticipants(Number(exp.dataset.exportParticipants)); return; }

  var ar = e.target.closest("[data-approve-result]");
  if (ar) { var parts5 = ar.dataset.approveResult.split("|"); approveResult(Number(parts5[0]), parts5[1]); return; }

  var rr = e.target.closest("[data-reject-result]");
  if (rr) { var parts6 = rr.dataset.rejectResult.split("|"); rejectResult(Number(parts6[0]), parts6[1]); return; }

  var awr = e.target.closest("[data-approve-rewards]");
  if (awr) { approveRewards(Number(awr.dataset.approveRewards)); return; }

  var pt = e.target.closest("[data-pause-tournament]");
  if (pt) { pauseTournament(Number(pt.dataset.pauseTournament)); return; }

  var ct = e.target.closest("[data-cancel-tournament]");
  if (ct) { cancelTournament(Number(ct.dataset.cancelTournament)); return; }

  var ra = e.target.closest("[data-refund-all]");
  if (ra) { refundAllPlayers(Number(ra.dataset.refundAll)); return; }

  var em = e.target.closest("[data-emergency-msg]");
  if (em) { sendEmergencyAnnouncement(Number(em.dataset.emergencyMsg)); return; }

  var cr = e.target.closest("[data-change-room]");
  if (cr) { changeRoomDetails(Number(cr.dataset.changeRoom)); return; }

  var rl = e.target.closest("[data-release-room]");
  if (rl) {
    var tid = Number(rl.dataset.releaseRoom);
    adminApiFetch("/api/admin/tournaments/status", {
      method: "POST",
      body: { tournamentId: tid, roomReleased: true }
    })
    .then(function(res) {
      if (res.success) {
        showToast("Room released.");
        syncAdminTournaments();
      }
    })
    .catch(function(err) {
      showToast("Release failed: " + err.message);
    });
    return;
  }

  var sv = e.target.closest("[data-save-room]");
  if (sv) {
    var tid2 = Number(sv.dataset.saveRoom);
    var ri = document.querySelector('[data-room-id="' + tid2 + '"]');
    var rp2 = document.querySelector('[data-room-pass="' + tid2 + '"]');
    adminApiFetch("/api/admin/tournaments/status", {
      method: "POST",
      body: { tournamentId: tid2, roomId: ri ? ri.value : "", roomPassword: rp2 ? rp2.value : "" }
    })
    .then(function(res) {
      if (res.success) {
        showToast("Room saved.");
        syncAdminTournaments();
      }
    })
    .catch(function(err) {
      showToast("Save failed: " + err.message);
    });
    return;
  }

  var oci = e.target.closest("[data-open-checkin]");
  if (oci) {
    var tid3 = Number(oci.dataset.openCheckin);
    var tt3 = state.tournaments.find(function(x) { return x.id === tid3; });
    if (tt3) { tt3.checkInOpen ? closeCheckIn(tid3) : openCheckIn(tid3); }
    return;
  }

  // Create tournament
  if (e.target.closest("#createTournamentBtn")) { createEnhancedTournament(); return; }

  // Tournament status filter
  var sf = e.target.closest("[data-tournament-status-filter]");
  if (sf) {
    state.tournamentStatusFilter = sf.dataset.tournamentStatusFilter;
    document.querySelectorAll(".tournament-filter-tab").forEach(function(tab) { tab.classList.toggle("active", tab === sf); });
    renderTournaments();
    return;
  }
});

// Status change dropdown
document.addEventListener("change", function(e) {
  var sc = e.target.closest("[data-status-change]");
  if (sc) { updateTournamentStatus(Number(sc.dataset.statusChange), sc.value); }
});

// --------------- Initialize ---------------
renderTournaments();
