// Employer HTML is rendered inside our page; strip anything executable.
export function sanitize(html: string) {
  let s = html;
  if (/&lt;\w/.test(s)) s = s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return s
    .replace(/<\s*(script|style|iframe|object|embed|form|input|button|link|meta|svg|math)[\s\S]*?(<\/\s*\1\s*>|\/?>)/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("|')\s*(javascript|data|vbscript):[^"']*\2/gi, "")
    .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, "");
}
