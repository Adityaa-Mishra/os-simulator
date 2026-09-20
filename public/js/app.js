/**
 * Application Bootstrap (Vanilla JS ES6+)
 * Initializes state store, auth session, router, mobile navigation, and UI listeners.
 */

import { store } from './core/store.js';
import { Router } from './core/router.js';
import { authView, accountView, loginView, registerView } from './views/authView.js';
import { dashboardView } from './views/dashboardView.js';
import { cpuView } from './views/cpuView.js';
import { processView } from './views/processView.js';
import { memoryView } from './views/memoryView.js';
import { diskView } from './views/diskView.js';
import { deadlockView } from './views/deadlockView.js';
import { filesystemView } from './views/filesystemView.js';
import { savedView } from './views/savedView.js';
import { historyView } from './views/historyView.js';
import { learnHubView } from './views/learnHubView.js';
import { moduleLearnView } from './views/moduleLearnView.js';
import { desktopView } from './views/desktopView.js';
import './engines/cpu/index.js'; // Auto-registers all CPU scheduling algorithms
import './engines/process/index.js'; // Auto-registers Process Management engine
import './engines/memory/index.js'; // Auto-registers Memory Allocation engines
import './engines/memory/pageReplacement/index.js'; // Auto-registers Page Replacement engines
import './engines/disk/index.js'; // Auto-registers Disk Scheduling engines
import './engines/deadlock/index.js'; // Auto-registers Deadlock Management engines
import './engines/filesystem/index.js'; // Auto-registers File System Simulator engine

// Setup theme switcher (Default to modern Dark theme)
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const currentTheme = savedTheme || store.getState('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', currentTheme);
  store.setState({ theme: currentTheme });
  
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon');

  if (themeIcon) {
    themeIcon.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const activeTheme = document.documentElement.getAttribute('data-theme');
      const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', nextTheme);
      localStorage.setItem('theme', nextTheme);
      store.setState({ theme: nextTheme });
      if (themeIcon) {
        themeIcon.textContent = nextTheme === 'dark' ? '☀️' : '🌙';
      }
    });
  }
}

// Setup mobile navigation drawer
function initMobileNavigation() {
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  if (!mobileMenuBtn || !sidebar || !backdrop) return;

  const closeSidebar = () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    mobileMenuBtn.setAttribute('aria-expanded', 'false');
  };

  const openSidebar = () => {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    mobileMenuBtn.setAttribute('aria-expanded', 'true');
  };

  mobileMenuBtn.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  backdrop.addEventListener('click', closeSidebar);

  // Close mobile drawer when a navigation link is clicked
  sidebar.querySelectorAll('.nav-item').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        closeSidebar();
      }
    });
  });

  // Global Escape key dismiss for modals and drawers
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSidebar();
      authView.closeModal();
    }
  });
}

// Bootstrap the application on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileNavigation();
  authView.init();

  const viewContainer = document.getElementById('view-container');
  const router = new Router(viewContainer);

  // Register SPA routes
  router.register('#/', dashboardView, { title: 'Dashboard' });
  router.register('#/os', desktopView, { title: 'AdityyaOS Desktop' });
  router.register('#/cpu', cpuView, { title: 'CPU Scheduling' });
  router.register('#/process', processView, { title: 'Process Management' });
  router.register('#/memory', memoryView, { title: 'Memory Management' });
  router.register('#/disk', diskView, { title: 'Disk Scheduling' });
  router.register('#/deadlock', deadlockView, { title: 'Deadlock Management' });
  router.register('#/filesystem', filesystemView, { title: 'File System Simulation' });
  router.register('#/account', accountView, { title: 'User Account' });
  router.register('#/saved', savedView, { title: 'Saved Simulations' });
  router.register('#/history', historyView, { title: 'Simulation History' });
  router.register('#/login', loginView, { title: 'Sign In' });
  router.register('#/register', registerView, { title: 'Create Account' });
  router.register('#/learn', learnHubView, { title: 'Learning Hub' });
  router.register('#/learn/cpu', moduleLearnView, { module: 'cpu', title: 'Learn CPU Scheduling' });
  router.register('#/learn/process', moduleLearnView, { module: 'process', title: 'Learn Process Management' });
  router.register('#/learn/memory', moduleLearnView, { module: 'memory', title: 'Learn Memory Management' });
  router.register('#/learn/disk', moduleLearnView, { module: 'disk', title: 'Learn Disk Scheduling' });
  router.register('#/learn/deadlock', moduleLearnView, { module: 'deadlock', title: 'Learn Deadlock Management' });
  router.register('#/learn/filesystem', moduleLearnView, { module: 'filesystem', title: 'Learn File System' });

  // Initialize router
  router.init();

  console.log('[OS Simulator] Client SPA initialized successfully in Light Theme mode.');
});
