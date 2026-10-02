'use client';

import { useEffect, useId, useState } from 'react';

/**
 * Apresentação visual única por visita à Dashboard.
 * O marcador vive só no ciclo do documento: não é estado de negócio
 * e não persiste em storage.
 *
 * A primeira montagem de cada grupo (cards, série, barras, donut) anima.
 * Remontagens seguintes — mês, categoria, centro de custo, refresh ou modal —
 * reutilizam o grupo já apresentado, enquanto algum consumidor da página
 * continuar montado. Se a página inteira desmontar, a próxima visita apresenta de novo.
 */

const STAGGER_CAP = 8;

const seenGroups = new Set<string>();
const staggerSlots = new Map<string, number>();
const staggerCounts = new Map<string, number>();

let subscribers = 0;
let idleClearScheduled = false;

function scheduleGroupMark(group: string): void {
  queueMicrotask(() => {
    seenGroups.add(group);
  });
}

function scheduleIdleClear(): void {
  if (idleClearScheduled) {
    return;
  }
  idleClearScheduled = true;
  queueMicrotask(() => {
    idleClearScheduled = false;
    if (subscribers === 0) {
      seenGroups.clear();
      staggerSlots.clear();
      staggerCounts.clear();
    }
  });
}

/** Só para testes. Não usar na interface. */
export function resetDashboardPresentationForTests(): void {
  seenGroups.clear();
  staggerSlots.clear();
  staggerCounts.clear();
  subscribers = 0;
  idleClearScheduled = false;
}

export type DashboardPresentation = {
  readonly present: boolean;
  readonly index: number;
};

export function useDashboardPresentation(group: string, enabled = true): DashboardPresentation {
  const id = useId();
  const [snapshot] = useState<DashboardPresentation>(() => {
    if (!enabled || seenGroups.has(group)) {
      return { present: false, index: 0 };
    }
    const slotKey = `${group}:${id}`;
    const existing = staggerSlots.get(slotKey);
    if (existing !== undefined) {
      return { present: true, index: existing };
    }
    const index = Math.min(staggerCounts.get(group) ?? 0, STAGGER_CAP);
    staggerCounts.set(group, index + 1);
    staggerSlots.set(slotKey, index);
    return { present: true, index };
  });

  useEffect(() => {
    subscribers += 1;
    if (snapshot.present) {
      scheduleGroupMark(group);
    }
    return () => {
      subscribers -= 1;
      scheduleIdleClear();
    };
  }, [group, snapshot.present]);

  return snapshot;
}
