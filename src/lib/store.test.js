import { describe, expect, it } from 'vitest';
import {
  STORAGE_KEY,
  createScenario,
  defaultScenarios,
  duplicateScenario,
  loadScenarios,
  parseImportedScenario,
  removeScenario,
  restoreDefaults,
  serializeScenario,
  updateScenario,
} from './store.js';
import { normalizeSlice } from '../timesheet/lib/schedule.js';

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}

describe('loadScenarios', () => {
  it('bootstraps the bundled defaults into empty storage', () => {
    const storage = fakeStorage();
    const list = loadScenarios(storage);
    expect(list.length).toBe(defaultScenarios().length);
    expect(JSON.parse(storage.data[STORAGE_KEY]).map((s) => s.id)).toEqual(list.map((s) => s.id));
  });

  it('returns the stored list when present, including an empty one', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '[]' });
    expect(loadScenarios(storage)).toEqual([]);
    const one = [{ ...createScenario(), id: 'mine' }];
    const storage2 = fakeStorage({ [STORAGE_KEY]: JSON.stringify(one) });
    expect(loadScenarios(storage2).map((s) => s.id)).toEqual(['mine']);
  });

  it('re-bootstraps on corrupt storage', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: '{not json' });
    expect(loadScenarios(storage).length).toBe(defaultScenarios().length);
  });
});

describe('scenario list mutations', () => {
  const base = () => defaultScenarios();

  it('duplicate inserts a deep copy right after the original', () => {
    const list = base();
    const { list: next, id } = duplicateScenario(list, list[2].id);
    expect(next).toHaveLength(list.length + 1);
    expect(next[3].id).toBe(id);
    expect(next[3].title).toBe(`Copy of ${list[2].title}`);
    // deep copy: editing the copy must not touch the original
    next[3].feature.timeSlices[0].validTime.begin = 'changed';
    expect(list[2].feature.timeSlices[0].validTime.begin).not.toBe('changed');
  });

  it('remove and update work by id', () => {
    const list = base();
    const removed = removeScenario(list, list[0].id);
    expect(removed).toHaveLength(list.length - 1);
    const updated = updateScenario(list, list[1].id, { title: 'renamed' });
    expect(updated[1].title).toBe('renamed');
    expect(list[1].title).not.toBe('renamed');
  });

  it('restoreDefaults re-adds defaults and keeps user scenarios', () => {
    const mine = { ...createScenario(), title: 'mine' };
    const list = [...removeScenario(base(), base()[0].id), mine];
    const restored = restoreDefaults(list);
    expect(restored.filter((s) => s.title === 'mine')).toHaveLength(1);
    expect(restored.length).toBe(defaultScenarios().length + 1);
  });
});

describe('export / import', () => {
  it('round-trips a scenario through serialize + parseImported with a fresh id', () => {
    const original = defaultScenarios()[5];
    const text = serializeScenario(original);
    expect(JSON.parse(text).id).toBeUndefined();
    const { scenario, error } = parseImportedScenario(text);
    expect(error).toBeUndefined();
    expect(scenario.id).toBeDefined();
    expect(scenario.id).not.toBe(original.id);
    expect(scenario.title).toBe(original.title);
    expect(scenario.feature).toEqual(original.feature);
  });

  it('falls back to the file name when the title is missing', () => {
    const { scenario } = parseImportedScenario(
      JSON.stringify({ feature: { timeSlices: [] } }),
      'my-export'
    );
    expect(scenario.title).toBe('my-export');
  });

  it('rejects invalid JSON and non-scenario files', () => {
    expect(parseImportedScenario('{oops').error).toMatch(/Invalid JSON/);
    expect(parseImportedScenario('[1,2]').error).toMatch(/Not a scenario file/);
    expect(parseImportedScenario('{"title":"x"}').error).toMatch(/Not a scenario file/);
  });
});

describe('createScenario template', () => {
  it('produces slices the resolution layer understands', () => {
    const s = createScenario();
    const delta = normalizeSlice(
      s.feature.timeSlices.find((ts) => ts.interpretation === 'TEMPDELTA')
    );
    expect(delta.groups).toHaveLength(2);
    expect(delta.groups[1].status).toBe('CLOSED');
    expect(s.feature.timeSlices[0].interpretation).toBe('BASELINE');
    expect(createScenario().id).not.toBe(s.id);
  });
});
