// ============================================================
// ArenaX — Admin Security Module
// Handles authentication, admin management, and route gating.
// Loads AFTER app.js. Extends global state and patches setView.
// ============================================================

// --------------- Admin Storage (localStorage) ---------------
(function initAdminStorage() {
  if (!localStorage.getItem("ax_admins")) {
    localStorage.setItem("ax_admins", JSON.stringify([{
      id: "ADM001",
      username: "admin",
      passwordHash: btoa("arenax2026"),
      role: "super",
      active: true,
      createdAt: new Date().toISOString()
    }]));
  }
})();

function getAdmins() {
  return JSON.parse(localStorage.getItem("ax_admins") || "[]");
}

function saveAdmins(admins) {
  localStorage.setItem("ax_admins", JSON.stringify(admins));
  if (state.adminSession && state.adminSession.authHeader) {
    fetch("http://localhost:4400/api/admins", {
      method: "POST",
      headers: {
        'Authorization': state.adminSession.authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(admins)
    }).catch(function(err) { console.warn("Could not save admins to server:", err); });
  }
}

// --------------- Extend Global State ---------------
state.adminAuthenticated = false;
state.adminSession = null;

// --------------- Login / Logout ---------------
function showAdminLogin() {
  var overlay = document.getElementById("adminLoginOverlay");
  if (!overlay) return;
  overlay.classList.add("active");
  var err = document.getElementById("adminLoginError");
  if (err) err.classList.remove("show");
  var u = document.getElementById("adminUsername");
  var p = document.getElementById("adminPassword");
  if (u) { u.value = ""; }
  if (p) { p.value = ""; }
  setTimeout(function() { if (u) u.focus(); }, 120);
}

function hideAdminLogin() {
  var overlay = document.getElementById("adminLoginOverlay");
  if (overlay) overlay.classList.remove("active");
}

function loginWithSession(admin, authHeader) {
  state.adminAuthenticated = true;
  state.adminSession = {
    id: admin.id,
    username: admin.username,
    role: admin.role,
    loginAt: new Date().toISOString(),
    authHeader: authHeader
  };
  try { sessionStorage.setItem("ax_session", JSON.stringify(state.adminSession)); } catch(e) {}
  hideAdminLogin();
  setView("admin");
  audit("Admin session started by " + admin.username + " (" + admin.id + ").");
  showToast("Admin access granted. Welcome, " + admin.username + ".");
  if (typeof loadPaymentsFromServer === "function") loadPaymentsFromServer();
  syncAdminsWithServer();
}

function syncAdminsWithServer() {
  if (!state.adminSession || !state.adminSession.authHeader) return;
  fetch("http://localhost:4400/api/admins", {
    headers: { 'Authorization': state.adminSession.authHeader }
  })
  .then(function(res) { return res.json(); })
  .then(function(res) {
    if (res.success && res.admins) {
      localStorage.setItem("ax_admins", JSON.stringify(res.admins));
      renderAdminManagement();
    }
  })
  .catch(function(err) { console.warn("Failed to sync admins with server:", err); });
}

function attemptAdminLogin() {
  var username = (document.getElementById("adminUsername").value || "").trim();
  var password = document.getElementById("adminPassword").value || "";

  var authHeader = 'Basic ' + btoa(username + ':' + password);
  var errDiv = document.getElementById("adminLoginError");
  if (errDiv) errDiv.classList.remove("show");

  fetch("http://localhost:4400/api/admins", {
    headers: { 'Authorization': authHeader }
  })
  .then(function(res) {
    if (res.status === 401) {
      throw new Error("Invalid credentials");
    }
    if (!res.ok) {
      throw new Error("Server error (" + res.status + ")");
    }
    return res.json();
  })
  .then(function(resAdmins) {
    if (resAdmins.success && resAdmins.admins) {
      var adminList = resAdmins.admins;
      var admin = adminList.find(function(a) { return a.username === username && a.active; });
      if (admin) {
        loginWithSession(admin, authHeader);
      } else {
        throw new Error("Invalid credentials");
      }
    } else {
      throw new Error("Invalid server response");
    }
  })
  .catch(function(err) {
    console.warn("Server auth failed:", err.message);
    if (errDiv) {
      errDiv.textContent = err.message === "Invalid credentials" ? "Invalid credentials. Access denied." : "Cannot connect to payment server. Access denied.";
      errDiv.classList.add("show");
    }
  });
}

function logoutAdmin() {
  var who = state.adminSession ? state.adminSession.username : "unknown";
  audit("Admin session ended by " + who + ".");
  state.adminAuthenticated = false;
  state.adminSession = null;
  try { sessionStorage.removeItem("ax_session"); } catch(e) {}
  setView("tournaments");
  showToast("Admin session ended.");
  window.location.hash = "";
}

// --------------- Admin Session Bar ---------------
function renderAdminSession() {
  var bar = document.getElementById("adminSessionBar");
  if (!bar || !state.adminSession) return;
  bar.innerHTML =
    '<span>Signed in as <strong>' + escapeHTML(state.adminSession.username) + '</strong> (' + escapeHTML(state.adminSession.id) + ') &mdash; ' + escapeHTML(state.adminSession.role) + '</span>' +
    '<button type="button" id="logoutAdminBtn">Sign Out</button>';
  document.getElementById("logoutAdminBtn").addEventListener("click", logoutAdmin);
}

// --------------- Admin Management (Super Admin) ---------------
function renderAdminManagement() {
  renderAdminSession();
  var container = document.getElementById("adminManagementList");
  if (!container) return;

  var admins = getAdmins();
  var isSuper = state.adminSession && admins.find(function(a) { return a.id === state.adminSession.id; })?.role === "super";

  container.innerHTML = admins.map(function(a) {
    var actions = "";
    if (isSuper && a.id !== state.adminSession.id) {
      actions =
        '<div class="admin-user-actions">' +
          '<button type="button" data-toggle-admin="' + escapeHTML(a.id) + '">' + (a.active ? "Disable" : "Enable") + '</button>' +
          '<button type="button" data-reset-admin="' + escapeHTML(a.id) + '">Reset Pass</button>' +
        '</div>';
    }
    return '<div class="admin-user-row">' +
      '<div><strong>' + escapeHTML(a.username) + '</strong><span>' + escapeHTML(a.id) + ' | ' + escapeHTML(a.role) + ' | ' + (a.active ? "Active" : "Disabled") + '</span></div>' +
      actions +
    '</div>';
  }).join("");
}

function createNewAdmin() {
  if (!state.adminAuthenticated || !state.adminSession || state.adminSession.role !== "super") {
    showToast("Unauthorized. Super admin privilege required.");
    return;
  }
  var username = (document.getElementById("newAdminUsername")?.value || "").trim();
  var password = document.getElementById("newAdminPassword")?.value || "";
  if (!username || !password || password.length < 6) {
    showToast("Username required. Password must be at least 6 characters.");
    return;
  }
  var admins = getAdmins();
  if (admins.find(function(a) { return a.username === username; })) {
    showToast("Username already exists.");
    return;
  }
  var newAdmin = {
    id: "ADM" + String(admins.length + 1).padStart(3, "0"),
    username: username,
    passwordHash: btoa(password),
    role: "admin",
    active: true,
    createdAt: new Date().toISOString()
  };
  admins.push(newAdmin);
  saveAdmins(admins);
  audit("Super admin created new admin: " + username + " (" + newAdmin.id + ").");
  renderAdminManagement();
  showToast("Admin " + username + " created successfully.");
  if (document.getElementById("newAdminUsername")) document.getElementById("newAdminUsername").value = "";
  if (document.getElementById("newAdminPassword")) document.getElementById("newAdminPassword").value = "";
}

function toggleAdminStatus(adminId) {
  if (!state.adminAuthenticated || !state.adminSession || state.adminSession.role !== "super") {
    showToast("Unauthorized. Super admin privilege required.");
    return;
  }
  var admins = getAdmins();
  var admin = admins.find(function(a) { return a.id === adminId; });
  if (!admin) return;
  admin.active = !admin.active;
  saveAdmins(admins);
  audit("Admin " + admin.username + " " + (admin.active ? "enabled" : "disabled") + " by " + state.adminSession.username + ".");
  renderAdminManagement();
  showToast("Admin " + admin.username + " " + (admin.active ? "enabled" : "disabled") + ".");
}

function resetAdminPassword(adminId) {
  if (!state.adminAuthenticated || !state.adminSession || state.adminSession.role !== "super") {
    showToast("Unauthorized. Super admin privilege required.");
    return;
  }
  var newPassword = prompt("Enter new password for this admin (min 6 characters):");
  if (!newPassword || newPassword.length < 6) {
    showToast("Password must be at least 6 characters.");
    return;
  }
  var admins = getAdmins();
  var admin = admins.find(function(a) { return a.id === adminId; });
  if (!admin) return;
  admin.passwordHash = btoa(newPassword);
  saveAdmins(admins);
  audit("Password reset for admin " + admin.username + " by " + state.adminSession.username + ".");
  showToast("Password reset for " + admin.username + ".");
}

function changeOwnCredentials() {
  if (!state.adminAuthenticated || !state.adminSession) {
    showToast("Unauthorized operation.");
    return;
  }
  var newUsername = (document.getElementById("changeAdminUsername")?.value || "").trim();
  var newPassword = document.getElementById("changeAdminPassword")?.value || "";
  if (!newUsername && !newPassword) {
    showToast("Enter a new username or password to update.");
    return;
  }
  var admins = getAdmins();
  var admin = admins.find(function(a) { return a.id === state.adminSession.id; });
  if (!admin) return;

  if (newUsername && newUsername !== admin.username) {
    if (admins.find(function(a) { return a.username === newUsername && a.id !== admin.id; })) {
      showToast("Username already taken.");
      return;
    }
    admin.username = newUsername;
    state.adminSession.username = newUsername;
  }
  if (newPassword) {
    if (newPassword.length < 6) { showToast("Password must be at least 6 characters."); return; }
    admin.passwordHash = btoa(newPassword);
  }
  saveAdmins(admins);
  audit("Admin " + admin.username + " updated their credentials.");
  renderAdminSession();
  showToast("Credentials updated successfully.");
  if (document.getElementById("changeAdminUsername")) document.getElementById("changeAdminUsername").value = "";
  if (document.getElementById("changeAdminPassword")) document.getElementById("changeAdminPassword").value = "";
}

// --------------- Patch setView for Admin Gate ---------------
var _originalSetView = setView;
setView = function(view) {
  if (view === "admin" && !state.adminAuthenticated) {
    showAdminLogin();
    return;
  }
  _originalSetView(view);
  if (view === "admin" && state.adminAuthenticated) {
    renderAdminSession();
    if (typeof renderAdminPayments === "function") renderAdminPayments();
    if (typeof renderQRConfig === "function") renderQRConfig();
    if (typeof renderAdminTournaments === "function") renderAdminTournaments();
    if (typeof renderAdminManagement === "function") renderAdminManagement();
    if (typeof renderTournamentAnalytics === "function") renderTournamentAnalytics();
  }
};

// --------------- Hash Route Handler ---------------
function handleAdminRoute() {
  var hash = window.location.hash.replace("#", "").replace("/", "");
  if (hash === "admin") {
    if (!state.adminAuthenticated) {
      showAdminLogin();
    } else {
      setView("admin");
    }
  }
}

window.addEventListener("hashchange", handleAdminRoute);

// --------------- Admin Event Delegation ---------------
document.addEventListener("click", function(e) {
  var toggleBtn = e.target.closest("[data-toggle-admin]");
  if (toggleBtn) { toggleAdminStatus(toggleBtn.dataset.toggleAdmin); return; }

  var resetBtn = e.target.closest("[data-reset-admin]");
  if (resetBtn) { resetAdminPassword(resetBtn.dataset.resetAdmin); return; }

  var loginBtn = e.target.closest("#adminLoginBtn");
  if (loginBtn) { attemptAdminLogin(); return; }

  var createBtn = e.target.closest("#createAdminBtn");
  if (createBtn) { createNewAdmin(); return; }

  var changeBtn = e.target.closest("#changeCredentialsBtn");
  if (changeBtn) { changeOwnCredentials(); return; }
});

// Enter key on password field triggers login
document.addEventListener("keydown", function(e) {
  if (e.key === "Enter" && e.target.id === "adminPassword") {
    attemptAdminLogin();
  }
});

// Restore admin session from sessionStorage on load
(function restoreSession() {
  try {
    var stored = sessionStorage.getItem("ax_session");
    if (stored) {
      var sess = JSON.parse(stored);
      state.adminAuthenticated = true;
      state.adminSession = sess;
      // Trigger views and lists load
      setTimeout(function() {
        if (window.location.hash === "#admin" || window.location.hash === "#/admin") {
          setView("admin");
        }
        if (typeof loadPaymentsFromServer === "function") loadPaymentsFromServer();
        if (typeof syncAdminsWithServer === "function") syncAdminsWithServer();
      }, 150);
    }
  } catch(e) {}
})();

// Check hash on page load if not already handled by restoreSession
if (!state.adminAuthenticated && (window.location.hash === "#admin" || window.location.hash === "#/admin")) {
  setTimeout(handleAdminRoute, 100);
}
