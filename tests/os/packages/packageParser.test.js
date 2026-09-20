/**
 * tests/os/packages/packageParser.test.js
 * Unit tests for AppPackage serialization, PackageBuilder, and PackageParser.
 * Proves zero dynamic code execution and JSON-only serialization.
 */

import { describe, it, expect } from 'vitest';
import { PackageBuilder } from '../../../public/js/os/packages/PackageBuilder.js';
import { PackageParser } from '../../../public/js/os/packages/PackageParser.js';
import { AppPackage } from '../../../public/js/os/packages/AppPackage.js';
import { PackageError } from '../../../public/js/os/packages/PackageErrors.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';

describe('Phase 21: Package Parser & Serialization', () => {
  const validManifest = {
    id: 'example.notes',
    name: 'Notes',
    version: '1.0.0',
    entry: 'app.js',
    permissions: [PackagePermissions.FILESYSTEM_READ]
  };

  it('builds a valid AppPackage using PackageBuilder', () => {
    const pkg = new PackageBuilder()
      .setManifest(validManifest)
      .addFile('app.js', 'console.log("Hello from virtual notes");')
      .addFile('style.css', 'body { color: red; }')
      .build();

    expect(pkg).toBeInstanceOf(AppPackage);
    expect(pkg.getManifest().id).toBe('example.notes');
    expect(pkg.hasFile('app.js')).toBe(true);
    expect(pkg.hasFile('style.css')).toBe(true);
    expect(pkg.getFile('app.js')).toBe('console.log("Hello from virtual notes");');
  });

  it('rejects package with missing declared entry file', () => {
    const builder = new PackageBuilder()
      .setManifest({
        id: 'example.test',
        name: 'Test',
        version: '1.0.0',
        entry: 'main.js'
      })
      .addFile('other.js', 'console.log(1);');

    expect(() => builder.build()).toThrow(PackageError);
  });

  it('rejects package files with directory traversal or host paths', () => {
    // Directory traversal
    expect(() => {
      new PackageBuilder()
        .setManifest(validManifest)
        .addFile('app.js', 'code')
        .addFile('../secret.txt', 'forbidden')
        .build();
    }).toThrow(PackageError);

    // Host Windows drive path
    expect(() => {
      new PackageBuilder()
        .setManifest(validManifest)
        .addFile('app.js', 'code')
        .addFile('C:\\Windows\\win.ini', 'forbidden')
        .build();
    }).toThrow(PackageError);

    // Host UNC path
    expect(() => {
      new PackageBuilder()
        .setManifest(validManifest)
        .addFile('app.js', 'code')
        .addFile('\\\\server\\share\\file', 'forbidden')
        .build();
    }).toThrow(PackageError);
  });

  it('serializes and deserializes cleanly with strictly JSON-compatible data', () => {
    const pkg = new PackageBuilder()
      .setManifest(validManifest)
      .addFile('app.js', 'const x = 42;')
      .build();

    const serializedStr = pkg.serialize(true);
    expect(typeof serializedStr).toBe('string');

    // Parse with standard JSON.parse to verify valid JSON
    const parsedJson = JSON.parse(serializedStr);
    expect(parsedJson.manifest.id).toBe('example.notes');
    expect(parsedJson.files['app.js']).toBe('const x = 42;');

    // Deserialize back into AppPackage
    const deserializedPkg = AppPackage.deserialize(serializedStr);
    expect(deserializedPkg).toBeInstanceOf(AppPackage);
    expect(deserializedPkg.getManifest().id).toBe('example.notes');
    expect(deserializedPkg.getFile('app.js')).toBe('const x = 42;');
  });

  it('proves that functions are NEVER serialized into package data', () => {
    const pkg = new AppPackage({
      manifest: validManifest,
      files: {
        'app.js': 'text code only',
        'bad_function.js': () => { return 'malicious'; }
      }
    });

    const serialized = pkg.serialize(false);
    expect(serialized.files['app.js']).toBe('text code only');
    expect(typeof serialized.files['bad_function.js']).toBe('string');
    // Function was coerced to string or excluded, never stored as an executable function
    expect(typeof serialized.files['bad_function.js']).not.toBe('function');

    const jsonStr = JSON.stringify(serialized);
    const roundTrip = JSON.parse(jsonStr);
    for (const key of Object.keys(roundTrip.files)) {
      expect(typeof roundTrip.files[key]).toBe('string');
    }
  });

  it('proves that PackageParser parses packages without dynamically evaluating app.js', () => {
    const rawData = {
      format: 'aapp/1.0',
      manifest: validManifest,
      files: {
        'app.js': 'throw new Error("This must never be executed by the parser!");'
      }
    };

    // Parsing must succeed and NOT throw the error from app.js!
    const parsedPkg = PackageParser.parse(rawData);
    expect(parsedPkg).toBeInstanceOf(AppPackage);
    expect(parsedPkg.getFile('app.js')).toContain('This must never be executed');
  });
});
