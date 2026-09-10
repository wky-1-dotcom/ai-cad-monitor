'use strict';

let state = { data: null, selectedId: null, all: false };
const $ = selector => document.querySelector(selector);

function formattedTime(iso) {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }).format(new Date(iso));
}
function create(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function sourceLink(source) { const link = create('a', 'source-link', source.label); link.href = source.url; link.target = '_blank'; link.rel = 'noreferrer'; return link; }

function renderTop(data) {
  $('#page-title').textContent = data.title;
  $('#monitor-count').textContent = data.monitors.length;
  $('#update-count').textContent = data.monitors.filter(item => item.state === 'updated').length;
  $('#signal-count').textContent = data.ecosystemSignals.length;
  const meta = $('#report-meta'); meta.replaceChildren();
  const first = create('div', '', data.latestReport ? `最新追踪报告：${data.latestReport.date}` : '尚未找到追踪报告'); meta.append(first);
  if (data.latestReport) { const link = create('a', '', '查看原始 Markdown 报告'); link.href = data.latestReport.url; link.target = '_blank'; link.rel = 'noreferrer'; meta.append(link); }
  meta.append(create('div', '', `页面数据刷新：${formattedTime(data.generatedAt)}`));
}
function renderList(data) {
  const list = $('#monitor-list'); list.replaceChildren();
  data.monitors.forEach(item => {
    const button = create('button', `monitor-button ${state.selectedId === item.id && !state.all ? 'active' : ''}`); button.type = 'button'; button.setAttribute('role', 'listitem');
    button.append(create('span', `state-dot ${item.state}`));
    const copy = create('span'); copy.append(create('strong', '', item.shortName)); copy.append(create('small', '', item.label)); button.append(copy);
    button.addEventListener('click', () => { state.selectedId = item.id; state.all = false; render(); }); list.append(button);
  });
  const signal = $('#signal-box'); signal.replaceChildren();
  if (data.ecosystemSignals.length) {
    signal.append(create('strong', '', '生态待验证线索'));
    const latest = data.ecosystemSignals[0]; signal.append(document.createElement('br')); signal.append(document.createTextNode(`${latest.date} · ${latest.title}：`));
    const link = create('a', '', '查看原始 Issue'); link.href = latest.url; link.target = '_blank'; link.rel = 'noreferrer'; signal.append(link);
  }
}
function detailItem(item) {
  const root = document.createDocumentFragment();
  const header = create('div', 'detail-header'); const main = create('div'); main.append(create('p', 'category', item.category)); main.append(create('h2', '', item.name)); header.append(main); header.append(create('span', `status-badge ${item.state}`, item.label)); root.append(header);
  root.append(create('p', 'detail-desc', item.description));
  const card = create('section', 'summary-card'); card.append(create('h3', '', '本期更新摘要')); card.append(create('p', '', item.summary)); root.append(card);
  const facts = create('div', 'detail-grid'); const verified = create('div', 'fact-box'); verified.append(create('span', '', '最后核验')); verified.append(create('strong', '', item.lastVerified)); const maturity = create('div', 'fact-box'); maturity.append(create('span', '', '成熟度 / 可用边界')); maturity.append(create('strong', '', item.maturity)); facts.append(verified, maturity); root.append(facts);
  const sources = create('section', 'sources'); sources.append(create('h3', '', '监控资料与真实来源')); const links = create('div', 'source-links'); item.sources.forEach(source => links.append(sourceLink(source))); sources.append(links); root.append(sources);
  return root;
}
function detailAll(data) {
  const root = document.createDocumentFragment(); root.append(create('p', 'category', 'ALL MONITORS')); root.append(create('h2', '', '本期监控总览'));
  const intro = create('p', 'detail-desc', '选择左侧对象可查看具体资料、最新摘要与真实来源。这里将“正式更新”和“尚未合并的社区线索”分开显示，避免把 Issue、star 或网页刷新误判为发布。'); root.append(intro);
  const cards = create('div', 'all-updates'); data.monitors.forEach(item => { const card = create('article', 'all-card'); card.append(create('p', 'category', item.category)); card.append(create('h3', '', `${item.shortName} · ${item.label}`)); card.append(create('p', '', item.summary)); card.addEventListener('click', () => { state.selectedId = item.id; state.all = false; render(); }); cards.append(card); }); root.append(cards); return root;
}
function renderDetail(data) { const container = $('#detail-content'); container.replaceChildren(); const selected = data.monitors.find(item => item.id === state.selectedId); container.append(state.all || !selected ? detailAll(data) : detailItem(selected)); }
function render() { const data = state.data; renderTop(data); renderList(data); renderDetail(data); }
async function load() { const response = await fetch('./data/dashboard.json', { cache: 'no-store' }); if (!response.ok) throw new Error('无法读取看板数据'); const data = await response.json(); state.data = data; if (!state.selectedId && data.monitors.length) state.selectedId = data.monitors.find(item => item.state === 'updated')?.id || data.monitors[0].id; render(); }
$('#show-all').addEventListener('click', () => { state.all = true; render(); });
load().catch(error => { $('#detail-content').textContent = error.message; console.error(error); });
// 静态 Pages 每次页面打开读取最新已发布数据；如保留页面超过 10 分钟则自动重新读取。
setInterval(() => load().catch(console.error), 600000);

