# WebGPU Fireworks Decoupled Fit Design

## Problem

Normal fireworks correlate the rocket and explosion through one visible-envelope fit. The rocket's long travel path therefore scales and translates the explosion together with the flight. In the reproduced portrait OBS case, this reduces the explosion to about 73.8 percent and moves it upward by about 271 pixels. The same seeded explosion renders correctly when triggered without a rocket.

## Desired Behavior

- The rocket tip must arrive at the explosion center.
- The explosion must retain the scale and geometry selected for the burst itself.
- Fitting the rocket travel path must not change explosion intensity, particle size, gravity, wind, curve, or other burst geometry.
- The combined result must remain inside the visible canvas contract.
- Instant explosions and rocket-delivered explosions must use equivalent burst geometry for equivalent inputs.

## Design

Fit the explosion commands independently with the existing visible-envelope implementation. Treat that explosion fit as authoritative for the burst position and scale. Then align the rocket commands to the fitted explosion target while fitting only the rocket path as needed.

The correlation manifest will continue to bind the rocket and explosion to one target, but it will no longer impose one shared scale on both command groups. The rocket may be translated or independently constrained to remain visible; the explosion's fitted scale must not be derived from the rocket origin or travel envelope.

This keeps synchronization intact without allowing the below-canvas launch position to shrink the visible burst.

## Alternatives Rejected

- **Minimum shared scale:** A scale clamp would hide this reproduction but would still couple unrelated rocket and burst geometry and could fail at other positions.
- **Disable correlation:** This would restore burst scale but could reintroduce rocket-tip and burst-center misalignment.

## Testing

Add a regression test that prepares equivalent instant and rocket-delivered star explosions with a deterministic seed and portrait viewport. It must prove that:

1. The rocket target equals the fitted explosion origin.
2. The rocket-delivered explosion retains the same burst scale and geometry as the explosion-only fit.
3. The rocket commands remain within the visible-envelope contract.
4. Existing shared-target and manifest validation behavior remains intact.

Run the focused WebGPU Fireworks test suites, then verify the result in the active OBS WebGPU source with the same deterministic white-star reproduction used during diagnosis.

## Scope

Only the WebGPU Fireworks correlation/envelope path and its focused tests are in scope. OBS scene configuration, color handling, unrelated plugins, and persistent user settings are unchanged.
