/**
 * public/js/os/runtime/ApplicationValidator.js
 * Validates in-memory AdityyaOS application definitions against manifest schema requirements.
 */

export class ApplicationValidator {
  /**
   * Validate an application definition.
   * @param {Object} def
   * @returns {{ valid: boolean, errors: string[] }}
   */
  static validate(def) {
    const errors = [];

    if (!def || typeof def !== 'object') {
      return { valid: false, errors: ['Application definition must be a non-null object'] };
    }

    // Validate ID
    if (!def.id || typeof def.id !== 'string') {
      errors.push('Application "id" is required and must be a non-empty string');
    } else if (!/^[a-zA-Z0-9._-]+$/.test(def.id)) {
      errors.push(`Application "id" "${def.id}" contains invalid characters (allowed: alphanumeric, ., _, -)`);
    }

    // Validate Name
    if (!def.name || typeof def.name !== 'string' || !def.name.trim()) {
      errors.push('Application "name" is required and must be a non-empty string');
    }

    // Validate Version
    if (!def.version || typeof def.version !== 'string' || !def.version.trim()) {
      errors.push('Application "version" is required and must be a non-empty string');
    }

    // Validate Entry
    if (typeof def.entry !== 'function') {
      errors.push('Application "entry" is required and must be an executable function');
    }

    // Validate Window options if provided
    if (def.window !== undefined && def.window !== null) {
      if (typeof def.window !== 'object') {
        errors.push('Application "window" configuration must be an object');
      } else {
        if (def.window.width !== undefined && (typeof def.window.width !== 'number' || def.window.width <= 0)) {
          errors.push('Application window "width" must be a positive number');
        }
        if (def.window.height !== undefined && (typeof def.window.height !== 'number' || def.window.height <= 0)) {
          errors.push('Application window "height" must be a positive number');
        }
      }
    }

    // Validate Permissions if provided
    if (def.permissions !== undefined && def.permissions !== null) {
      if (!Array.isArray(def.permissions)) {
        errors.push('Application "permissions" must be an array of strings');
      } else {
        for (let i = 0; i < def.permissions.length; i++) {
          if (typeof def.permissions[i] !== 'string') {
            errors.push(`Application permission at index ${i} must be a string`);
          }
        }
      }
    }

    // Validate Memory Required if provided
    if (def.memoryRequired !== undefined && (typeof def.memoryRequired !== 'number' || isNaN(def.memoryRequired) || def.memoryRequired < 0)) {
      errors.push('Application "memoryRequired" must be a non-negative number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Assert an application definition is valid, throwing an Error if not.
   * @param {Object} def
   */
  static assertValid(def) {
    const result = this.validate(def);
    if (!result.valid) {
      throw new Error(`Invalid application definition: ${result.errors.join('; ')}`);
    }
  }
}
