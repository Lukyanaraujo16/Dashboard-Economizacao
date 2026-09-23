import { describe, expect, it } from 'vitest';

import { dailyBalanceBandGeometry } from '../src/components/dashboard/v2/daily-balance-band-geometry';
import { expandSingleKnownBalanceMark } from '../src/components/dashboard/v2/monthly-realized-balance-mark';

const MONTHS = [
  '2025-10',
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
] as const;
const WIDTH = 100;
const SLOT = WIDTH / MONTHS.length;

function geometryOf(balances: ReadonlyMap<string, string>) {
  return dailyBalanceBandGeometry(MONTHS, balances, SLOT, {
    width: WIDTH,
    height: 52,
    pad: 6,
  });
}

describe('expandSingleKnownBalanceMark', () => {
  it('1/4/5 — um mês conhecido não inventa pontos nem zera meses anteriores', () => {
    const known = new Map([['2026-09', '1500.25']]);
    const raw = geometryOf(known);
    expect(raw).not.toBeNull();
    expect(raw!.points).toHaveLength(1);
    expect(raw!.points[0]?.index).toBe(11);
    expect(raw!.segments).toEqual([]);
    expect(raw!.areas).toEqual([]);
    expect([...known.keys()]).toEqual(['2026-09']);
    expect(known.has('2026-08')).toBe(false);

    const marked = expandSingleKnownBalanceMark(raw!, SLOT);
    expect(marked.points).toHaveLength(1);
    expect(marked.points[0]?.index).toBe(11);
    expect(marked.points[0]?.value).toBe(1500.25);
    expect(MONTHS[marked.points[0]!.index]).toBe('2026-09');
    expect(MONTHS.filter((_, index) => index !== 11).every((month) => !known.has(month))).toBe(true);
  });

  it('2 — um ponto gera segmento horizontal e área no mesmo Y', () => {
    const raw = geometryOf(new Map([['2026-09', '1500.25']]))!;
    const marked = expandSingleKnownBalanceMark(raw, SLOT);
    expect(marked.segments).toHaveLength(1);
    expect(marked.areas).toHaveLength(1);
    const coords = marked.segments[0]!.split(/[ ,]/).map(Number);
    const x1 = coords[0] ?? Number.NaN;
    const y1 = coords[1] ?? Number.NaN;
    const x2 = coords[2] ?? Number.NaN;
    const y2 = coords[3] ?? Number.NaN;
    expect(y1).toBe(y2);
    expect(y1).toBe(raw.points[0]!.y);
    expect(x1).toBeLessThan(raw.points[0]!.x);
    expect(x2).toBeGreaterThan(raw.points[0]!.x);
    expect(x2 - x1).toBeLessThan(SLOT);
    expect(marked.areas[0]).toContain(`L ${x1} ${y1}`);
    expect(marked.areas[0]).toContain(`L ${x2} ${y2}`);
  });

  it('6/7 — dois pontos reais conectam e o crescente sobe (y menor no SVG)', () => {
    const raw = geometryOf(
      new Map([
        ['2026-09', '100'],
        ['2026-08', '40'],
      ]),
    )!;
    const marked = expandSingleKnownBalanceMark(raw, SLOT);
    expect(marked.points).toHaveLength(2);
    expect(marked).toBe(raw);
    expect(marked.segments).toHaveLength(1);
    const aug = marked.points[0]!;
    const sep = marked.points[1]!;
    expect(sep.value).toBeGreaterThan(aug.value);
    expect(sep.y).toBeLessThan(aug.y);
  });

  it('SET → OUT → NOV conecta três pontos reais sem o trecho especial', () => {
    const raw = geometryOf(
      new Map([
        ['2026-07', '80'],
        ['2026-08', '120'],
        ['2026-09', '90'],
      ]),
    )!;
    const marked = expandSingleKnownBalanceMark(raw, SLOT);
    expect(marked).toBe(raw);
    expect(marked.points).toHaveLength(3);
    expect(marked.segments).toHaveLength(1);
    expect(marked.segments[0]!.split(' ')).toHaveLength(3);
  });

  it('8/9 — decrescente desce; iguais permanecem horizontais', () => {
    const down = geometryOf(
      new Map([
        ['2026-08', '80'],
        ['2026-09', '20'],
      ]),
    )!;
    expect(expandSingleKnownBalanceMark(down, SLOT).points[1]!.y).toBeGreaterThan(down.points[0]!.y);

    const flat = geometryOf(
      new Map([
        ['2026-08', '50'],
        ['2026-09', '50'],
      ]),
    )!;
    expect(expandSingleKnownBalanceMark(flat, SLOT).points[1]!.y).toBe(flat.points[0]!.y);
  });
});
