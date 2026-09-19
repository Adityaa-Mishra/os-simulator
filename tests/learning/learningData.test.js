import { describe, it, expect } from 'vitest';
import {
  learningModules,
  getLearningModule,
  getAllLearningModules,
  searchLearningContent
} from '../../public/js/learning/learningData.js';

describe('Phase 10: Learning Data & Content Architecture Tests', () => {
  const expectedModuleIds = ['cpu', 'process', 'memory', 'disk', 'deadlock', 'filesystem'];

  it('contains all six core learning modules', () => {
    const modules = getAllLearningModules();
    expect(modules).toHaveLength(6);

    for (const id of expectedModuleIds) {
      const mod = getLearningModule(id);
      expect(mod).toBeDefined();
      expect(mod.id).toBe(id);
    }
  });

  it('validates that every module has all required structural fields', () => {
    for (const id of expectedModuleIds) {
      const mod = getLearningModule(id);

      expect(typeof mod.title).toBe('string');
      expect(mod.title.length).toBeGreaterThan(0);

      expect(typeof mod.description).toBe('string');
      expect(mod.description.length).toBeGreaterThan(0);

      expect(typeof mod.icon).toBe('string');
      expect(typeof mod.simulatorRoute).toBe('string');
      expect(mod.simulatorRoute.startsWith('#/')).toBe(true);

      // Objectives
      expect(Array.isArray(mod.objectives)).toBe(true);
      expect(mod.objectives.length).toBeGreaterThanOrEqual(3);

      // Concepts
      expect(Array.isArray(mod.concepts)).toBe(true);
      expect(mod.concepts.length).toBeGreaterThanOrEqual(2);
      for (const concept of mod.concepts) {
        expect(typeof concept.id).toBe('string');
        expect(typeof concept.title).toBe('string');
        expect(typeof concept.content).toBe('string');
        expect(concept.content.length).toBeGreaterThan(50);
      }

      // Worked Example
      expect(mod.workedExample).toBeDefined();
      expect(typeof mod.workedExample.title).toBe('string');
      expect(typeof mod.workedExample.description).toBe('string');
      expect(typeof mod.workedExample.walkthrough).toBe('string');
      expect(mod.workedExample.sampleInputs).toBeDefined();
      expect(typeof mod.workedExample.sampleInputs.algorithm).toBe('string');
      expect(mod.workedExample.sampleInputs.inputs).toBeDefined();

      // Key Terms
      expect(Array.isArray(mod.keyTerms)).toBe(true);
      expect(mod.keyTerms.length).toBeGreaterThanOrEqual(4);
      for (const term of mod.keyTerms) {
        expect(typeof term.term).toBe('string');
        expect(typeof term.definition).toBe('string');
        expect(term.definition.length).toBeGreaterThan(10);
      }

      // Quiz
      expect(Array.isArray(mod.quiz)).toBe(true);
      expect(mod.quiz.length).toBeGreaterThanOrEqual(5);
      expect(mod.quiz.length).toBeLessThanOrEqual(8);
      for (const q of mod.quiz) {
        expect(typeof q.id).toBe('string');
        expect(typeof q.question).toBe('string');
        expect(Array.isArray(q.options)).toBe(true);
        expect(q.options.length).toBeGreaterThanOrEqual(3);
        expect(typeof q.correctAnswer).toBe('number');
        expect(q.correctAnswer).toBeGreaterThanOrEqual(0);
        expect(q.correctAnswer).toBeLessThan(q.options.length);
        expect(typeof q.explanation).toBe('string');
        expect(q.explanation.length).toBeGreaterThan(15);
      }
    }
  });

  describe('Educational Accuracy & Domain Clarifications', () => {
    it('memory module explicitly clarifies fixed partition vs. paging and avoids claiming dynamic partition support', () => {
      const mem = getLearningModule('memory');
      const allText = JSON.stringify(mem);
      expect(allText.toLowerCase()).toContain('fixed partition');
      expect(allText.toLowerCase()).toContain('paging');
      expect(allText.toLowerCase()).toContain('internal fragmentation');
      expect(allText.toLowerCase()).toContain('external fragmentation');
      expect(allText.toLowerCase()).toContain('belady');
    });

    it('deadlock module clarifies that unsafe state is not automatically an existing deadlock', () => {
      const dl = getLearningModule('deadlock');
      const allText = JSON.stringify(dl);
      expect(allText.toLowerCase()).toContain('unsafe state is not automatically');
      expect(allText.toLowerCase()).toContain('banker');
      expect(allText.toLowerCase()).toContain('coffman');
      expect(allText.toLowerCase()).toContain('circular wait');
    });

    it('filesystem module explicitly states it is an in-memory educational VFS', () => {
      const fs = getLearningModule('filesystem');
      const allText = JSON.stringify(fs);
      expect(allText.toLowerCase()).toContain('in-memory');
      expect(allText.toLowerCase()).toContain('contiguous');
      expect(allText.toLowerCase()).toContain('first-fit');
      expect(allText.toLowerCase()).toContain('fragmentation');
    });

    it('disk module covers seek time optimization and abstracts rotational latency', () => {
      const disk = getLearningModule('disk');
      const allText = JSON.stringify(disk);
      expect(allText.toLowerCase()).toContain('seek time');
      expect(allText.toLowerCase()).toContain('rotational latency');
      expect(allText.toLowerCase()).toContain('sstf');
      expect(allText.toLowerCase()).toContain('scan');
      expect(allText.toLowerCase()).toContain('look');
    });
  });

  describe('searchLearningContent', () => {
    it('finds memory management content when searching for "paging"', () => {
      const results = searchLearningContent('paging');
      expect(results.length).toBeGreaterThan(0);
      const memResult = results.find(r => r.module.id === 'memory');
      expect(memResult).toBeDefined();
      expect(memResult.matches.length).toBeGreaterThan(0);
    });

    it('finds deadlock management content when searching for "banker"', () => {
      const results = searchLearningContent('banker');
      expect(results.length).toBeGreaterThan(0);
      const dlResult = results.find(r => r.module.id === 'deadlock');
      expect(dlResult).toBeDefined();
    });

    it('finds CPU scheduling content when searching for "convoy"', () => {
      const results = searchLearningContent('convoy');
      expect(results.length).toBeGreaterThan(0);
      const cpuResult = results.find(r => r.module.id === 'cpu');
      expect(cpuResult).toBeDefined();
    });

    it('finds file system content when searching for "vfs"', () => {
      const results = searchLearningContent('vfs');
      expect(results.length).toBeGreaterThan(0);
      const fsResult = results.find(r => r.module.id === 'filesystem');
      expect(fsResult).toBeDefined();
    });

    it('returns empty array for empty or whitespace query', () => {
      expect(searchLearningContent('')).toEqual([]);
      expect(searchLearningContent('   ')).toEqual([]);
      expect(searchLearningContent(null)).toEqual([]);
    });
  });
});
