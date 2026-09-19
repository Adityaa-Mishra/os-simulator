/**
 * Authentication Modal & Account View Controller (Vanilla JS ES6+)
 * Provides session management, login/register modal & pages, account profile view, and topbar navigation.
 */

import { api } from '../core/apiClient.js';
import { store } from '../core/store.js';
import { showToast } from '../utils/toast.js';
import { escapeHtml } from '../utils/sanitize.js';

export const authView = {
  init() {
    this.modalContainer = document.getElementById('modal-container');
    this.authNavContainer = document.getElementById('auth-nav-container');

    // Subscribe to store user changes to update topbar UI
    store.subscribe('user', (user) => this.renderNav(user));

    // Listen for click on Login/Register button in topbar if already in DOM
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => this.openModal('login'));
    }

    // Check current session on startup via HTTP-only cookie
    this.checkSession();
  },

  async checkSession() {
    try {
      const res = await api.get('/auth/me');
      if (res.success && res.user) {
        store.setState({ user: res.user, isAuthenticated: true });
        return res.user;
      }
    } catch {
      // Guest mode - not logged in
      store.setState({ user: null, isAuthenticated: false });
    }
    return null;
  },

  renderNav(user) {
    if (!this.authNavContainer) return;

    if (user) {
      const initial = (user.name || 'U').charAt(0).toUpperCase();
      this.authNavContainer.innerHTML = `
        <div class="auth-nav-user">
          <a href="#/account" class="auth-nav-name" title="View Account">
            <span class="auth-nav-avatar">${escapeHtml(initial)}</span>
            <span>${escapeHtml(user.name)}</span>
          </a>
          <a href="#/account" class="btn btn-outline btn-sm">Account</a>
          <button id="logout-btn" class="btn btn-outline btn-sm">Logout</button>
        </div>
      `;

      const logoutBtn = this.authNavContainer.querySelector?.('#logout-btn') || 
        (typeof document !== 'undefined' ? document.getElementById('logout-btn') : null);
      logoutBtn?.addEventListener('click', () => this.handleLogout());
    } else {
      this.authNavContainer.innerHTML = `
        <a href="#/login" id="login-btn" class="btn btn-primary btn-sm">Login / Register</a>
      `;
      const loginBtn = this.authNavContainer.querySelector?.('#login-btn') || 
        (typeof document !== 'undefined' ? document.getElementById('login-btn') : null);
      loginBtn?.addEventListener('click', (e) => {
        // If modal container exists, open modal for fast flow
        if (this.modalContainer) {
          e.preventDefault();
          this.openModal('login');
        }
      });
    }
  },

  openModal(initialTab = 'login') {
    if (!this.modalContainer) return;

    this.modalContainer.innerHTML = `
      <div class="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div class="modal-header">
          <h3 class="card-title" id="auth-modal-title">${initialTab === 'login' ? 'Sign In' : 'Create Account'}</h3>
          <button id="close-modal-btn" class="btn btn-outline btn-sm" aria-label="Close modal">✕</button>
        </div>
        <div class="modal-body">
          <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4);">
            <button id="tab-login" class="btn ${initialTab === 'login' ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex: 1;">Login</button>
            <button id="tab-register" class="btn ${initialTab === 'register' ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex: 1;">Register</button>
          </div>

          <form id="auth-form">
            <div id="name-field-group" class="form-group" style="${initialTab === 'login' ? 'display: none;' : ''}">
              <label class="form-label" for="auth-name">Full Name</label>
              <input type="text" id="auth-name" class="form-input" placeholder="e.g. Alan Turing">
            </div>

            <div class="form-group">
              <label class="form-label" for="auth-email">Email Address</label>
              <input type="email" id="auth-email" class="form-input" placeholder="name@example.com" required>
            </div>

            <div class="form-group">
              <label class="form-label" for="auth-password">Password</label>
              <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required minlength="8">
              <span style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px; display: block;">
                Minimum 8 characters
              </span>
            </div>

            <button type="submit" id="auth-submit-btn" class="btn btn-primary" style="width: 100%; margin-top: var(--space-2);">
              ${initialTab === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>
      </div>
    `;

    this.modalContainer.classList.add('open');
    this.modalContainer.setAttribute('aria-hidden', 'false');

    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');
    const nameGroup = document.getElementById('name-field-group');
    const modalTitle = document.getElementById('auth-modal-title');
    const submitBtn = document.getElementById('auth-submit-btn');

    let currentMode = initialTab;

    tabLogin.addEventListener('click', () => {
      currentMode = 'login';
      tabLogin.className = 'btn btn-primary btn-sm';
      tabRegister.className = 'btn btn-secondary btn-sm';
      nameGroup.style.display = 'none';
      modalTitle.textContent = 'Sign In';
      submitBtn.textContent = 'Sign In';
    });

    tabRegister.addEventListener('click', () => {
      currentMode = 'register';
      tabRegister.className = 'btn btn-primary btn-sm';
      tabLogin.className = 'btn btn-secondary btn-sm';
      nameGroup.style.display = 'flex';
      modalTitle.textContent = 'Create Account';
      submitBtn.textContent = 'Create Account';
    });

    document.getElementById('close-modal-btn').addEventListener('click', () => this.closeModal());
    this.modalContainer.addEventListener('click', (e) => {
      if (e.target === this.modalContainer) this.closeModal();
    });

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const name = document.getElementById('auth-name')?.value.trim();

      if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';

      try {
        let res;
        if (currentMode === 'login') {
          res = await api.post('/auth/login', { email, password });
          showToast(`Welcome back, ${res.user.name}!`, 'success');
        } else {
          if (!name) {
            showToast('Please enter your full name', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
            return;
          }
          res = await api.post('/auth/register', { name, email, password });
          showToast(`Account created successfully! Welcome, ${res.user.name}!`, 'success');
        }

        store.setState({ user: res.user, isAuthenticated: true });
        this.closeModal();
      } catch (err) {
        showToast(err.message || 'Authentication failed', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = currentMode === 'login' ? 'Sign In' : 'Create Account';
      }
    });
  },

  closeModal() {
    if (this.modalContainer) {
      this.modalContainer.classList.remove('open');
      this.modalContainer.setAttribute('aria-hidden', 'true');
      this.modalContainer.innerHTML = '';
    }
  },

  async handleLogout() {
    try {
      await api.post('/auth/logout');
      store.setState({ user: null, isAuthenticated: false });
      showToast('Logged out successfully', 'info');
      if (window.location.hash === '#/account') {
        window.location.hash = '#/';
      }
    } catch (err) {
      showToast(err.message || 'Failed to log out', 'error');
    }
  },

  /**
   * Mount Account Profile View (#/account)
   */
  async mountAccount(container) {
    const user = store.getState('user');

    if (!user) {
      container.innerHTML = `
        <div class="auth-container">
          <div class="card auth-card-narrow">
            <div class="card-header">
              <h3 class="card-title">Account Access Required</h3>
            </div>
            <div class="card-body" style="text-align: center; padding: var(--space-8) var(--space-6);">
              <div style="font-size: 2.5rem; margin-bottom: var(--space-3);" aria-hidden="true">🔒</div>
              <p style="color: var(--text-secondary); margin-bottom: var(--space-6); font-size: var(--text-sm);">
                You must be logged in to view and manage your account profile.
              </p>
              <div style="display: flex; gap: var(--space-3); justify-content: center;">
                <button id="account-login-btn" class="btn btn-primary btn-sm">Sign In / Register</button>
                <a href="#/" class="btn btn-secondary btn-sm">Go to Dashboard</a>
              </div>
            </div>
          </div>
        </div>
      `;

      container.querySelector('#account-login-btn')?.addEventListener('click', () => {
        this.openModal('login');
      });
      return;
    }

    const initial = (user.name || 'U').charAt(0).toUpperCase();
    const joinedDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Recently';
    const lastLogin = user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Just now';

    container.innerHTML = `
      <div class="auth-container">
        <!-- Account Header -->
        <div class="card" style="margin-bottom: var(--space-6);">
          <div class="card-body" style="display: flex; align-items: center; gap: var(--space-5); padding: var(--space-6);">
            <div class="account-avatar">${escapeHtml(initial)}</div>
            <div class="account-summary" style="flex: 1;">
              <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1);">
                <h2 style="font-size: var(--text-xl); font-weight: 700; color: var(--text-primary); margin: 0;">${escapeHtml(user.name)}</h2>
                <span class="badge badge-primary">${escapeHtml(user.role || 'User')}</span>
              </div>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-2); font-family: var(--font-mono);">${escapeHtml(user.email)}</p>
              <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
                <span class="badge badge-info">Joined: ${escapeHtml(joinedDate)}</span>
                <span class="badge badge-secondary">Last Active: ${escapeHtml(lastLogin)}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Account Grid -->
        <div class="grid grid-cols-2">
          <!-- Profile Edit Form -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Edit Profile</h3>
            </div>
            <div class="card-body">
              <form id="profile-edit-form">
                <div class="form-group">
                  <label class="form-label" for="profile-name">Full Name</label>
                  <input type="text" id="profile-name" class="form-input" value="${escapeHtml(user.name)}" required>
                </div>
                <div class="form-group">
                  <label class="form-label" for="profile-email-ro">Email Address</label>
                  <input type="email" id="profile-email-ro" class="form-input" value="${escapeHtml(user.email)}" disabled style="opacity: 0.7; cursor: not-allowed;">
                  <span style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px; display: block;">
                    Email address cannot be modified.
                  </span>
                </div>
                <button type="submit" id="save-profile-btn" class="btn btn-primary btn-sm" style="margin-top: var(--space-2);">
                  Save Changes
                </button>
              </form>
            </div>
          </div>

          <!-- Preferences & Security -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Preferences & Security</h3>
            </div>
            <div class="card-body">
              <form id="preferences-form">
                <div class="form-group">
                  <label class="form-label" for="pref-theme">Interface Theme</label>
                  <select id="pref-theme" class="form-select">
                    <option value="light" ${user.preferences?.theme === 'light' || (!user.preferences?.theme && document.documentElement.getAttribute('data-theme') === 'light') ? 'selected' : ''}>Light Mode (Default)</option>
                    <option value="dark" ${user.preferences?.theme === 'dark' || (!user.preferences?.theme && document.documentElement.getAttribute('data-theme') === 'dark') ? 'selected' : ''}>Dark Mode</option>
                  </select>
                </div>
                <button type="submit" id="save-prefs-btn" class="btn btn-secondary btn-sm" style="margin-top: var(--space-2);">
                  Save Preferences
                </button>
              </form>

              <hr style="border: none; border-top: 1px solid var(--border-color); margin: var(--space-5) 0;">

              <div>
                <h4 style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-1);">
                  Session Management
                </h4>
                <p style="font-size: var(--text-xs); color: var(--text-secondary); margin-bottom: var(--space-3);">
                  Sign out of your active session on this device.
                </p>
                <button id="account-logout-btn" class="btn btn-danger btn-sm">
                  Sign Out of Account
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Handle profile update
    const profileForm = container.querySelector('#profile-edit-form');
    profileForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newName = container.querySelector('#profile-name').value.trim();
      if (!newName) {
        showToast('Name cannot be empty', 'error');
        return;
      }

      const saveBtn = container.querySelector('#save-profile-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const res = await api.patch('/users/me', { name: newName });
        if (res.success && res.user) {
          store.setState({ user: res.user });
          showToast('Profile updated successfully!', 'success');
          this.mountAccount(container);
        }
      } catch (err) {
        showToast(err.message || 'Failed to update profile', 'error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Changes';
        }
      }
    });

    // Handle preferences update
    const prefsForm = container.querySelector('#preferences-form');
    prefsForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const theme = container.querySelector('#pref-theme').value;
      const saveBtn = container.querySelector('#save-prefs-btn');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      try {
        const res = await api.patch('/users/me', { preferences: { theme } });
        if (res.success && res.user) {
          store.setState({ user: res.user, theme });
          document.documentElement.setAttribute('data-theme', theme);
          localStorage.setItem('theme', theme);
          const themeIcon = document.getElementById('theme-icon');
          if (themeIcon) {
            themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
          }
          showToast('Preferences updated!', 'success');
        }
      } catch (err) {
        showToast(err.message || 'Failed to update preferences', 'error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Preferences';
        }
      }
    });

    // Handle logout
    container.querySelector('#account-logout-btn')?.addEventListener('click', () => {
      this.handleLogout();
    });
  },

  /**
   * Mount Login/Register View (#/login, #/register)
   */
  async mountLogin(container, initialTab = 'login') {
    const user = store.getState('user');

    if (user) {
      container.innerHTML = `
        <div class="auth-container">
          <div class="card auth-card-narrow">
            <div class="card-header">
              <h3 class="card-title">Already Signed In</h3>
            </div>
            <div class="card-body" style="text-align: center; padding: var(--space-8) var(--space-6);">
              <div style="font-size: 2.5rem; margin-bottom: var(--space-3);" aria-hidden="true">👤</div>
              <p style="color: var(--text-primary); font-weight: 600; margin-bottom: var(--space-1);">
                You are signed in as ${escapeHtml(user.name)}
              </p>
              <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-6); font-family: var(--font-mono);">
                ${escapeHtml(user.email)}
              </p>
              <div style="display: flex; gap: var(--space-3); justify-content: center;">
                <a href="#/account" class="btn btn-primary btn-sm">View Account</a>
                <a href="#/" class="btn btn-secondary btn-sm">Dashboard</a>
              </div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="auth-container">
        <div class="card auth-card-narrow">
          <div class="card-header">
            <h3 class="card-title" id="page-auth-title">${initialTab === 'login' ? 'Sign In to OS Simulator' : 'Create an Account'}</h3>
          </div>
          <div class="card-body">
            <div style="display: flex; gap: var(--space-2); margin-bottom: var(--space-4);">
              <button id="page-tab-login" class="btn ${initialTab === 'login' ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex: 1;">Login</button>
              <button id="page-tab-register" class="btn ${initialTab === 'register' ? 'btn-primary' : 'btn-secondary'} btn-sm" style="flex: 1;">Register</button>
            </div>

            <form id="page-auth-form">
              <div id="page-name-group" class="form-group" style="${initialTab === 'login' ? 'display: none;' : ''}">
                <label class="form-label" for="page-auth-name">Full Name</label>
                <input type="text" id="page-auth-name" class="form-input" placeholder="e.g. Ada Lovelace">
              </div>

              <div class="form-group">
                <label class="form-label" for="page-auth-email">Email Address</label>
                <input type="email" id="page-auth-email" class="form-input" placeholder="name@example.com" required>
              </div>

              <div class="form-group">
                <label class="form-label" for="page-auth-password">Password</label>
                <input type="password" id="page-auth-password" class="form-input" placeholder="••••••••" required minlength="8">
                <span style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 4px; display: block;">
                  Minimum 8 characters
                </span>
              </div>

              <button type="submit" id="page-auth-submit-btn" class="btn btn-primary btn-sm" style="width: 100%; margin-top: var(--space-2);">
                ${initialTab === 'login' ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    const tabLogin = container.querySelector('#page-tab-login');
    const tabRegister = container.querySelector('#page-tab-register');
    const nameGroup = container.querySelector('#page-name-group');
    const formTitle = container.querySelector('#page-auth-title');
    const submitBtn = container.querySelector('#page-auth-submit-btn');

    let currentMode = initialTab;

    tabLogin.addEventListener('click', () => {
      currentMode = 'login';
      tabLogin.className = 'btn btn-primary btn-sm';
      tabRegister.className = 'btn btn-secondary btn-sm';
      nameGroup.style.display = 'none';
      formTitle.textContent = 'Sign In to OS Simulator';
      submitBtn.textContent = 'Sign In';
    });

    tabRegister.addEventListener('click', () => {
      currentMode = 'register';
      tabRegister.className = 'btn btn-primary btn-sm';
      tabLogin.className = 'btn btn-secondary btn-sm';
      nameGroup.style.display = 'flex';
      formTitle.textContent = 'Create an Account';
      submitBtn.textContent = 'Create Account';
    });

    container.querySelector('#page-auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = container.querySelector('#page-auth-email').value.trim();
      const password = container.querySelector('#page-auth-password').value;
      const name = container.querySelector('#page-auth-name')?.value.trim();

      if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';

      try {
        let res;
        if (currentMode === 'login') {
          res = await api.post('/auth/login', { email, password });
          showToast(`Welcome back, ${res.user.name}!`, 'success');
        } else {
          if (!name) {
            showToast('Please enter your full name', 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
            return;
          }
          res = await api.post('/auth/register', { name, email, password });
          showToast(`Account created successfully! Welcome, ${res.user.name}!`, 'success');
        }

        store.setState({ user: res.user, isAuthenticated: true });
        window.location.hash = '#/account';
      } catch (err) {
        showToast(err.message || 'Authentication failed', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = currentMode === 'login' ? 'Sign In' : 'Create Account';
        }
      }
    });
  }
};

export const accountView = {
  mount(container) {
    return authView.mountAccount(container);
  },
  unmount() {}
};

export const loginView = {
  mount(container) {
    return authView.mountLogin(container, 'login');
  },
  unmount() {}
};

export const registerView = {
  mount(container) {
    return authView.mountLogin(container, 'register');
  },
  unmount() {}
};
