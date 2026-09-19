/**
 * Centralized Educational Content Aggregator & Search Index
 * Exports all 6 learning modules and provides client-side search capabilities.
 */

import { cpuLessons } from './cpuLessons.js';
import { processLessons } from './processLessons.js';
import { memoryLessons } from './memoryLessons.js';
import { diskLessons } from './diskLessons.js';
import { deadlockLessons } from './deadlockLessons.js';
import { filesystemLessons } from './filesystemLessons.js';

export const learningModules = {
  cpu: cpuLessons,
  process: processLessons,
  memory: memoryLessons,
  disk: diskLessons,
  deadlock: deadlockLessons,
  filesystem: filesystemLessons
};

/**
 * Retrieve a learning module by ID
 * @param {string} id - 'cpu' | 'process' | 'memory' | 'disk' | 'deadlock' | 'filesystem'
 * @returns {object|null}
 */
export function getLearningModule(id) {
  if (!id || typeof id !== 'string') return null;
  return learningModules[id.toLowerCase()] || null;
}

/**
 * Retrieve all learning modules as an array
 * @returns {Array<object>}
 */
export function getAllLearningModules() {
  return Object.values(learningModules);
}

/**
 * Client-side keyword search across all learning modules, concepts, key terms, and quizzes.
 * @param {string} query - Keyword or phrase to search
 * @returns {Array<{ module: object, matches: Array<{ type: string, title: string, snippet: string }> }>}
 */
export function searchLearningContent(query) {
  if (!query || typeof query !== 'string') return [];
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length === 0) return [];

  const results = [];

  for (const mod of Object.values(learningModules)) {
    const matches = [];

    // Check module title & description
    if (mod.title.toLowerCase().includes(cleanQuery) || mod.description.toLowerCase().includes(cleanQuery)) {
      matches.push({
        type: 'Module',
        title: mod.title,
        snippet: mod.description
      });
    }

    // Check concepts
    if (Array.isArray(mod.concepts)) {
      for (const concept of mod.concepts) {
        if (concept.title.toLowerCase().includes(cleanQuery) || concept.content.toLowerCase().includes(cleanQuery)) {
          // Extract short snippet around query
          const idx = concept.content.toLowerCase().indexOf(cleanQuery);
          const start = Math.max(0, idx - 40);
          const end = Math.min(concept.content.length, idx + cleanQuery.length + 60);
          const snippet = (start > 0 ? '...' : '') + concept.content.substring(start, end).replace(/[#*`_]/g, '') + '...';

          matches.push({
            type: 'Concept',
            title: concept.title,
            snippet
          });
        }
      }
    }

    // Check key terms
    if (Array.isArray(mod.keyTerms)) {
      for (const item of mod.keyTerms) {
        if (item.term.toLowerCase().includes(cleanQuery) || item.definition.toLowerCase().includes(cleanQuery)) {
          matches.push({
            type: 'Key Term',
            title: item.term,
            snippet: item.definition
          });
        }
      }
    }

    // Check quiz questions
    if (Array.isArray(mod.quiz)) {
      for (const q of mod.quiz) {
        if (q.question.toLowerCase().includes(cleanQuery) || q.explanation.toLowerCase().includes(cleanQuery)) {
          matches.push({
            type: 'Quiz Question',
            title: q.question,
            snippet: q.explanation
          });
        }
      }
    }

    if (matches.length > 0) {
      results.push({
        module: mod,
        matches
      });
    }
  }

  return results;
}
