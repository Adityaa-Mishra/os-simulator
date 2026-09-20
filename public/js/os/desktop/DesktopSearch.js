/**
 * DesktopSearch
 * Search and filter utility for AdityyaOS launcher items and commands.
 */

export class DesktopSearch {
  /**
   * Filter a list of application descriptors or items by a search query.
   * @param {Array<Object>} items
   * @param {string} query
   * @returns {Array<Object>}
   */
  static filter(items = [], query = '') {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return [...items];

    return items.filter(item => {
      const name = (item.name || '').toLowerCase();
      const id = (item.id || '').toLowerCase();
      const description = (item.description || '').toLowerCase();
      const category = (item.category || '').toLowerCase();
      const keywords = Array.isArray(item.keywords) ? item.keywords.join(' ').toLowerCase() : '';

      return (
        name.includes(cleanQuery) ||
        id.includes(cleanQuery) ||
        description.includes(cleanQuery) ||
        category.includes(cleanQuery) ||
        keywords.includes(cleanQuery)
      );
    });
  }
}
