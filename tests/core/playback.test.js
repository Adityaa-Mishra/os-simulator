import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlaybackController } from '../../public/js/core/playback.js';
import { getProcessColor } from '../../public/js/visualizers/ganttRenderer.js';

describe('PlaybackController Unit Tests (Phase 2B)', () => {
  const sampleSnapshots = [
    { stepIndex: 0, timeUnit: 0, activeUnit: 'P1', actionLog: 'Step 0' },
    { stepIndex: 1, timeUnit: 1, activeUnit: 'P1', actionLog: 'Step 1' },
    { stepIndex: 2, timeUnit: 2, activeUnit: 'P2', actionLog: 'Step 2' },
    { stepIndex: 3, timeUnit: 3, activeUnit: null, actionLog: 'Step 3' }
  ];

  let controller;
  let stepChangeSpy;
  let playStateSpy;

  beforeEach(() => {
    stepChangeSpy = vi.fn();
    playStateSpy = vi.fn();
    controller = new PlaybackController(sampleSnapshots, {
      speed: 1.0,
      baseIntervalMs: 100,
      onStepChange: stepChangeSpy,
      onPlayStateChange: playStateSpy
    });
  });

  it('should initialize with correct default state', () => {
    expect(controller.getCurrentIndex()).toBe(0);
    expect(controller.getTotalSteps()).toBe(4);
    expect(controller.getIsPlaying()).toBe(false);
    expect(controller.getCurrentSnapshot()).toEqual(sampleSnapshots[0]);
  });

  it('should navigate forward with nextStep() and clamp at end', () => {
    expect(controller.nextStep()).toBe(true);
    expect(controller.getCurrentIndex()).toBe(1);
    expect(controller.getCurrentSnapshot().actionLog).toBe('Step 1');

    expect(controller.nextStep()).toBe(true);
    expect(controller.nextStep()).toBe(true);
    expect(controller.getCurrentIndex()).toBe(3);

    // At end: nextStep should return false and not advance
    expect(controller.nextStep()).toBe(false);
    expect(controller.getCurrentIndex()).toBe(3);
  });

  it('should navigate backward with prevStep() and clamp at 0', () => {
    controller.goToStep(2);
    expect(controller.getCurrentIndex()).toBe(2);

    expect(controller.prevStep()).toBe(true);
    expect(controller.getCurrentIndex()).toBe(1);

    expect(controller.prevStep()).toBe(true);
    expect(controller.getCurrentIndex()).toBe(0);

    // At start: prevStep should return false and not decrement
    expect(controller.prevStep()).toBe(false);
    expect(controller.getCurrentIndex()).toBe(0);
  });

  it('should jump directly to a step via goToStep() with boundary clamping', () => {
    controller.goToStep(2);
    expect(controller.getCurrentIndex()).toBe(2);

    // Clamp above
    controller.goToStep(99);
    expect(controller.getCurrentIndex()).toBe(3);

    // Clamp below
    controller.goToStep(-5);
    expect(controller.getCurrentIndex()).toBe(0);
  });

  it('should reset to step 0 and pause', () => {
    controller.goToStep(3);
    controller.reset();
    expect(controller.getCurrentIndex()).toBe(0);
    expect(controller.getIsPlaying()).toBe(false);
  });

  it('should trigger onStepChange callback on transitions', () => {
    controller.nextStep();
    expect(stepChangeSpy).toHaveBeenCalledWith(sampleSnapshots[1], 1, 4);
  });

  it('should handle play/pause state transitions', () => {
    vi.useFakeTimers();

    controller.play();
    expect(controller.getIsPlaying()).toBe(true);
    expect(playStateSpy).toHaveBeenCalledWith(true);

    // Advance timer by base interval (100ms)
    vi.advanceTimersByTime(100);
    expect(controller.getCurrentIndex()).toBe(1);

    vi.advanceTimersByTime(100);
    expect(controller.getCurrentIndex()).toBe(2);

    controller.pause();
    expect(controller.getIsPlaying()).toBe(false);
    expect(playStateSpy).toHaveBeenCalledWith(false);

    // Timers should be stopped
    vi.advanceTimersByTime(300);
    expect(controller.getCurrentIndex()).toBe(2);

    vi.useRealTimers();
  });

  it('should auto-stop when reaching the final snapshot during playback', () => {
    vi.useFakeTimers();

    controller.goToStep(2);
    controller.play();

    // Advance to step 3 (last step)
    vi.advanceTimersByTime(100);
    expect(controller.getCurrentIndex()).toBe(3);

    // Next tick should detect end and pause
    vi.advanceTimersByTime(100);
    expect(controller.getIsPlaying()).toBe(false);

    vi.useRealTimers();
  });

  it('should clean up timers and state on destroy()', () => {
    vi.useFakeTimers();

    controller.play();
    controller.destroy();

    expect(controller.getIsPlaying()).toBe(false);
    expect(controller.getTotalSteps()).toBe(0);

    vi.useRealTimers();
  });
});

describe('GanttRenderer Process Color Utility (Phase 2B)', () => {
  it('should return gray for IDLE or null processes', () => {
    expect(getProcessColor(null)).toBe('var(--bg-tertiary)');
    expect(getProcessColor('IDLE')).toBe('var(--bg-tertiary)');
  });

  it('should return deterministic HSL colors for identical process IDs', () => {
    const color1 = getProcessColor('P1');
    const color2 = getProcessColor('P1');
    expect(color1).toBe(color2);
    expect(color1).toMatch(/^hsl\(\d+,\s*65%,\s*45%\)$/);
  });

  it('should return different colors for different process IDs', () => {
    const colorP1 = getProcessColor('P1');
    const colorP2 = getProcessColor('P2');
    expect(colorP1).not.toBe(colorP2);
  });
});
