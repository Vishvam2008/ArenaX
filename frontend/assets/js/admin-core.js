// admin-core.js - ArenaX Administrator Panel Engine
import { api, setAuthToken } from './api.js';

const ADMIN_TOKEN_KEY = 'arenax_admin_token';
const ADMIN_USER_KEY = 'arenax_admin_user';

export const adminCore = {
  // -------------------------------------------------------------
  // Get active admin state
  // -------------------------------------------------------------
  get admin() {
    try {
      const raw = localStorage.getItem(ADMIN_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  },

  get token() {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  isLoggedIn() {
    return !!this.token;
  },

  isSuperAdmin() {
    const admin = this.admin;
    return !!(admin && admin.role === 'super_admin');
  },

  // -------------------------------------------------------------
  // Guard the route. Redirect to login if not authenticated.
  // -------------------------------------------------------------
  requireAdmin() {
    if (!this.isLoggedIn()) {
      window.location.href = '/public/admin/login.html';
      return null;
    }
    
    // Inject auth token into API client
    setAuthToken(this.token);
    return this.admin;
  },

  // -------------------------------------------------------------
  // Logout
  // -------------------------------------------------------------
  async logout() {
    try {
      await api.post('/admin/logout');
    } catch (_) {}
    
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    window.location.href = '/public/admin/login.html';
  },

  // -------------------------------------------------------------
  // Injects sidebar and header layout
  // -------------------------------------------------------------
  initLayout(activePageKey) {
    const admin = this.admin;
    if (!admin) return;

    // 1. Create sidebar container
    const layoutContainer = document.querySelector('.admin-layout');
    if (!layoutContainer) return;

    // Create sidebar
    const sidebar = document.createElement('aside');
    sidebar.className = 'admin-sidebar';
    sidebar.id = 'adminSidebar';

    // Check super admin flag
    const isSuper = admin.role === 'super_admin';

    sidebar.innerHTML = `
      <div class="admin-sidebar-logo">
        <div class="admin-sidebar-logo-icon">🛡️</div>
        <div class="admin-sidebar-logo-text">ArenaX Panel</div>
        <div class="admin-sidebar-logo-badge">${isSuper ? 'Super' : 'Staff'}</div>
      </div>
      <nav class="admin-nav">
        <div class="admin-nav-section">Core Operations</div>
        <a href="/public/admin/dashboard.html" class="admin-nav-item ${activePageKey === 'dashboard' ? 'active' : ''}">
          <span class="nav-icon">📊</span>
          <span class="nav-label">Dashboard</span>
        </a>
        <a href="/public/admin/tournaments.html" class="admin-nav-item ${activePageKey === 'tournaments' ? 'active' : ''}">
          <span class="nav-icon">🏆</span>
          <span class="nav-label">Tournaments</span>
        </a>
        <a href="/public/admin/results.html" class="admin-nav-item ${activePageKey === 'results' ? 'active' : ''}">
          <span class="nav-icon">🎯</span>
          <span class="nav-label">Match Results</span>
        </a>

        <div class="admin-nav-section">Financials</div>
        <a href="/public/admin/payments.html" class="admin-nav-item ${activePageKey === 'payments' ? 'active' : ''}">
          <span class="nav-icon">💸</span>
          <span class="nav-label">Deposits</span>
        </a>
        <a href="/public/admin/withdrawals.html" class="admin-nav-item ${activePageKey === 'withdrawals' ? 'active' : ''}">
          <span class="nav-icon">🏦</span>
          <span class="nav-label">Withdrawals</span>
        </a>
        <a href="/public/admin/wallets.html" class="admin-nav-item ${activePageKey === 'wallets' ? 'active' : ''}">
          <span class="nav-icon">💳</span>
          <span class="nav-label">Wallets</span>
        </a>

        <div class="admin-nav-section">Users & Support</div>
        <a href="/public/admin/users.html" class="admin-nav-item ${activePageKey === 'users' ? 'active' : ''}">
          <span class="nav-icon">👥</span>
          <span class="nav-label">User Accounts</span>
        </a>
        <a href="/public/admin/tickets.html" class="admin-nav-item ${activePageKey === 'tickets' ? 'active' : ''}">
          <span class="nav-icon">🎫</span>
          <span class="nav-label">Support Tickets</span>
        </a>

        <div class="admin-nav-section">System Control</div>
        <a href="/public/admin/notifications.html" class="admin-nav-item ${activePageKey === 'notifications' ? 'active' : ''}">
          <span class="nav-icon">📢</span>
          <span class="nav-label">Broadcasts</span>
        </a>
        <a href="/public/admin/apk.html" class="admin-nav-item ${activePageKey === 'apk' ? 'active' : ''}">
          <span class="nav-icon">🤖</span>
          <span class="nav-label">APK Releases</span>
        </a>
        <a href="/public/admin/settings.html" class="admin-nav-item ${activePageKey === 'settings' ? 'active' : ''}">
          <span class="nav-icon">⚙️</span>
          <span class="nav-label">Global Settings</span>
        </a>
        ${isSuper ? `
        <a href="/public/admin/audit-logs.html" class="admin-nav-item ${activePageKey === 'audit-logs' ? 'active' : ''}">
          <span class="nav-icon">📋</span>
          <span class="nav-label">Audit Logs</span>
        </a>` : ''}
      </nav>
      <div class="admin-sidebar-footer">
        <button id="adminLogoutBtn" class="btn btn-danger w-full btn-sm">🚪 Logout</button>
      </div>
    `;

    // 2. Prepend sidebar
    layoutContainer.insertBefore(sidebar, layoutContainer.firstChild);

    // 3. Create Main & Topbar (if they don't exist yet)
    let adminMain = document.querySelector('.admin-main');
    if (adminMain) {
      // Setup topbar
      const topbar = document.createElement('header');
      topbar.className = 'admin-topbar';
      topbar.innerHTML = `
        <button class="admin-mobile-toggle" id="sidebarToggle" aria-label="Toggle Sidebar">
          <div class="hamburger">
            <span style="height: 2px; width: 100%; background: #fff;"></span>
            <span style="height: 2px; width: 100%; background: #fff;"></span>
            <span style="height: 2px; width: 100%; background: #fff;"></span>
          </div>
        </button>
        <div class="admin-topbar-title">
          <span style="font-weight: 800; font-family: var(--font-display); text-transform: uppercase; color: var(--primary-light);">${activePageKey}</span>
        </div>
        <div class="admin-topbar-actions">
          <div class="admin-topbar-avatar" title="${admin.username}">
            ${admin.username.charAt(0).toUpperCase()}
          </div>
        </div>
      `;
      adminMain.insertBefore(topbar, adminMain.firstChild);
    }

    // 4. Bind events
    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to log out from control panel?')) {
          await this.logout();
        }
      });
    }

    // Mobile Sidebar Toggle
    const toggleBtn = document.getElementById('sidebarToggle');
    const side = document.getElementById('adminSidebar');
    if (toggleBtn && side) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        side.classList.toggle('open');
      });

      // Close when clicking outside on mobile
      document.addEventListener('click', (e) => {
        if (side.classList.contains('open') && !side.contains(e.target) && e.target !== toggleBtn) {
          side.classList.remove('open');
        }
      });
    }
  }
};
