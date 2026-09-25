import type { ReactNode } from 'react';

type ConsultantMarkdownProps = {
  readonly text: string;
  readonly className?: string;
};

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let lastIndex = 0;
  let match = pattern.exec(text);
  let index = 0;

  while (match) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b-${index}`}>{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={`${keyPrefix}-i-${index}`}>{match[2]}</em>);
    }
    lastIndex = match.index + match[0].length;
    index += 1;
    match = pattern.exec(text);
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function renderParagraphLines(text: string, key: string): ReactNode {
  const lines = text.split('\n');
  return (
    <p key={key}>
      {lines.map((line, index) => (
        <span key={`${key}-l-${index}`}>
          {index > 0 ? <br /> : null}
          {renderInline(line, `${key}-${index}`)}
        </span>
      ))}
    </p>
  );
}

function unorderedItem(line: string): string | null {
  const match = /^[-*]\s+(.+)$/.exec(line);
  return match?.[1] ?? null;
}

function orderedItem(line: string): string | null {
  const match = /^\d+\.\s+(.+)$/.exec(line);
  return match?.[1] ?? null;
}

export function ConsultantMarkdown({ text, className }: ConsultantMarkdownProps) {
  const normalized = text.replace(/\r\n/g, '\n');
  const blocks = normalized.split(/\n{2,}/);
  const nodes: ReactNode[] = [];

  blocks.forEach((block, blockIndex) => {
    const lines = block.split('\n').filter((line) => line.length > 0);
    if (lines.length === 0) {
      return;
    }

    if (lines.every((line) => unorderedItem(line) !== null)) {
      nodes.push(
        <ul key={`ul-${blockIndex}`}>
          {lines.map((line, index) => (
            <li key={`ul-${blockIndex}-${index}`}>
              {renderInline(unorderedItem(line) ?? line, `ul-${blockIndex}-${index}`)}
            </li>
          ))}
        </ul>,
      );
      return;
    }

    if (lines.every((line) => orderedItem(line) !== null)) {
      nodes.push(
        <ol key={`ol-${blockIndex}`}>
          {lines.map((line, index) => (
            <li key={`ol-${blockIndex}-${index}`}>
              {renderInline(orderedItem(line) ?? line, `ol-${blockIndex}-${index}`)}
            </li>
          ))}
        </ol>,
      );
      return;
    }

    nodes.push(renderParagraphLines(block, `p-${blockIndex}`));
  });

  return <div className={className}>{nodes}</div>;
}
