# WebGPU Fireworks Like-Goal Finale

## Purpose

Ensure an enabled Like goal can launch its configured finale through the WebGPU Fireworks plugin.

## Root cause

The Goals plugin resolves only the legacy `fireworks` plugin for per-goal finales. It therefore never calls `webgpu-fireworks`, even though the goal state machine correctly detects the reached Like goal.

## Design

The Goals plugin will resolve `webgpu-fireworks` first when it exposes `triggerFinale`. If it is unavailable, it will retain the current fallback to the legacy `fireworks` plugin. The existing goal-level enablement, intensity, duration, and one-finale-per-goal-milestone guards remain unchanged.

## Verification

Add a focused regression test that reaches a Like goal with both plugins available and asserts that only WebGPU Fireworks receives its configured finale. Existing tests continue to cover the legacy fallback.
