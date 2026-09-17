import * as React from "react";

// Safe markdown-subset renderer: never uses dangerouslySetInnerHTML, never passes through
// raw HTML — any HTML-looking text in the source is rendered as literal text.

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let key = 0;
  // Order matters: link, then bold, then italic, then code — each regex consumes one token.
  const re = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]*)\]\(([^)]+)\)|(\*|_)([^*_]+)\5/;
  let rest = text;
  while (rest.length > 0) {
    const m = re.exec(rest);
    if (!m) {
      nodes.push(rest);
      break;
    }
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    if (m[1] !== undefined) {
      nodes.push(<code key={key++}>{m[1]}</code>);
    } else if (m[2] !== undefined) {
      nodes.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined && m[4] !== undefined) {
      const url = m[4].trim();
      if (/^(https?:|mailto:)/i.test(url)) {
        nodes.push(
          <a key={key++} href={url} rel="noopener noreferrer" target="_blank">
            {m[3]}
          </a>
        );
      } else {
        nodes.push(m[3]);
      }
    } else if (m[6] !== undefined) {
      nodes.push(<em key={key++}>{m[6]}</em>);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return nodes;
}

function renderParagraphLines(text: string, keyPrefix: string): React.ReactNode[] {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  lines.forEach((line, i) => {
    if (i > 0) out.push(<br key={`${keyPrefix}-br-${i}`} />);
    out.push(...renderInline(line));
  });
  return out;
}

export function Markdown({ source, className }: { source: string; className?: string }): React.JSX.Element {
  const blocks = parseBlocks(source);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const Tag = (`h${block.level}` as unknown) as "h2" | "h3" | "h4";
            return <Tag key={i}>{renderInline(block.text)}</Tag>;
          }
          case "hr":
            return <hr key={i} />;
          case "code":
            return (
              <pre key={i}>
                <code>{block.text}</code>
              </pre>
            );
          case "blockquote":
            return <blockquote key={i}>{renderParagraphLines(block.text, `bq-${i}`)}</blockquote>;
          case "ul":
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "paragraph":
            return <p key={i}>{renderParagraphLines(block.text, `p-${i}`)}</p>;
          default:
            return null;
        }
      })}
    </div>
  );
}

type Block =
  | { type: "heading"; level: 2 | 3 | 4; text: string }
  | { type: "hr" }
  | { type: "code"; text: string }
  | { type: "blockquote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "paragraph"; text: string };

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    // fenced code block
    if (/^```/.test(line)) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      blocks.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    // horizontal rule
    if (/^---+\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // ATX heading
    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = (headingMatch[1].length + 1) as 2 | 3 | 4;
      blocks.push({ type: "heading", level, text: headingMatch[2].trim() });
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join("\n") });
      continue;
    }

    // unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // paragraph: gather until blank line or a line starting a new block type
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^```/.test(lines[i]) &&
      !/^---+\s*$/.test(lines[i].trim()) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join("\n") });
  }

  return blocks;
}
