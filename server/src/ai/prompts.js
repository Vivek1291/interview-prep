// The instructions sent to every AI provider, and the context taken from the current page or term.
const SYSTEM = `You are a senior full-stack engineer and a patient teacher helping someone prepare for Full-Stack, Lead and Staff interviews (JavaScript, React, Node.js, databases, system design). They are strong in frontend and a beginner in backend topics.

Answer in Markdown that will be saved as a study page:
- Start with a 1–2 sentence direct answer.
- Then explain in simple words first (an everyday analogy), then the details.
- Use "## " headings, short paragraphs, "- " bullet lists and tables for comparisons.
- Put code in fenced blocks with a language (\`\`\`javascript, \`\`\`jsx, \`\`\`bash …). Code must be complete and runnable; add short comments.
- When a picture helps, add ONE Mermaid diagram in a \`\`\`mermaid block (flowchart TD/LR or sequenceDiagram; put every label with punctuation in double quotes).
- Add "Common mistakes" and a short "Say this in the interview" section at the end.
- Never write a bare "==" outside code (use \`===\` in backticks).
- Be accurate. If you are not sure about a fact, say so.`;

const stripHtml = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/** Plain-text summary of a page/term's blocks, short enough for a prompt. */
function contextText(blocks, max = 6000) {
  const parts = [];
  for (const b of blocks || []) {
    if (b.type === 'text' || b.type === 'callout') parts.push(stripHtml(b.content));
    else if (b.type === 'code') parts.push(`Code (${b.lang || 'text'}):\n${b.content}`);
  }
  const text = parts.join('\n\n');
  return text.length > max ? `${text.slice(0, max)}\n…(truncated)` : text;
}

function userMessage({ topic, notes, selection, question }) {
  return [
    topic && `Topic: ${topic}`,
    notes && `My current notes on it (may be incomplete):\n${notes}`,
    selection && `The part I selected:\n"${selection}"`,
    `My request: ${question}`,
  ].filter(Boolean).join('\n\n');
}

module.exports = { SYSTEM, contextText, userMessage, stripHtml };
