const { TEMPLATE_CATALOG } = require('../plugins/streamalchemy/backend/streammonsters/catalog');
const { SKILL_CATALOG, getSkillSet } = require('../plugins/streamalchemy/backend/streammonsters/battle-skill-catalog');

describe('Stream Monsters cinematic battle skill catalog', () => {
  test('gives every one of the 24 furry templates three distinct declarative skills', () => {
    expect(Object.keys(SKILL_CATALOG)).toHaveLength(24);
    const ids = new Set();

    for (const template of TEMPLATE_CATALOG) {
      const skills = getSkillSet(template.templateId, template.element);
      expect(Object.keys(skills)).toEqual(['A', 'B', 'C']);
      for (const [choice, skill] of Object.entries(skills)) {
        expect(skill).toEqual(expect.objectContaining({
          id: expect.any(String),
          name: expect.any(String),
          description: expect.any(String),
          icon: expect.any(String),
          vfxKey: expect.any(String),
          choice
        }));
        expect(ids.has(skill.id)).toBe(false);
        ids.add(skill.id);
      }
      expect(skills.A.budget.baseDamageBonus).toBeLessThanOrEqual(2);
      expect(skills.B.budget.defensePoints).toBeLessThanOrEqual(8);
      expect(skills.C.budget.baseDamageBonus).toBeLessThanOrEqual(5);
      expect(skills.C.requiresFullCharge).toBe(true);
    }

    expect(ids.size).toBe(72);
  });

  test('falls back deterministically to an element skill set for legacy monsters', () => {
    const first = getSkillSet(null, 'Volt');
    const second = getSkillSet(null, 'Volt');

    expect(first).toEqual(second);
    expect(first.A.id).toContain('pulse');
  });
});
