/**
 * tests/os/store/storeInstall.test.js
 * Unit and integration tests for StoreService installation and uninstallation workflows (Phase 22).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StoreService } from '../../../public/js/os/store/StoreService.js';
import { StoreCatalog } from '../../../public/js/os/store/StoreCatalog.js';
import { StoreEvents } from '../../../public/js/os/store/StoreEvents.js';
import { StoreError } from '../../../public/js/os/store/StoreErrors.js';
import { PackageRegistry } from '../../../public/js/os/packages/PackageRegistry.js';
import { ApplicationLoader } from '../../../public/js/os/runtime/ApplicationLoader.js';
import { OSEventEmitter } from '../../../public/js/os/kernel/OSEventEmitter.js';

describe('Phase 22: StoreService Installation & Uninstallation', () => {
  let store;
  let catalog;
  let packageRegistry;
  let loader;
  let mockRuntime;
  let events;

  beforeEach(() => {
    events = new OSEventEmitter();
    loader = new ApplicationLoader();
    mockRuntime = {
      getInstancesByAppId: vi.fn().mockReturnValue([]),
      terminate: vi.fn(),
      launch: vi.fn()
    };
    packageRegistry = new PackageRegistry({
      applicationLoader: loader,
      applicationRuntime: mockRuntime
    });
    catalog = new StoreCatalog();
    store = new StoreService({
      packageRegistry,
      catalog,
      events
    });
  });

  describe('Installation', () => {
    it('installs an app from the catalog into PackageRegistry and ApplicationLoader', () => {
      const listener = vi.fn();
      events.on(StoreEvents.STORE_APP_INSTALLED, listener);

      const result = store.install('example.notes');

      expect(result.appId).toBe('example.notes');
      expect(result.version).toBe('1.0.0');
      expect(result.isInstalled).toBe(true);
      expect(typeof result.installedAt).toBe('number');

      // Check registry and loader
      expect(store.isInstalled('example.notes')).toBe(true);
      expect(packageRegistry.has('example.notes')).toBe(true);
      expect(loader.has('example.notes')).toBe(true);

      // Verify event was fired
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        appId: 'example.notes',
        version: '1.0.0'
      }));
    });

    it('DOES NOT automatically launch the application upon installation', () => {
      store.install('example.calculator');

      expect(mockRuntime.launch).not.toHaveBeenCalled();
      expect(mockRuntime.getInstancesByAppId('example.calculator')).toHaveLength(0);
    });

    it('rejects installation of non-existent app with ESTORE_APP_NOT_FOUND', () => {
      expect(() => store.install('non.existent.app')).toThrow(StoreError);

      try {
        store.install('non.existent.app');
      } catch (err) {
        expect(err.code).toBe('ESTORE_APP_NOT_FOUND');
        expect(err.appId).toBe('non.existent.app');
      }
    });

    it('rejects duplicate installation with ESTORE_ALREADY_INSTALLED', () => {
      store.install('example.notes');

      expect(() => store.install('example.notes')).toThrow(StoreError);

      try {
        store.install('example.notes');
      } catch (err) {
        expect(err.code).toBe('ESTORE_ALREADY_INSTALLED');
        expect(err.appId).toBe('example.notes');
      }
    });

    it('handles installation failure and emits STORE_INSTALL_FAILED', () => {
      const failListener = vi.fn();
      events.on(StoreEvents.STORE_INSTALL_FAILED, failListener);

      // Force packageRegistry to fail
      vi.spyOn(packageRegistry, 'install').mockImplementation(() => {
        throw new Error('Disk full');
      });

      expect(() => store.install('example.notes')).toThrow(StoreError);

      try {
        store.install('example.notes');
      } catch (err) {
        expect(err.code).toBe('ESTORE_INSTALL_FAILED');
        expect(err.appId).toBe('example.notes');
      }

      expect(failListener).toHaveBeenCalledWith(expect.objectContaining({
        appId: 'example.notes',
        error: 'Disk full'
      }));
      expect(store.isInstalled('example.notes')).toBe(false);
    });
  });

  describe('Uninstallation', () => {
    beforeEach(() => {
      store.install('example.notes');
    });

    it('uninstalls an installed application cleanly', () => {
      const uninstalledListener = vi.fn();
      events.on(StoreEvents.STORE_APP_UNINSTALLED, uninstalledListener);

      const success = store.uninstall('example.notes');

      expect(success).toBe(true);
      expect(store.isInstalled('example.notes')).toBe(false);
      expect(packageRegistry.has('example.notes')).toBe(false);
      expect(loader.has('example.notes')).toBe(false);

      expect(uninstalledListener).toHaveBeenCalledWith({ appId: 'example.notes' });
    });

    it('rejects uninstalling an app that is not installed with ESTORE_APP_NOT_FOUND', () => {
      expect(() => store.uninstall('example.calculator')).toThrow(StoreError);

      try {
        store.uninstall('example.calculator');
      } catch (err) {
        expect(err.code).toBe('ESTORE_APP_NOT_FOUND');
        expect(err.appId).toBe('example.calculator');
      }
    });
  });

  describe('Listing with Installation Status', () => {
    it('accurately reports isInstalled flag in list() and search()', () => {
      store.install('example.calculator');

      const all = store.list();
      const calc = all.find(a => a.id === 'example.calculator');
      const notes = all.find(a => a.id === 'example.notes');

      expect(calc.isInstalled).toBe(true);
      expect(notes.isInstalled).toBe(false);

      const searched = store.search('calculator');
      expect(searched[0].isInstalled).toBe(true);
    });

    it('accurately reports isInstalled in get()', () => {
      expect(store.get('example.calculator').isInstalled).toBe(false);
      store.install('example.calculator');
      expect(store.get('example.calculator').isInstalled).toBe(true);
      expect(store.get('unknown.app')).toBeNull();
    });
  });
});
