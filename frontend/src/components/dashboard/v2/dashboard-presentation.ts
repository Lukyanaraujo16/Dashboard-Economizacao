'use client';

import { useEffect, useId, useRef, useState } from 'react';

/**
 * Apresentação visual da Dashboard, só de interface.
 *
 * O grupo só é consumido quando `enabled` é verdadeiro — isto é, quando já
 * existe conteúdo real para mostrar. Loading e vazio não marcam o grupo.
 * A primeira leva pronta anima junta. Remontagens posteriores (mês, categoria,
 * centro de custo, refresh, modal) não repetem, enquanto a página seguir
 * montada. F5 recria o módulo e a apresentação volta a acontecer.
 */

const STAGGER_CAP = 8;

const seenGroups = new Set<string>();
const staggerSlots = new Map<string, number>();
const staggerCounts = new Map<string, number>();

let subscribers = 0;
let idleClearScheduled = false;

function claimIndex(group: string, slotKey: string): number {
  const existing = staggerSlots.get(slotKey);
  if (existing !== undefined) {
    return existing;
  }
  const index = Math.min(staggerCounts.get(group) ?? 0, STAGGER_CAP);
  staggerCounts.set(group, index + 1);
  staggerSlots.set(slotKey, index);
  return index;
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
  const slotKey = `${group}:${id}`;
  const [snapshot, setSnapshot] = useState<DashboardPresentation>({ present: false, index: 0 });
  const open = enabled && !seenGroups.has(group);

  if (!enabled && snapshot.present) {
    setSnapshot({ present: false, index: snapshot.index });
  } else if (open) {
    const index = claimIndex(group, slotKey);
    if (!snapshot.present || snapshot.index !== index) {
      setSnapshot({ present: true, index });
    }
  }

  useEffect(() => {
    subscribers += 1;
    return () => {
      subscribers -= 1;
      scheduleIdleClear();
    };
  }, []);

  useEffect(() => {
    if (snapshot.present) {
      seenGroups.add(group);
    }
  }, [group, snapshot.present]);

  return snapshot;
}

/**
 * Mantém o movimento apenas no conjunto de dados da primeira apresentação.
 * Uma troca posterior de mês recria barras sem repetir o crescimento.
 */
export function useRevealDataset(active: boolean, signature: string): boolean {
  const signatureRef = useRef<string | null>(null);
  if (active && signatureRef.current === null) {
    signatureRef.current = signature;
  }
  return active && signatureRef.current === signature;
}
