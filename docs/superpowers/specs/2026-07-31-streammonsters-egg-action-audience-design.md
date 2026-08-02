# Stream Monsters Egg Action Audience Design

## Goal

Make each egg-rail action state who may use its chat command.

## Presentation

- Private ready and reserved eggs show the entitled viewer: `@viewer · !hatch` or `@viewer · !adopt`.
- A public free egg shows `@everyone · !adopt`.
- A public steal opportunity shows `@everyone · !steal`; the original owner stays on the separate owner line.

## Scope and safety

Only the compact egg-rail action text changes. Command eligibility, timers, egg selection, rotation, and game state remain unchanged.

## Verification

Add assertions for each audience/action combination in the existing egg-shelf reliability test and run that focused Jest suite. Reload only StreamAlchemy after the test is green.
