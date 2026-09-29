/**
 * Anexa DOCUMENT_KNOWLEDGE a um contexto já montado (F13.8.2C).
 * Usado no caminho do provider; FACTUAL_CLOSED não chama.
 */

import {
  applyAdvisorContextCharBudget,
  wrapUntrusted,
  type AdvisorContextBlockDraft,
} from './context-char-budget.js';
import type { AdvisorBuiltContext, AdvisorContextBlock } from './context-blocks.js';

export function attachAdvisorDocumentKnowledgeBlock(
  built: AdvisorBuiltContext,
  documentInner: string | null,
): AdvisorBuiltContext {
  if (documentInner === null || documentInner.trim().length === 0) {
    return {
      ...built,
      blocks: built.blocks.filter((block) => block.type !== 'DOCUMENT_KNOWLEDGE'),
    };
  }

  const wrapped = wrapUntrusted('DOCUMENT_KNOWLEDGE', documentInner);
  const drafts: AdvisorContextBlockDraft[] = built.blocks
    .filter((block) => block.type !== 'DOCUMENT_KNOWLEDGE')
    .map((block) => toDraft(block));

  const docDraft: AdvisorContextBlockDraft = {
    type: 'DOCUMENT_KNOWLEDGE',
    content: wrapped.content,
    trustLevel: 'UNTRUSTED',
    inner: wrapped.inner,
  };

  const knowledgeIdx = drafts.findIndex((block) => block.type === 'TENANT_KNOWLEDGE');
  if (knowledgeIdx >= 0) {
    drafts.splice(knowledgeIdx + 1, 0, docDraft);
  } else {
    const financialIdx = drafts.findIndex((block) => block.type === 'FINANCIAL_FACTS');
    if (financialIdx >= 0) {
      drafts.splice(financialIdx, 0, docDraft);
    } else {
      drafts.push(docDraft);
    }
  }

  return {
    ...built,
    blocks: applyAdvisorContextCharBudget(drafts),
  };
}

function toDraft(block: AdvisorContextBlock): AdvisorContextBlockDraft {
  return {
    type: block.type,
    content: block.content,
    trustLevel: block.trustLevel,
    ...(block.source === undefined ? {} : { source: block.source }),
  };
}
