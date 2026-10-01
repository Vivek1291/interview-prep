import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';

export const LANGUAGES = [
  'javascript', 'typescript', 'jsx', 'tsx', 'bash', 'json', 'yaml', 'docker', 'nginx', 'sql', 'python', 'html', 'css', 'text',
];

export function highlight(code, lang) {
  const key = lang === 'html' ? 'markup' : lang;
  const grammar = Prism.languages[key];
  if (!grammar) return escapeHtml(code);
  return Prism.highlight(code, grammar, key);
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
