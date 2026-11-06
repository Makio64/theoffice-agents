// A livelier cast for this explicitly labelled sample, leaving the shared sample untouched.
export function livelySamples(input) {
  const samples = structuredClone(input);
  for (const theme of ['night', 'day']) {
    const facts = samples[theme].office;
    const now = facts.now.iso;
    // One finished session is back at work; two colleagues join the smaller project rooms.
    const returning = facts.live.desks.find((desk) => desk.agent === 'grok');
    if (returning) Object.assign(returning, {
      state: 'working', status: 'busy', idle_reason: null, last_seen: now,
      activity: { kind: 'testing', tool: 'Bash', label: 'Running playtests', since: now },
    });
    for (const [index, project, agent, title, kind, tool] of [
      [0, 'glyph-atlas-webgpu', 'gemini', 'Reviewing glyph rendering', 'reading', 'Read'],
      [1, 'theoffice-agents', 'kimi', 'Polishing the office', 'coding', 'Edit'],
    ]) {
      const template = facts.live.desks.find((desk) => desk.project === project);
      if (!template) continue;
      facts.live.desks.push({
        ...structuredClone(template), id: `office-demo-${index}`, pid: 91000 + index,
        agent, title, status: 'busy', state: 'working', idle_reason: null,
        interns: [], meetings: [], last_seen: now,
        activity: { kind, tool, label: title, since: now },
      });
    }
  }
  return samples;
}
