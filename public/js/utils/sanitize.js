/**
 * HTML Entity Escaping Utility (Vanilla JS ES6+)
 * Prevents Cross-Site Scripting (XSS) by encoding dangerous characters before DOM insertion.
 */

export function escapeHtml(str) {
  if (str === null || str === undefined) {
    return '';
  }
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
