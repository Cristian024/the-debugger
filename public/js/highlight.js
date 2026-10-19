const KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'from',
  'function', 'get', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return',
  'set', 'static', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void',
  'while', 'yield',
]);

const LITERALS = new Set(['true', 'false', 'null', 'undefined', 'NaN', 'Infinity']);

const BUILTINS = new Set([
  'Array', 'Boolean', 'Date', 'Error', 'HospitalSystem', 'JSON', 'Map', 'Math', 'Number',
  'Object', 'Promise', 'Set', 'String', 'console', 'exports', 'globalThis', 'isNaN',
  'module', 'parseFloat', 'parseInt', 'process', 'require',
]);

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function wrap(className, text) {
  return `<span class="tok tok--${className}">${escapeHtml(text)}</span>`;
}

export function highlightJavaScript(source) {
  if (!source) {
    return '';
  }

  const regex =
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\b\d[\w.]*\b|\b[A-Za-z_$][\w$]*\b/g;

  let html = '';
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(source)) !== null) {
    html += escapeHtml(source.slice(lastIndex, match.index));

    const token = match[0];
    const previous = source[match.index - 1];
    const rest = source.slice(regex.lastIndex);

    if (token.startsWith('//') || token.startsWith('/*')) {
      html += wrap('comment', token);
    } else if (/^[`'"]/.test(token)) {
      html += wrap('string', token);
    } else if (/^\d/.test(token)) {
      html += wrap('number', token);
    } else if (LITERALS.has(token)) {
      html += wrap('literal', token);
    } else if (KEYWORDS.has(token)) {
      html += wrap('keyword', token);
    } else if (BUILTINS.has(token)) {
      html += wrap('builtin', token);
    } else if (previous === '.') {
      html += wrap('property', token);
    } else if (/^\s*\(/.test(rest)) {
      html += wrap('function', token);
    } else {
      html += escapeHtml(token);
    }

    lastIndex = regex.lastIndex;
  }

  html += escapeHtml(source.slice(lastIndex));
  return html;
}
