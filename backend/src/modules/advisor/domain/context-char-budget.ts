import {
  ADVISOR_CONTEXT_CHAR_BUDGET,
  ADVISOR_CONTEXT_PRESERVATION_ORDER,
  type AdvisorContextBlock,
  type AdvisorContextBlockType,
} from './context-blocks.js';
import { delimitUntrustedContent, truncateDelimitedUntrustedContent } from './untrusted-content.js';

const NEVER_TRUNCATE = new Set<AdvisorContextBlockType>([
  'PLATFORM_INSTRUCTIONS',
  'USER_QUESTION',
  'FINANCIAL_FACTS',
]);

export type AdvisorContextBlockDraft = AdvisorContextBlock & {
  readonly inner?: string;
};

function contentLength(blocks: readonly AdvisorContextBlock[]): number {
  return blocks.reduce((sum, block) => sum + block.content.length, 0);
}

function truncateDraft(draft: AdvisorContextBlockDraft, maxLength: number): AdvisorContextBlockDraft {
  if (NEVER_TRUNCATE.has(draft.type) || draft.content.length <= maxLength) {
    return draft;
  }

  if (draft.inner !== undefined) {
    const content = truncateDelimitedUntrustedContent(draft.type, draft.inner, maxLength);
    return { ...draft, content };
  }

  if (maxLength <= 0) {
    return { ...draft, content: '' };
  }

  return {
    ...draft,
    content: draft.content.slice(0, maxLength),
  };
}

/**
 * Se a soma de `content` exceder o orçamento, trunca na ordem inversa de preservação.
 * Nunca altera PLATFORM_INSTRUCTIONS, USER_QUESTION nem FINANCIAL_FACTS.
 */
export function applyAdvisorContextCharBudget(
  drafts: readonly AdvisorContextBlockDraft[],
): AdvisorContextBlock[] {
  const next = [...drafts];
  let total = contentLength(next);
  if (total <= ADVISOR_CONTEXT_CHAR_BUDGET) {
    return toBlocks(next);
  }

  const truncationOrder = [...ADVISOR_CONTEXT_PRESERVATION_ORDER].reverse();
  for (const type of truncationOrder) {
    if (total <= ADVISOR_CONTEXT_CHAR_BUDGET) {
      break;
    }
    if (NEVER_TRUNCATE.has(type)) {
      continue;
    }
    const index = next.findIndex((block) => block.type === type);
    if (index < 0) {
      continue;
    }
    const current = next[index]!;
    const overflow = total - ADVISOR_CONTEXT_CHAR_BUDGET;
    const maxLength = Math.max(0, current.content.length - overflow);
    const truncated = truncateDraft(current, maxLength);
    total = total - current.content.length + truncated.content.length;
    next[index] = truncated;
  }

  return toBlocks(next);
}

function toBlocks(drafts: readonly AdvisorContextBlockDraft[]): AdvisorContextBlock[] {
  return drafts.map((draft) => ({
    type: draft.type,
    content: draft.content,
    trustLevel: draft.trustLevel,
    ...(draft.source === undefined ? {} : { source: draft.source }),
  }));
}

export function wrapUntrusted(type: string, inner: string): { content: string; inner: string } {
  return { inner, content: delimitUntrustedContent(type, inner) };
}
