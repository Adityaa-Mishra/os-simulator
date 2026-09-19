import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../../public/js/core/apiClient.js';
import { store } from '../../public/js/core/store.js';
import { authView, accountView, loginView, registerView } from '../../public/js/views/authView.js';

// Minimal DOM container mock
function createMockContainer() {
  const elements = new Map();

  const container = {
    _innerHTML: '',
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(html) {
      this._innerHTML = html;
    },
    querySelector: (sel) => {
      if (!elements.has(sel)) {
        elements.set(sel, {
          style: {},
          dataset: {},
          value: '',
          textContent: '',
          innerHTML: '',
          className: '',
          classList: {
            add: vi.fn(),
            remove: vi.fn(),
            contains: () => false
          },
          addEventListener: vi.fn(),
          querySelectorAll: () => [],
          appendChild: vi.fn(),
          remove: vi.fn()
        });
      }
      return elements.get(sel);
    },
    querySelectorAll: (sel) => []
  };

  return { container, elements };
}

describe('Phase 8: Frontend Auth & Account View Integration Tests', () => {
  beforeEach(() => {
    store.setState({ user: null, isAuthenticated: false });
    vi.restoreAllMocks();
  });

  describe('ApiClient', () => {
    it('sends PATCH request with credentials: "include" and JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, user: { name: 'Updated Name' } })
      });
      globalThis.fetch = mockFetch;

      const result = await api.patch('/users/me', { name: 'Updated Name' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/users/me',
        expect.objectContaining({
          method: 'PATCH',
          credentials: 'include',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ name: 'Updated Name' })
        })
      );
      expect(result.success).toBe(true);
      expect(result.user.name).toBe('Updated Name');
    });
  });

  describe('Store Auth State', () => {
    it('notifies subscribers when user state changes', () => {
      const callback = vi.fn();
      const unsubscribe = store.subscribe('user', callback);

      const mockUser = { id: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' };
      store.setState({ user: mockUser });

      expect(callback).toHaveBeenCalledWith(mockUser, null);

      unsubscribe();
      store.setState({ user: null });
      expect(callback).toHaveBeenCalledTimes(1); // Not called after unsubscribe
    });
  });

  describe('authView.renderNav', () => {
    it('renders Login/Register button when user is null (guest mode)', () => {
      const mockNav = {
        innerHTML: '',
        querySelector: vi.fn(() => ({ addEventListener: vi.fn() }))
      };
      authView.authNavContainer = mockNav;

      authView.renderNav(null);

      expect(mockNav.innerHTML).toContain('Login / Register');
      expect(mockNav.innerHTML).toContain('id="login-btn"');
    });

    it('renders user name, avatar, and logout button when user is logged in', () => {
      const mockNav = {
        innerHTML: '',
        querySelector: vi.fn(() => ({ addEventListener: vi.fn() }))
      };
      authView.authNavContainer = mockNav;

      authView.renderNav({ name: 'Alan Turing', email: 'alan@example.com' });

      expect(mockNav.innerHTML).toContain('Alan Turing');
      expect(mockNav.innerHTML).toContain('auth-nav-avatar');
      expect(mockNav.innerHTML).toContain('id="logout-btn"');
      expect(mockNav.innerHTML).toContain('Account');
    });
  });

  describe('accountView.mount', () => {
    it('renders "Account Access Required" prompt for guest users', async () => {
      store.setState({ user: null });
      const { container } = createMockContainer();

      await accountView.mount(container);

      expect(container.innerHTML).toContain('Account Access Required');
      expect(container.innerHTML).toContain('You must be logged in');
      expect(container.innerHTML).toContain('id="account-login-btn"');
    });

    it('renders full profile, edit form, and preferences for authenticated users', async () => {
      store.setState({
        user: {
          id: 'u-100',
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          role: 'User',
          preferences: { theme: 'dark', defaultSpeed: 1 },
          createdAt: new Date('2025-01-01').toISOString(),
          lastLoginAt: new Date('2025-01-02').toISOString()
        }
      });
      const { container } = createMockContainer();

      await accountView.mount(container);

      expect(container.innerHTML).toContain('Ada Lovelace');
      expect(container.innerHTML).toContain('ada@example.com');
      expect(container.innerHTML).toContain('Edit Profile');
      expect(container.innerHTML).toContain('profile-edit-form');
      expect(container.innerHTML).toContain('Preferences & Security');
      expect(container.innerHTML).toContain('preferences-form');
      expect(container.innerHTML).toContain('account-logout-btn');
    });
  });

  describe('loginView & registerView', () => {
    it('renders Sign In form with Login tab active for loginView', async () => {
      store.setState({ user: null });
      const { container } = createMockContainer();

      await loginView.mount(container);

      expect(container.innerHTML).toContain('Sign In to OS Simulator');
      expect(container.innerHTML).toContain('page-auth-form');
      expect(container.innerHTML).toContain('page-tab-login');
      expect(container.innerHTML).toContain('page-tab-register');
    });

    it('renders Create Account form for registerView', async () => {
      store.setState({ user: null });
      const { container } = createMockContainer();

      await registerView.mount(container);

      expect(container.innerHTML).toContain('Create an Account');
      expect(container.innerHTML).toContain('page-auth-name');
    });

    it('renders "Already Signed In" message when user is already authenticated', async () => {
      store.setState({
        user: { name: 'Grace Hopper', email: 'grace@example.com' }
      });
      const { container } = createMockContainer();

      await loginView.mount(container);

      expect(container.innerHTML).toContain('Already Signed In');
      expect(container.innerHTML).toContain('Grace Hopper');
    });
  });

  describe('Session Management & Logout', () => {
    it('checkSession sets user in store when /auth/me succeeds', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        success: true,
        user: { id: 'u1', name: 'Charles Babbage', email: 'charles@example.com' }
      });

      const user = await authView.checkSession();

      expect(user).toBeDefined();
      expect(store.getState('user')?.name).toBe('Charles Babbage');
      expect(store.getState('isAuthenticated')).toBe(true);
    });

    it('checkSession sets user to null when /auth/me fails (guest mode)', async () => {
      vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Unauthorized'));

      const user = await authView.checkSession();

      expect(user).toBeNull();
      expect(store.getState('user')).toBeNull();
      expect(store.getState('isAuthenticated')).toBe(false);
    });

    it('handleLogout calls /auth/logout and clears user from store', async () => {
      store.setState({ user: { name: 'Test' }, isAuthenticated: true });
      const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({ success: true });

      await authView.handleLogout();

      expect(postSpy).toHaveBeenCalledWith('/auth/logout');
      expect(store.getState('user')).toBeNull();
      expect(store.getState('isAuthenticated')).toBe(false);
    });
  });
});
