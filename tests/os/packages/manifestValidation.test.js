/**
 * tests/os/packages/manifestValidation.test.js
 * Unit tests for manifest schema validation in PackageValidator.
 */

import { describe, it, expect } from 'vitest';
import { PackageValidator } from '../../../public/js/os/packages/PackageValidator.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';

describe('Phase 21: Manifest Validation', () => {
  it('validates a correct manifest structure', () => {
    const manifest = {
      id: 'example.notes',
      name: 'Notes',
      version: '1.0.0',
      description: 'AdityyaOS notes application',
      author: 'AdityyaOS Team',
      entry: 'app.js',
      window: {
        width: 600,
        height: 400,
        resizable: true,
        singleton: true
      },
      permissions: [
        PackagePermissions.FILESYSTEM_READ,
        PackagePermissions.FILESYSTEM_WRITE,
        PackagePermissions.WINDOW_CONTROL
      ],
      memoryRequired: 32,
      icon: '📝'
    };

    const result = PackageValidator.validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects missing or non-object manifest', () => {
    expect(PackageValidator.validateManifest(null).valid).toBe(false);
    expect(PackageValidator.validateManifest(undefined).valid).toBe(false);
    expect(PackageValidator.validateManifest('string').valid).toBe(false);
    expect(PackageValidator.validateManifest({}).valid).toBe(false);
  });

  it('rejects missing or invalid application id', () => {
    expect(PackageValidator.validateManifest({ name: 'App', version: '1.0.0', entry: 'app.js' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: '', name: 'App', version: '1.0.0', entry: 'app.js' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app with spaces', name: 'App', version: '1.0.0', entry: 'app.js' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app$invalid', name: 'App', version: '1.0.0', entry: 'app.js' }).valid).toBe(false);
  });

  it('rejects missing or invalid version', () => {
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', entry: 'app.js' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', version: 'v1.0', entry: 'app.js' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', version: '1.0', entry: 'app.js' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', version: 'latest', entry: 'app.js' }).valid).toBe(false);
  });

  it('rejects missing or invalid entry path', () => {
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', version: '1.0.0' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', version: '1.0.0', entry: '' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', version: '1.0.0', entry: '../app.js' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', version: '1.0.0', entry: '/app.js' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', version: '1.0.0', entry: 'C:\\app.js' }).valid).toBe(false);
    expect(PackageValidator.validateManifest({ id: 'app', name: 'App', version: '1.0.0', entry: 'sub\\app.js' }).valid).toBe(false);
  });

  it('rejects invalid or duplicate permissions', () => {
    // Non-array permissions
    expect(PackageValidator.validateManifest({
      id: 'app', name: 'App', version: '1.0.0', entry: 'app.js', permissions: 'filesystem.read'
    }).valid).toBe(false);

    // Unknown permission
    expect(PackageValidator.validateManifest({
      id: 'app', name: 'App', version: '1.0.0', entry: 'app.js', permissions: ['system.root']
    }).valid).toBe(false);

    // Duplicate permission
    expect(PackageValidator.validateManifest({
      id: 'app', name: 'App', version: '1.0.0', entry: 'app.js',
      permissions: ['filesystem.read', 'filesystem.read']
    }).valid).toBe(false);
  });

  it('rejects invalid window configuration', () => {
    expect(PackageValidator.validateManifest({
      id: 'app', name: 'App', version: '1.0.0', entry: 'app.js', window: 'invalid'
    }).valid).toBe(false);

    expect(PackageValidator.validateManifest({
      id: 'app', name: 'App', version: '1.0.0', entry: 'app.js', window: { width: -10 }
    }).valid).toBe(false);

    expect(PackageValidator.validateManifest({
      id: 'app', name: 'App', version: '1.0.0', entry: 'app.js', window: { resizable: 'yes' }
    }).valid).toBe(false);
  });

  it('rejects invalid memoryRequired', () => {
    expect(PackageValidator.validateManifest({
      id: 'app', name: 'App', version: '1.0.0', entry: 'app.js', memoryRequired: -10
    }).valid).toBe(false);

    expect(PackageValidator.validateManifest({
      id: 'app', name: 'App', version: '1.0.0', entry: 'app.js', memoryRequired: '64MB'
    }).valid).toBe(false);
  });
});
