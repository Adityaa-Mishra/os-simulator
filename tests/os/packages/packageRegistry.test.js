/**
 * tests/os/packages/packageRegistry.test.js
 * Unit and integration tests for PackageRegistry (Phase 21).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PackageRegistry } from '../../../public/js/os/packages/PackageRegistry.js';
import { AppPackage } from '../../../public/js/os/packages/AppPackage.js';
import { PackageError } from '../../../public/js/os/packages/PackageErrors.js';
import { ApplicationLoader } from '../../../public/js/os/runtime/ApplicationLoader.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';

describe('Phase 21: PackageRegistry', () => {
  let registry;
  let loader;
  let mockRuntime;
  let samplePkg;

  beforeEach(() => {
    loader = new ApplicationLoader();
    mockRuntime = {
      getInstancesByAppId: vi.fn().mockReturnValue([]),
      terminate: vi.fn(),
      launch: vi.fn()
    };
    registry = new PackageRegistry({
      applicationLoader: loader,
      applicationRuntime: mockRuntime
    });

    samplePkg = new AppPackage({
      manifest: {
        id: 'test.notes',
        name: 'Notes App',
        version: '1.0.0',
        entry: 'app.js',
        description: 'A simple notes app',
        permissions: [PackagePermissions.FILESYSTEM_READ, PackagePermissions.FILESYSTEM_WRITE],
        window: { title: 'Notes', width: 500, height: 400 }
      },
      files: {
        'app.js': 'console.log("Notes loaded");'
      }
    });
  });

  describe('Installation', () => {
    it('installs a valid package and registers it in ApplicationLoader', () => {
      const entryFn = vi.fn();
      const result = registry.install(samplePkg, entryFn);

      expect(result.appId).toBe('test.notes');
      expect(result.version).toBe('1.0.0');
      expect(typeof result.installedAt).toBe('number');

      expect(registry.has('test.notes')).toBe(true);
      expect(loader.has('test.notes')).toBe(true);

      const loadedDef = loader.get('test.notes');
      expect(loadedDef.name).toBe('Notes App');
      expect(loadedDef.entry).toBe(entryFn);
      expect(loadedDef.permissions).toEqual([
        PackagePermissions.FILESYSTEM_READ,
        PackagePermissions.FILESYSTEM_WRITE
      ]);
    });

    it('DOES NOT launch the application upon installation', () => {
      registry.install(samplePkg, () => {});
      expect(mockRuntime.launch).not.toHaveBeenCalled();
    });

    it('rejects duplicate installation with EALREADY_INSTALLED', () => {
      registry.install(samplePkg, () => {});

      expect(() => registry.install(samplePkg, () => {})).toThrow(PackageError);
      try {
        registry.install(samplePkg, () => {});
      } catch (err) {
        expect(err.code).toBe('EALREADY_INSTALLED');
        expect(err.appId).toBe('test.notes');
      }
    });

    it('validates package before installation and rejects invalid package', () => {
      const invalidPkg = new AppPackage({
        manifest: { id: 'bad.app', name: '', version: '1.0.0', entry: 'app.js' },
        files: { 'app.js': 'x' }
      });

      expect(() => registry.install(invalidPkg)).toThrow(PackageError);
      expect(registry.has('bad.app')).toBe(false);
    });

    it('rolls back registry state if ApplicationLoader registration fails', () => {
      const failingLoader = {
        register: vi.fn().mockImplementation(() => {
          throw new Error('Loader registration error');
        })
      };
      const reg = new PackageRegistry({ applicationLoader: failingLoader });

      expect(() => reg.install(samplePkg, () => {})).toThrow(PackageError);
      try {
        reg.install(samplePkg, () => {});
      } catch (err) {
        expect(err.code).toBe('ETRANSACTION_FAILED');
        expect(err.appId).toBe('test.notes');
      }
      expect(reg.has('test.notes')).toBe(false);
    });
  });

  describe('Uninstallation', () => {
    beforeEach(() => {
      registry.install(samplePkg, () => {});
    });

    it('uninstalls an installed package cleanly', () => {
      const removed = registry.uninstall('test.notes');
      expect(removed).toBe(true);
      expect(registry.has('test.notes')).toBe(false);
      expect(loader.has('test.notes')).toBe(false);
    });

    it('throws ENOT_INSTALLED when attempting to uninstall a non-installed package', () => {
      expect(() => registry.uninstall('non.existent')).toThrow(PackageError);
      try {
        registry.uninstall('non.existent');
      } catch (err) {
        expect(err.code).toBe('ENOT_INSTALLED');
        expect(err.appId).toBe('non.existent');
      }
    });

    it('terminates any active instances during uninstallation', () => {
      mockRuntime.getInstancesByAppId.mockReturnValue([
        { instanceId: 'test.notes-1', state: 'RUNNING' },
        { instanceId: 'test.notes-2', state: 'PAUSED' },
        { instanceId: 'test.notes-3', state: 'TERMINATED' } // already terminated, should not terminate again
      ]);

      registry.uninstall('test.notes');

      expect(mockRuntime.terminate).toHaveBeenCalledTimes(2);
      expect(mockRuntime.terminate).toHaveBeenCalledWith('test.notes-1', 0);
      expect(mockRuntime.terminate).toHaveBeenCalledWith('test.notes-2', 0);
      expect(mockRuntime.terminate).not.toHaveBeenCalledWith('test.notes-3', 0);
    });
  });

  describe('Queries and Snapshot Safety', () => {
    beforeEach(() => {
      registry.install(samplePkg, () => {});
    });

    it('get() returns package snapshot or null', () => {
      const item = registry.get('test.notes');
      expect(item).toBeDefined();
      expect(item.version).toBe('1.0.0');
      expect(item.package.manifest.id).toBe('test.notes');

      expect(registry.get('unknown.app')).toBeNull();
    });

    it('list() returns all installed package metadata', () => {
      const list = registry.list();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('test.notes');
      expect(list[0].name).toBe('Notes App');
      expect(list[0].permissions).toEqual([
        PackagePermissions.FILESYSTEM_READ,
        PackagePermissions.FILESYSTEM_WRITE
      ]);
    });

    it('getState() and toJSON() provide safe snapshots', () => {
      const state = registry.getState();
      expect(state.installedCount).toBe(1);
      expect(state.packages).toHaveLength(1);

      const json = registry.toJSON();
      expect(json.installedCount).toBe(1);
    });
  });
});
