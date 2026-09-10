#!/usr/bin/env node
/**
 * Cloud tracker for the AI mechanical-CAD watchlist.
 * No third-party dependency is required: Node 20+ built-in fetch is used.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const configPath = path.join(root, 'config', 'monitors.json');
const dataPath = path.join(root, 'docs', 'data', 'dashboard.json');
const reportDir = path.join(root, 'docs', 'reports');
const today = new Date().toISOString().slice(0, 10);
const forceRun = process.argv.includes('--force') || process.env.FORCE_RUN === 'true';
const baselineRun = process.argv.includes('--baseline');
const oneDay = 24 * 60 * 60 * 1000;

const githubTargets = {
  markov: ['markov-lab/autocad-bench'],
  videocad: ['ghadinehme/VideoCAD', 'UDGOK/videocad'],
  xarial: ['xarial/xcad'],
  'haunchen-mcp': ['haunchen/solidworks-mcp'],
  'adam-mcp': ['Adam-Schildkraut/solidworks-mcp'],
  'cad-coder': ['gudo7208/CAD-Coder', 'anniedoris/CAD-Coder'],
  cadgenbench: ['huggingface/cadgenbench'],
};
const hfTargets = {
  markov: [
    ['dataset', 'markov-ai/cad-1000-hours'],
    ['dataset', 'markov-ai/cad-environments'],
  ],
  cadgenbench: [
    ['space', 'HuggingAI4Engineering/CADGenBench'],
    ['dataset', 'HuggingAI4Engineering/cadgenbench-submissions'],
  ],
};
const webpageTargets = {
  'autodesk-ai-lab': [
    'https://www.research.autodesk.com/research-areas/science/ai-lab/',
    'https://www.research.autodesk.com/blog/neural-cad-how-ai-can-reason-in-design-and-engineering/',
    'https://www.research.autodesk.com/publications/ai-lab-cad-llm/',
  ],
};

function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}
function labelFor(state) {
  return { updated: '本期有实质更新', no_material_update: '本期无实质更新', watch_signal: '待验证线索' }[state] || '本期无实质更新';
}
function dateDiffDays(a, b) {
  return Math.floor((Date.parse(a) - Date.parse(b)) / oneDay);
}
function isoDate(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}
async function readJson(file, fallback = null) {
  try { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); } catch { return fallback; }
}
async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/vnd.github+json, application/json', 'User-Agent': 'ai-cad-monitor-github-actions' },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}
async function fetchText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'ai-cad-monitor-github-actions' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const text = await response.text();
  return text.replace(/\s+/g, ' ').slice(0, 40000);
}
async function inspectGitHub(repo) {
  try {
    const data = await fetchJson(`https://api.github.com/repos/${repo}`);
    let release = null;
    try {
      const latest = await fetchJson(`https://api.github.com/repos/${repo}/releases/latest`);
      release = { tag: latest.tag_name, publishedAt: latest.published_at, url: latest.html_url, name: latest.name || latest.tag_name };
    } catch { /* Repositories without releases are normal. */ }
    return {
      type: 'github', repo, url: data.html_url, pushedAt: data.pushed_at, updatedAt: data.updated_at,
      defaultBranch: data.default_branch, stars: data.stargazers_count, release,
      fingerprint: sha({ pushedAt: data.pushed_at, release: release?.tag, releaseDate: release?.publishedAt }),
    };
  } catch (error) { return { type: 'github', repo, error: error.message, fingerprint: `error:${repo}` }; }
}
async function inspectHf(kind, id) {
  try {
    const data = await fetchJson(`https://huggingface.co/api/${kind}s/${id}`);
    const date = data.lastModified || data.last_modified || data.createdAt || null;
    return {
      type: 'huggingface', kind, id, url: `https://huggingface.co/${kind}s/${id}`,
      lastModified: date, sha: data.sha || null, likes: data.likes ?? null,
      fingerprint: sha({ date, sha: data.sha || null, siblings: (data.siblings || []).map(x => x.rfilename).slice(0, 80) }),
    };
  } catch (error) { return { type: 'huggingface', kind, id, error: error.message, fingerprint: `error:${kind}:${id}` }; }
}
async function inspectWebpage(url) {
  try {
    const text = await fetchText(url);
    const title = (text.match(/<title[^>]*>(.*?)<\/title>/i) || [])[1]?.replace(/<[^>]+>/g, '').trim() || url;
    return { type: 'webpage', url, title, fingerprint: sha(text) };
  } catch (error) { return { type: 'webpage', url, error: error.message, fingerprint: `error:${url}` }; }
}
function describeFacts(facts) {
  const lines = [];
  for (const fact of facts) {
    if (fact.error) { lines.push(`${fact.type} ${fact.repo || fact.id || fact.url}：读取失败（${fact.error}）`); continue; }
    if (fact.type === 'github') {
      lines.push(`GitHub ${fact.repo}：默认分支最近推送 ${isoDate(fact.pushedAt) || '未知'}；仓库页面最近更新 ${isoDate(fact.updatedAt) || '未知'}${fact.release ? `；最新 Release ${fact.release.tag}（${isoDate(fact.release.publishedAt) || '日期未知'}）` : '；未发现正式 Release'}`);
    } else if (fact.type === 'huggingface') {
      lines.push(`Hugging Face ${fact.kind} ${fact.id}：最近修改 ${isoDate(fact.lastModified) || '未知'}`);
    } else if (fact.type === 'webpage') {
      lines.push(`官方网页 ${fact.title}：本次抓取内容指纹已记录`);
    }
  }
  return lines;
}
async function deepSummary(monitor, state, factLines, fallback) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const instructions = '你是机械 CAD（SolidWorks、NX/UG、CATIA、Creo）与 AI Agent 技术情报分析师。只根据提供的已核验元数据写中文摘要；不允许补充未给出的事实，不把 star、网页抓取、Issue、个人实测写成正式发布。输出严格 JSON：{"summary":"不超过180字","maturity":"不超过45字"}。如果没有实质变更，应明确说明无实质版本更新和下一步应关注什么。';
  const input = [
    `监控对象：${monitor.name}`,
    `当前判定：${state}`,
    `对象边界：${monitor.description}`,
    `既有工程成熟度：${fallback.maturity}`,
    '本次核验事实：', ...factLines,
  ].join('\n');
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-5-mini', instructions, input, max_output_tokens: 360 }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}`);
    const payload = await response.json();
    const output = payload.output_text || payload.output?.flatMap(x => x.content || []).map(x => x.text || '').join('') || '';
    const parsed = JSON.parse(output.match(/\{[\s\S]*\}/)?.[0] || '{}');
    return { summary: String(parsed.summary || '').trim(), maturity: String(parsed.maturity || '').trim() };
  } catch (error) {
    console.warn(`OpenAI 摘要失败（使用规则摘要）：${error.message}`);
    return null;
  }
}
function standardSummary(state, factLines, fallback) {
  const failed = factLines.filter(x => x.includes('读取失败'));
  const successful = factLines.filter(x => !x.includes('读取失败'));
  if (state === 'updated') return `检测到公开可验证来源发生变化。${successful.join('；')}。该判定只代表代码、数据、评测或官方材料的公开变化；仍需在目标 CAD 版本中验证原生文件、重建、草图约束、B-Rep 与工程图输出。`;
  if (failed.length) return `本期未将该对象判定为正式更新。已核验：${successful.join('；') || '当前没有可用元数据'}。另有 ${failed.length} 个来源读取失败，不能据此断言“无更新”，将在下一次工作流中自动重试。`;
  return `${fallback.summary} 本次公开核验：${successful.join('；')}。`;
}
function reportMarkdown(data, date) {
  const updated = data.monitors.filter(x => x.state === 'updated');
  const noChange = data.monitors.filter(x => x.state !== 'updated');
  const lines = [
    `# AI 机械 CAD 追踪报告｜${date}`,
    '',
    '## Abstract',
    '',
    `本期对 ${data.monitors.length} 个 AI + 机械 CAD 公开对象进行了可验证元数据核验。正式更新 ${updated.length} 个；其余对象没有发现可被归类为 release、默认分支代码、数据集、benchmark 规则或官方研究发布的实质变化。Issue、论坛和个人演示仅作为待验证线索，不作为正式能力结论。`,
    '',
    '## 看板更新清单',
    '',
  ];
  for (const item of data.monitors) {
    lines.push(`### ${item.id}`, `- 状态: ${item.state}`, `- 摘要: ${item.summary}`, `- 核验日期: ${date}`, '');
  }
  lines.push('## 原始资料链接', '');
  for (const item of data.monitors) {
    lines.push(`### ${item.name}`);
    for (const source of item.sources) lines.push(`- [${source.label}](${source.url})`);
    lines.push('');
  }
  lines.push('## 判定说明', '', '- `updated`：仅限新的正式 release、默认分支代码、数据集、benchmark 规则/数据或官方研究发布。', '- `watch_signal`：Issue、论坛帖、个人实测或未合并 PR，不能等同于产品能力。', '- 机械 CAD 落地必须额外验证原生文件、特征树重建、草图约束、B-Rep、工程图/BOM/GD&T 和 PDF/DXF/STEP 输出。', '');
  return lines.join('\n');
}

const config = await readJson(configPath);
if (!config?.monitors?.length) throw new Error('无法读取 config/monitors.json');
const previous = await readJson(dataPath, null);
const lastRun = previous?.lastRunDate || previous?.latestReport?.date || null;
if (!forceRun && lastRun && dateDiffDays(today, lastRun) < 3) {
  console.log(`距离上次正式追踪 ${lastRun} 尚未满 3 天；本次不生成报告。`);
  process.exit(0);
}

const monitors = [];
for (const monitor of config.monitors) {
  const facts = [];
  for (const repo of githubTargets[monitor.id] || []) facts.push(await inspectGitHub(repo));
  for (const [kind, id] of hfTargets[monitor.id] || []) facts.push(await inspectHf(kind, id));
  for (const url of webpageTargets[monitor.id] || []) facts.push(await inspectWebpage(url));
  const fingerprint = sha(facts.map(x => x.fingerprint));
  const prior = previous?.monitors?.find(x => x.id === monitor.id);
  const changed = !baselineRun && Boolean(prior?.fingerprint && prior.fingerprint !== fingerprint && facts.some(x => !x.error));
  const state = changed ? 'updated' : 'no_material_update';
  const factLines = describeFacts(facts);
  const ai = await deepSummary(monitor, state, factLines, monitor.fallback);
  monitors.push({
    id: monitor.id, name: monitor.name, shortName: monitor.shortName, category: monitor.category,
    description: monitor.description, sources: monitor.sources, state, label: labelFor(state),
    summary: ai?.summary || standardSummary(state, factLines, monitor.fallback),
    maturity: ai?.maturity || monitor.fallback.maturity, lastVerified: today, fingerprint, facts,
  });
}
const payload = {
  title: config.title, timezone: config.timezone, generatedAt: new Date().toISOString(), lastRunDate: today,
  monitors,
  ecosystemSignals: [{ date: '2026-09-10', title: 'just1step/solidworks-mcp Issue #44：SolidWorks 2024 草图/特征校验社区线索（未合并）', url: 'https://github.com/just1step/solidworks-mcp/issues/44' }],
  latestReport: { date: today, url: `./reports/AI-CAD-追踪报告-${today}.md` },
};
await fs.mkdir(path.dirname(dataPath), { recursive: true });
await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(dataPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(reportDir, `AI-CAD-追踪报告-${today}.md`), reportMarkdown(payload, today), 'utf8');
console.log(`已生成 ${today} 的看板数据和报告。`);

