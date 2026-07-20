# Schnorrbecher Top-Spawn Design

## Goal

Every received gift starts directly above the glass opening. The physics engine, not a fullness rule, determines whether it remains in the glass or falls out.

## Behavior

- A gift event never spawns at either side of the glass.
- A completed repeat/combo creates one visible gift per `repeatCount`; a 10-Rose combo creates ten Rose icons.
- Existing gifts are not teleported back into the glass after they have escaped the visible container.
- The 3,000-object safety limit may compact older bodies before new icons arrive, but it must not redirect the new icons away from the opening.
- Sync restoration may place prior state inside the glass, but does not classify restored gifts as side overflow.

## Validation

- Unit test: a full jar still queues a top-spawn gift.
- Unit test: an escaped gift is not forcefully repositioned into the jar.
- Unit test: a 10-Rose combo emits ten visual icons.
- Browser check: a 10-Rose test event starts over the glass and no side spawn is produced.
