/**
 * public/js/os/packages/PackageParser.js
 * Parses raw package data (JSON string or object) into a validated AppPackage instance.
 * Strictly performs structural parsing without evaluating or executing code.
 */

import { AppPackage } from './AppPackage.js';
import { PackageValidator } from './PackageValidator.js';
import { PackageError } from './PackageErrors.js';

export class PackageParser {
  /**
   * Parse raw package data into a validated AppPackage.
   * Does NOT dynamically evaluate or compile code.
   * @param {string|Object} rawData
   * @returns {AppPackage}
   */
  static parse(rawData) {
    if (!rawData) {
      throw new PackageError({
        code: 'EPACKAGE_INVALID',
        message: 'Cannot parse empty or null package data'
      });
    }

    let pkg;
    try {
      pkg = AppPackage.deserialize(rawData);
    } catch (err) {
      throw new PackageError({
        code: 'EPACKAGE_INVALID',
        message: `Package deserialization failed: ${err.message}`,
        cause: err
      });
    }

    PackageValidator.assertValid(pkg);
    return pkg;
  }
}
