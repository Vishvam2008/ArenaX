// api.js - ArenaX API Client
const API_BASE = window.ARENAX_API_URL || 'http://localhost:5000/api';

// Module-level token store (in-memory only, never persisted to disk)
let _authToken = null;

class ApiClient {
  constructor() {
    this._refreshing = false;
    this._refreshQueue = [];
  }

  // -------------------------------------------------------------------
  // Token helpers
  // -------------------------------------------------------------------
  _getToken() {
    return _authToken;
  }

  // -------------------------------------------------------------------
  // Core request engine
  // -------------------------------------------------------------------
  async request(method, endpoint, data = null, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

    const headers = {};

    // Attach auth token when present
    const token = this._getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Build fetch options
    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
      credentials: 'include', // send httpOnly cookies for refresh
      ...options,
    };

    // Attach body
    if (data !== null && !(data instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(data);
    } else if (data instanceof FormData) {
      // Let the browser set the correct multipart boundary
      fetchOptions.body = data;
    }

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } catch (networkErr) {
      throw { status: 0, message: 'Network error – please check your connection.', data: null };
    }

    // Handle 401 → attempt token refresh → retry once
    if (response.status === 401 && !options._isRetry) {
      try {
        await this.refreshToken();
        return this.request(method, endpoint, data, { ...options, _isRetry: true });
      } catch (_) {
        throw { status: 401, message: 'Session expired. Please log in again.', data: null };
      }
    }

    // Parse response body (best-effort JSON)
    let responseData = null;
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      try {
        responseData = await response.json();
      } catch (_) {
        responseData = null;
      }
    } else {
      try {
        responseData = await response.text();
      } catch (_) {
        responseData = null;
      }
    }

    if (!response.ok) {
      const message =
        (responseData && (responseData.message || responseData.error)) ||
        `Request failed with status ${response.status}`;
      throw { status: response.status, message, data: responseData };
    }

    return responseData;
  }

  // -------------------------------------------------------------------
  // Convenience methods
  // -------------------------------------------------------------------
  async get(endpoint, params = {}) {
    const url = new URL(
      endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`
    );
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.append(k, v);
    });
    // Pass the full URL string to request() so it's used as-is
    return this.request('GET', url.toString());
  }

  async post(endpoint, data) {
    return this.request('POST', endpoint, data);
  }

  async put(endpoint, data) {
    return this.request('PUT', endpoint, data);
  }

  async patch(endpoint, data) {
    return this.request('PATCH', endpoint, data);
  }

  async delete(endpoint) {
    return this.request('DELETE', endpoint);
  }

  /**
   * Upload a file using multipart/form-data.
   * Pass a pre-built FormData object; we intentionally do NOT set
   * Content-Type so the browser can add the multipart boundary.
   */
  async upload(endpoint, formData) {
    return this.request('POST', endpoint, formData);
  }

  // -------------------------------------------------------------------
  // Token refresh (uses httpOnly refresh-cookie set by the server)
  // -------------------------------------------------------------------
  async refreshToken() {
    // If a refresh is already in flight, queue and wait for it
    if (this._refreshing) {
      return new Promise((resolve, reject) => {
        this._refreshQueue.push({ resolve, reject });
      });
    }

    this._refreshing = true;

    try {
      const data = await this.request('POST', '/auth/refresh', null, {
        _isRetry: true, // prevent infinite 401 loop
      });

      const newToken = data && (data.accessToken || data.token);
      if (!newToken) throw new Error('No token in refresh response');

      // Update module-level store
      setAuthToken(newToken);

      // Also update auth module if it's already loaded (avoids circular import issues)
      // We use a CustomEvent so auth.js can listen and sync its own state
      window.dispatchEvent(
        new CustomEvent('arenax:token-refreshed', { detail: { token: newToken } })
      );

      // Resolve any queued callers
      this._refreshQueue.forEach(({ resolve }) => resolve(newToken));
      this._refreshQueue = [];

      return newToken;
    } catch (err) {
      this._refreshQueue.forEach(({ reject }) => reject(err));
      this._refreshQueue = [];
      throw err;
    } finally {
      this._refreshing = false;
    }
  }
}

// -------------------------------------------------------------------
// Singleton export
// -------------------------------------------------------------------
export const api = new ApiClient();

/**
 * Store an access token in memory so the ApiClient can attach it
 * to every request.  Called by auth.js after login / refresh.
 */
export function setAuthToken(token) {
  _authToken = token;
}

/**
 * Remove the in-memory access token (called on logout).
 */
export function clearAuthToken() {
  _authToken = null;
}
