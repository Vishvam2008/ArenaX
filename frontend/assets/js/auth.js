// auth.js - ArenaX Auth State Manager
import { api, setAuthToken, clearAuthToken } from './api.js';

// -----------------------------------------------------------------------
// Private in-memory state
// -----------------------------------------------------------------------
const _state = {
  user: null,
  token: null,
};

const USER_STORAGE_KEY = 'arenax_user';

// -----------------------------------------------------------------------
// Auth object
// -----------------------------------------------------------------------
export const auth = {
  // ----------------------------
  // Getters
  // ----------------------------
  get user() {
    return _state.user;
  },

  get token() {
    return _state.token;
  },

  isLoggedIn() {
    return !!_state.token;
  },

  isAdmin() {
    return !!(
      _state.user &&
      (_state.user.role === 'admin' || _state.user.role === 'superadmin')
    );
  },

  // ----------------------------
  // Login
  // ----------------------------
  login(user, token) {
    // Store token in memory & propagate to API client
    _state.token = token;
    _state.user = user;
    setAuthToken(token);

    // Persist non-sensitive user info so we can restore the session
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    } catch (_) {
      // Storage blocked (private mode, etc.) – continue anyway
    }

    // Notify other parts of the app
    window.dispatchEvent(
      new CustomEvent('auth:login', { detail: { user, token } })
    );
  },

  // ----------------------------
  // Logout
  // ----------------------------
  async logout() {
    // Best-effort server-side logout (invalidates refresh cookie)
    try {
      await api.post('/auth/logout', null);
    } catch (_) {
      // Ignore errors – we always clear local state
    }

    _state.token = null;
    _state.user = null;
    clearAuthToken();

    try {
      localStorage.removeItem(USER_STORAGE_KEY);
    } catch (_) {}

    window.dispatchEvent(new CustomEvent('auth:logout'));

    // Redirect to login
    window.location.href = '/public/auth/login.html';
  },

  // ----------------------------
  // Route guards
  // ----------------------------
  requireAuth() {
    if (!this.isLoggedIn()) {
      const returnUrl = encodeURIComponent(window.location.href);
      window.location.href = `/public/auth/login.html?returnUrl=${returnUrl}`;
      return null;
    }
    return _state.user;
  },

  requireAdmin() {
    if (!this.isLoggedIn()) {
      window.location.href = '/public/admin/login.html';
      return null;
    }
    if (!this.isAdmin()) {
      // Authenticated but not admin → home page
      window.location.href = '/index.html';
      return null;
    }
    return _state.user;
  },

  // ----------------------------
  // Session init (called on every page load)
  // ----------------------------
  async init() {
    // 1. Check localStorage for previously saved user
    let storedUser = null;
    try {
      const raw = localStorage.getItem(USER_STORAGE_KEY);
      storedUser = raw ? JSON.parse(raw) : null;
    } catch (_) {
      storedUser = null;
    }

    // 2. Attempt a silent token refresh using the httpOnly refresh cookie
    try {
      const data = await api.post('/auth/refresh', null);
      const payload = data?.data || data;
      const newToken = payload && (payload.accessToken || payload.token);
      if (!newToken) throw new Error('No token returned');

      const freshUser = (payload && payload.user) || storedUser;
      if (!freshUser) throw new Error('No user data');

      // 3. Restore session
      _state.token = newToken;
      _state.user = freshUser;
      setAuthToken(newToken);

      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(freshUser));
      } catch (_) {}

      window.dispatchEvent(
        new CustomEvent('auth:restored', { detail: { user: freshUser } })
      );

      return true;
    } catch (_) {
      // 4. Refresh failed – clear any stale data
      _state.token = null;
      _state.user = null;
      clearAuthToken();

      try {
        localStorage.removeItem(USER_STORAGE_KEY);
      } catch (__) {}

      return false;
    }
  },

  // ----------------------------
  // Update user profile in memory + storage
  // ----------------------------
  updateUser(updates) {
    if (!_state.user) return;
    _state.user = { ..._state.user, ...updates };
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(_state.user));
    } catch (_) {}
    window.dispatchEvent(
      new CustomEvent('auth:user-updated', { detail: { user: _state.user } })
    );
  },
};

// -----------------------------------------------------------------------
// Keep token in sync when api.js fires a refresh event
// -----------------------------------------------------------------------
window.addEventListener('arenax:token-refreshed', (e) => {
  const { token } = e.detail || {};
  if (token) {
    _state.token = token;
    // user stays the same; no need to update localStorage
  }
});
