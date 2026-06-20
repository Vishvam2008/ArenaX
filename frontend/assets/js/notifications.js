// notifications.js - Notification Bell Manager + Toast System
import { api } from './api.js';
import { auth } from './auth.js';

// -----------------------------------------------------------------------
// Icon map per notification type
// -----------------------------------------------------------------------
const TYPE_ICONS = {
  tournament: '🏆',
  match:      '⚔️',
  wallet:     '💰',
  system:     '🔔',
  result:     '🎯',
  payment:    '💳',
  default:    '📣',
};

// -----------------------------------------------------------------------
// NotificationManager
// -----------------------------------------------------------------------
export class NotificationManager {
  /**
   * @param {HTMLElement} bellEl      – the bell button / icon element
   * @param {HTMLElement} badgeEl     – the unread-count badge element
   * @param {HTMLElement} dropdownEl  – the notification dropdown panel
   */
  constructor(bellEl, badgeEl, dropdownEl) {
    this._bell      = bellEl;
    this._badge     = badgeEl;
    this._dropdown  = dropdownEl;
    this._interval  = null;
    this._open      = false;
    this._unread    = 0;

    // Bound handlers (so we can remove them in destroy())
    this._onBellClick    = this._handleBellClick.bind(this);
    this._onDocClick     = this._handleDocumentClick.bind(this);
  }

  // ----------------------------
  // Lifecycle
  // ----------------------------
  init() {
    if (!auth.isLoggedIn()) return;

    // Initial load
    this.fetchUnreadCount();

    // Poll every 30 s
    this._interval = setInterval(() => this.fetchUnreadCount(), 30_000);

    // Bell toggle
    if (this._bell) {
      this._bell.addEventListener('click', this._onBellClick);
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', this._onDocClick);
  }

  destroy() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    if (this._bell) {
      this._bell.removeEventListener('click', this._onBellClick);
    }
    document.removeEventListener('click', this._onDocClick);
  }

  // ----------------------------
  // Bell click handler
  // ----------------------------
  _handleBellClick(e) {
    e.stopPropagation();
    if (this._open) {
      this._closeDropdown();
    } else {
      this._openDropdown();
    }
  }

  _handleDocumentClick() {
    if (this._open) this._closeDropdown();
  }

  _openDropdown() {
    this._open = true;
    if (this._dropdown) {
      this._dropdown.classList.add('active');
    }
    this.loadDropdown();
  }

  _closeDropdown() {
    this._open = false;
    if (this._dropdown) {
      this._dropdown.classList.remove('active');
    }
  }

  // ----------------------------
  // API calls
  // ----------------------------
  async fetchUnreadCount() {
    if (!auth.isLoggedIn()) return;
    try {
      const data = await api.get('/notifications/unread-count');
      this._unread = (data && data.count) ?? 0;
      this._updateBadge();
    } catch (_) {
      // Silently ignore – polling will retry
    }
  }

  async loadDropdown() {
    if (!this._dropdown) return;

    // Show loading state
    this._dropdown.innerHTML = `
      <div class="notif-header">
        <span>Notifications</span>
        <button class="notif-mark-all-btn" id="notifMarkAllBtn">Mark all read</button>
      </div>
      <div class="notif-loading">
        <div class="notif-spinner"></div>
      </div>`;

    try {
      const data = await api.get('/notifications', { limit: 10 });
      const notifications = (data && (data.notifications || data)) || [];

      if (notifications.length === 0) {
        this._dropdown.innerHTML = `
          <div class="notif-header">
            <span>Notifications</span>
          </div>
          <div class="notif-empty">
            <span>🔔</span>
            <p>You're all caught up!</p>
          </div>`;
        return;
      }

      const listHTML = notifications.map(n => this.renderNotification(n)).join('');
      this._dropdown.innerHTML = `
        <div class="notif-header">
          <span>Notifications</span>
          <button class="notif-mark-all-btn" id="notifMarkAllBtn">Mark all read</button>
        </div>
        <div class="notif-list">${listHTML}</div>
        <div class="notif-footer">
          <a href="/public/notifications.html">View all</a>
        </div>`;

      // Wire up individual "mark read" actions
      this._dropdown.querySelectorAll('[data-notif-id]').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.notifId;
          if (id) this.markRead(id);
        });
      });

      // Mark-all button
      const markAllBtn = this._dropdown.querySelector('#notifMarkAllBtn');
      if (markAllBtn) {
        markAllBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.markAllRead();
        });
      }
    } catch (err) {
      this._dropdown.innerHTML = `
        <div class="notif-header"><span>Notifications</span></div>
        <div class="notif-error">Failed to load notifications.</div>`;
    }
  }

  async markRead(notificationId) {
    try {
      await api.put(`/notifications/${notificationId}/read`, null);

      // Remove unread styling from this item
      const el = this._dropdown
        ? this._dropdown.querySelector(`[data-notif-id="${notificationId}"]`)
        : null;
      if (el) {
        el.classList.remove('unread');
        const dot = el.querySelector('.notif-unread-dot');
        if (dot) dot.remove();
      }

      // Decrement unread count
      this._unread = Math.max(0, this._unread - 1);
      this._updateBadge();
    } catch (_) {}
  }

  async markAllRead() {
    try {
      await api.put('/notifications/read-all', null);

      // Update UI
      if (this._dropdown) {
        this._dropdown.querySelectorAll('.notif-item.unread').forEach(el => {
          el.classList.remove('unread');
          const dot = el.querySelector('.notif-unread-dot');
          if (dot) dot.remove();
        });
      }
      this._unread = 0;
      this._updateBadge();
    } catch (_) {}
  }

  // ----------------------------
  // Render helpers
  // ----------------------------
  renderNotification(notif) {
    const icon    = TYPE_ICONS[notif.type] || TYPE_ICONS.default;
    const ago     = this.timeAgo(new Date(notif.createdAt || notif.created_at));
    const unread  = !notif.read && !notif.is_read;
    const unreadClass  = unread ? ' unread' : '';
    const unreadDot    = unread
      ? '<span class="notif-unread-dot" aria-label="Unread"></span>'
      : '';

    return `
      <div class="notif-item${unreadClass}" data-notif-id="${notif.id}" tabindex="0" role="button" aria-label="Notification: ${this._escapeHtml(notif.title || '')}">
        <div class="notif-icon">${icon}</div>
        <div class="notif-body">
          <p class="notif-title">${this._escapeHtml(notif.title || 'Notification')}</p>
          <p class="notif-message">${this._escapeHtml(notif.message || '')}</p>
          <span class="notif-time">${ago}</span>
        </div>
        ${unreadDot}
      </div>`;
  }

  timeAgo(date) {
    if (!(date instanceof Date) || isNaN(date)) return '';
    const diff = Math.floor((Date.now() - date.getTime()) / 1000); // seconds

    if (diff < 60)                    return 'Just now';
    if (diff < 3600)                  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)                 return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 7)             return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 86400 * 30)            return `${Math.floor(diff / (86400 * 7))}w ago`;
    if (diff < 86400 * 365)           return `${Math.floor(diff / (86400 * 30))}mo ago`;
    return `${Math.floor(diff / (86400 * 365))}y ago`;
  }

  // ----------------------------
  // Internal helpers
  // ----------------------------
  _updateBadge() {
    if (!this._badge) return;
    if (this._unread > 0) {
      this._badge.textContent = this._unread > 99 ? '99+' : String(this._unread);
      this._badge.style.display = '';
      this._badge.setAttribute('aria-label', `${this._unread} unread notifications`);
    } else {
      this._badge.textContent = '';
      this._badge.style.display = 'none';
    }
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

// -----------------------------------------------------------------------
// Toast notification system
// -----------------------------------------------------------------------

/** Lazily create a .toast-container at the top-right of the viewport */
function _getToastContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    Object.assign(container.style, {
      position:   'fixed',
      top:        '1.25rem',
      right:      '1.25rem',
      zIndex:     '99999',
      display:    'flex',
      flexDirection: 'column',
      gap:        '0.5rem',
      maxWidth:   '360px',
      pointerEvents: 'none',
    });
    document.body.appendChild(container);
  }
  return container;
}

const TOAST_ICONS = {
  success: '✅',
  error:   '❌',
  warning: '⚠️',
  info:    'ℹ️',
};

const TOAST_COLORS = {
  success: '#22c55e',
  error:   '#ef4444',
  warning: '#f59e0b',
  info:    '#6366f1',
};

export const toast = {
  show(message, type = 'info', duration = 4000) {
    const container = _getToastContainer();
    const icon  = TOAST_ICONS[type]  || TOAST_ICONS.info;
    const color = TOAST_COLORS[type] || TOAST_COLORS.info;

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', 'alert');
    Object.assign(el.style, {
      display:         'flex',
      alignItems:      'flex-start',
      gap:             '0.6rem',
      padding:         '0.85rem 1rem',
      borderRadius:    '0.6rem',
      background:      '#1e1e2e',
      border:          `1px solid ${color}44`,
      boxShadow:       `0 4px 24px rgba(0,0,0,0.4), 0 0 0 1px ${color}22`,
      color:           '#e2e8f0',
      fontSize:        '0.875rem',
      lineHeight:      '1.4',
      pointerEvents:   'auto',
      cursor:          'pointer',
      transition:      'opacity 0.3s ease, transform 0.3s ease',
      opacity:         '0',
      transform:       'translateX(1rem)',
      willChange:      'opacity, transform',
    });

    el.innerHTML = `
      <span style="font-size:1.1rem;flex-shrink:0;margin-top:1px">${icon}</span>
      <span style="flex:1">${message}</span>
      <button style="background:none;border:none;color:#94a3b8;cursor:pointer;padding:0;font-size:1rem;flex-shrink:0;line-height:1" aria-label="Dismiss">✕</button>`;

    container.appendChild(el);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.opacity   = '1';
        el.style.transform = 'translateX(0)';
      });
    });

    const remove = () => {
      el.style.opacity   = '0';
      el.style.transform = 'translateX(1rem)';
      setTimeout(() => el.remove(), 320);
    };

    // Dismiss on click anywhere on the toast
    el.addEventListener('click', remove);

    // Auto-dismiss
    const timer = setTimeout(remove, duration);

    // Cancel auto-dismiss on hover so user can read
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => setTimeout(remove, 1500));
  },

  success(msg, duration)  { this.show(msg, 'success', duration); },
  error(msg, duration)    { this.show(msg, 'error',   duration); },
  warning(msg, duration)  { this.show(msg, 'warning', duration); },
  info(msg, duration)     { this.show(msg, 'info',    duration); },
};
