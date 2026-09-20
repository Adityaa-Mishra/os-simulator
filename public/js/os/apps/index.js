/**
 * public/js/os/apps/index.js
 * Central gateway and registration adapter for native AdityyaOS applications.
 * Collects and exports all Phase 23 & Phase 24 application definitions.
 * Adapts to ApplicationLoader and ApplicationRegistry without duplicating runtime logic.
 */

import { filesApp, FileManager, FilesApp } from './files/FileManager.js';
import { terminalApp } from './terminal/index.js';
import { notesApp } from './notes/index.js';
import { calculatorApp, Calculator, CalculatorApp } from './calculator/Calculator.js';
import { textEditorApp, TextEditor, TextEditorApp } from './editor/TextEditor.js';
import { imageViewerApp } from './image-viewer/index.js';
import { settingsApp, SettingsApp } from './settings/SettingsApp.js';
import { taskManagerApp, TaskManagerApp } from './task-manager/TaskManagerApp.js';
import { systemMonitorApp, SystemMonitorApp } from './system-monitor/SystemMonitorApp.js';
import { browserApp, BrowserApp } from './browser/BrowserApp.js';

export {
  filesApp,
  FileManager,
  FilesApp,
  terminalApp,
  notesApp,
  calculatorApp,
  Calculator,
  CalculatorApp,
  textEditorApp,
  TextEditor,
  TextEditorApp,
  imageViewerApp,
  settingsApp,
  SettingsApp,
  taskManagerApp,
  TaskManagerApp,
  systemMonitorApp,
  SystemMonitorApp,
  browserApp,
  BrowserApp
};

export const NATIVE_APPLICATIONS = Object.freeze([
  filesApp,
  terminalApp,
  notesApp,
  calculatorApp,
  textEditorApp,
  imageViewerApp,
  settingsApp,
  taskManagerApp,
  systemMonitorApp,
  browserApp
]);

/**
 * Register all native application definitions into ApplicationLoader and optionally ApplicationRegistry.
 * Sets up hyphenated and unhyphenated aliases (e.g. task-manager and taskmanager).
 * @param {Object} options
 * @param {import('../runtime/ApplicationLoader.js').ApplicationLoader} options.loader
 * @param {import('../shell/ApplicationRegistry.js').ApplicationRegistry} [options.registry]
 */
export function registerNativeApplications({ loader, registry = null }) {
  if (!loader || typeof loader.register !== 'function') {
    throw new TypeError('registerNativeApplications requires an ApplicationLoader instance');
  }

  for (const app of NATIVE_APPLICATIONS) {
    if (!loader.has(app.id)) {
      loader.register(app);
    }
  }

  // Register aliases for backward compatibility with Launcher / SYSTEM_APPLICATIONS
  if (!loader.has('taskmanager')) {
    loader.register({ ...taskManagerApp, id: 'taskmanager' });
  }
  if (!loader.has('systemmonitor')) {
    loader.register({ ...systemMonitorApp, id: 'systemmonitor' });
  }

  // If ApplicationRegistry is provided, register additional applications
  if (registry && typeof registry.register === 'function') {
    if (!registry.has('text-editor')) {
      registry.register({
        id: 'text-editor',
        name: textEditorApp.name,
        icon: textEditorApp.icon,
        category: textEditorApp.category,
        description: textEditorApp.description,
        singleton: false,
        defaultWidth: textEditorApp.window.width,
        defaultHeight: textEditorApp.window.height,
        createView: (context) => (typeof registry.createAppView === 'function'
          ? registry.createAppView(textEditorApp, context)
          : { mount: (container) => textEditorApp.entry(null, container, {}), unmount: () => {} })
      });
    }
    if (!registry.has('image-viewer')) {
      registry.register({
        id: 'image-viewer',
        name: imageViewerApp.name,
        icon: imageViewerApp.icon,
        category: imageViewerApp.category,
        description: imageViewerApp.description,
        singleton: false,
        defaultWidth: imageViewerApp.window.width,
        defaultHeight: imageViewerApp.window.height,
        createView: (context) => (typeof registry.createAppView === 'function'
          ? registry.createAppView(imageViewerApp, context)
          : { mount: (container) => imageViewerApp.entry(null, container, {}), unmount: () => {} })
      });
    }
    if (!registry.has('task-manager') && registry.has('taskmanager')) {
      registry.register({
        ...registry.get('taskmanager'),
        id: 'task-manager'
      });
    }
    if (!registry.has('system-monitor') && registry.has('systemmonitor')) {
      registry.register({
        ...registry.get('systemmonitor'),
        id: 'system-monitor'
      });
    }
  }
}
