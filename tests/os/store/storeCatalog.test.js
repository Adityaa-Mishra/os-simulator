/**
 * tests/os/store/storeCatalog.test.js
 * Unit tests for StoreCatalog, StoreApp, and StoreRepository (Phase 22).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StoreCatalog } from '../../../public/js/os/store/StoreCatalog.js';
import { StoreApp } from '../../../public/js/os/store/StoreApp.js';
import { StoreRepository } from '../../../public/js/os/store/StoreRepository.js';
import { PackageBuilder } from '../../../public/js/os/packages/PackageBuilder.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';

describe('Phase 22: StoreCatalog & StoreRepository', () => {
  let catalog;
  let repository;

  beforeEach(() => {
    catalog = new StoreCatalog();
    repository = new StoreRepository({ catalog });
  });

  describe('Default Catalog', () => {
    it('initializes with default simulated test packages', () => {
      const apps = catalog.list();
      expect(apps.length).toBeGreaterThanOrEqual(3);

      const notes = catalog.getApp('example.notes');
      expect(notes).toBeDefined();
      expect(notes.name).toBe('Notes');
      expect(notes.category).toBe('Productivity');
      expect(notes.permissions).toContain(PackagePermissions.FILESYSTEM_READ);
      expect(notes.permissions).toContain(PackagePermissions.FILESYSTEM_WRITE);
      expect(notes.package.hasFile('app.js')).toBe(true);

      const calc = catalog.getApp('example.calculator');
      expect(calc).toBeDefined();
      expect(calc.name).toBe('Calculator');
      expect(calc.category).toBe('Utilities');

      const editor = catalog.getApp('example.text-editor');
      expect(editor).toBeDefined();
      expect(editor.name).toBe('Text Editor');
      expect(editor.category).toBe('Productivity');
    });

    it('each default package is valid and can be validated without errors', () => {
      for (const app of catalog.list()) {
        expect(app.package).toBeDefined();
        expect(app.package.manifest.id).toBe(app.id);
        expect(app.package.manifest.version).toBe(app.version);
        expect(app.package.hasFile(app.package.manifest.entry)).toBe(true);
      }
    });
  });

  describe('Catalog Queries', () => {
    it('filters applications by category', () => {
      const productivity = catalog.list('Productivity');
      expect(productivity.length).toBeGreaterThanOrEqual(2);
      expect(productivity.every(a => a.category === 'Productivity')).toBe(true);

      const utilities = catalog.list('Utilities');
      expect(utilities.length).toBeGreaterThanOrEqual(1);
      expect(utilities.every(a => a.category === 'Utilities')).toBe(true);

      const games = catalog.list('Games');
      expect(games).toHaveLength(0);
    });

    it('searches applications by keyword in id, name, description, and category', () => {
      const notesResults = catalog.search('notes');
      expect(notesResults.some(a => a.id === 'example.notes')).toBe(true);

      const calcResults = catalog.search('calc');
      expect(calcResults.some(a => a.id === 'example.calculator')).toBe(true);

      const prodResults = catalog.search('productivity');
      expect(prodResults.length).toBeGreaterThanOrEqual(2);

      const emptyResults = catalog.search('nonexistent_query_xyz');
      expect(emptyResults).toHaveLength(0);

      // Blank query returns all
      expect(catalog.search('')).toHaveLength(catalog.list().length);
    });

    it('gets available versions for an application', () => {
      expect(catalog.getVersions('example.notes')).toEqual(['1.0.0']);
      expect(catalog.getVersions('unknown.app')).toEqual([]);
    });
  });

  describe('Catalog Mutation', () => {
    it('adds and removes applications', () => {
      const customPkg = new PackageBuilder()
        .setManifest({
          id: 'custom.tool',
          name: 'Custom Tool',
          version: '1.2.0',
          entry: 'main.js',
          permissions: [PackagePermissions.PROCESS_SELF]
        })
        .addFile('main.js', '// custom tool')
        .build();

      const customApp = new StoreApp({
        id: 'custom.tool',
        name: 'Custom Tool',
        version: '1.2.0',
        description: 'A custom tool',
        category: 'Development',
        package: customPkg,
        trustedEntry: () => {}
      });

      catalog.addApp(customApp);
      expect(catalog.getApp('custom.tool')).toBe(customApp);

      const removed = catalog.removeApp('custom.tool');
      expect(removed).toBe(true);
      expect(catalog.getApp('custom.tool')).toBeNull();
    });

    it('rejects adding invalid app', () => {
      expect(() => catalog.addApp(null)).toThrow(TypeError);
      expect(() => catalog.addApp({})).toThrow(TypeError);
    });
  });

  describe('Snapshot & Serialization', () => {
    it('getState() and toJSON() return safe snapshot', () => {
      const state = catalog.getState();
      expect(state.count).toBe(catalog.list().length);
      expect(Array.isArray(state.apps)).toBe(true);

      const json = catalog.toJSON();
      expect(json.count).toBe(state.count);
    });
  });

  describe('StoreRepository', () => {
    it('fetches package for valid appId', () => {
      const pkg = repository.fetchPackage('example.notes');
      expect(pkg).toBeDefined();
      expect(pkg.manifest.id).toBe('example.notes');
    });

    it('rejects fetching package for unknown appId', () => {
      expect(() => repository.fetchPackage('does.not.exist')).toThrow();
    });

    it('queries available versions', () => {
      const versions = repository.getAvailableVersions('example.notes');
      expect(versions).toEqual(['1.0.0']);
    });
  });
});
