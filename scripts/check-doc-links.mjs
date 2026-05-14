import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsRoot = path.join(root, 'docs');
const extraFiles = [
  path.join(root, 'README.md'),
  path.join(root, 'CHANGELOG.md'),
];

function collectMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function isExternalLink(target) {
  return /^https?:\/\//i.test(target) || /^mailto:/i.test(target);
}

function normalizeTarget(rawTarget) {
  const noAnchor = rawTarget.split('#')[0];
  const noQuery = noAnchor.split('?')[0];
  return decodeURIComponent(noQuery);
}

function isLikelyFileLink(target) {
  if (!target) {
    return false;
  }
  if (target.startsWith('#')) {
    return false;
  }
  if (isExternalLink(target)) {
    return false;
  }
  return true;
}

const markdownFiles = [
  ...collectMarkdownFiles(docsRoot),
  ...extraFiles.filter((file) => fs.existsSync(file)),
];

const missingLinks = [];
const markdownLinkRegex = /\[[^\]]*\]\(([^)]+)\)/g;

for (const mdFile of markdownFiles) {
  const content = fs.readFileSync(mdFile, 'utf8');
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    let match;

    while ((match = markdownLinkRegex.exec(line)) !== null) {
      const target = match[1].trim();
      if (!isLikelyFileLink(target)) {
        continue;
      }

      const normalizedTarget = normalizeTarget(target);
      const resolvedPath = path.resolve(path.dirname(mdFile), normalizedTarget);
      if (!fs.existsSync(resolvedPath)) {
        missingLinks.push({
          file: path.relative(root, mdFile),
          line: i + 1,
          target,
        });
      }
    }

    markdownLinkRegex.lastIndex = 0;
  }
}

if (missingLinks.length > 0) {
  console.error('Broken local markdown links found:');
  for (const item of missingLinks) {
    console.error(`- ${item.file}:${item.line} -> ${item.target}`);
  }
  process.exit(1);
}

console.log(`Link check passed for ${markdownFiles.length} markdown files.`);
