import { describe, expect, it } from 'vitest';

import {
  agencyDivisions,
  agencySkills,
  listAgencySkills,
  loadAgencySkill,
} from '@/backend/services/chat/agency-skills';

describe('agency skills', () => {
  it('reads the vendored roster from the checkout', () => {
    const skills = agencySkills();
    expect(skills.length).toBeGreaterThan(100);
    expect(skills.find((skill) => skill.id === 'engineering-code-reviewer')).toMatchObject({
      division: 'engineering',
    });
  });

  it('labels every division with a count', () => {
    const divisions = agencyDivisions();
    expect(divisions.length).toBeGreaterThan(10);
    expect(divisions.find((division) => division.id === 'engineering')?.count).toBeGreaterThan(10);
  });

  it('answers with the division index when no division is named', () => {
    const result = listAgencySkills();
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('divisions');
  });

  it('answers with one division and refuses an unknown one', () => {
    const engineering = listAgencySkills('engineering');
    expect('specialists' in engineering && engineering.specialists.length).toBeGreaterThan(10);

    const unknown = listAgencySkills('no-such-division');
    expect(unknown).toHaveProperty('error');
  });

  it('loads one specialist by id, and refuses anything else', () => {
    const skill = loadAgencySkill('engineering-code-reviewer');
    expect('content' in skill && skill.content).toContain('Code Reviewer');

    expect(loadAgencySkill('../../etc/passwd')).toHaveProperty('error');
    expect(loadAgencySkill('no-such-specialist')).toHaveProperty('error');
  });
});
