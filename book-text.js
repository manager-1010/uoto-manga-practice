/* Public, data-only lettering adapter. The visual editor and local write API are
   separate; normal readers only receive these small text/style overrides. */
(() => {
  'use strict';
  const styleKeys = ['font-family','font-size','color','line-height','font-weight','font-style','letter-spacing','text-align'];
  const wordNames = ['perseverance','giving-up','confidence','goal','reality'];
  const entries = new Map();
  const leaves = [...document.querySelectorAll('#comic-book > .leaf')];
  const excluded = '.art,svg,.sr-only,[aria-hidden="true"],.monologue-text';
  const wrapperReset = document.createElement('style');
  // These two existing selectors style every span. A new inline text run must
  // retain the anonymous text node's appearance rather than the caption style.
  wrapperReset.textContent = '.opening-work span[data-book-run],.distance span[data-book-run],.book-stage[data-mode=single] .opening-work span[data-book-run]{display:inline;font:inherit;margin:0}';
  document.head.append(wrapperReset);
  let overrides = {}, previousIds = new Set(), currentWord = 'perseverance';

  function readText(node) {
    return [...node.childNodes].map(child => child.nodeType === Node.TEXT_NODE ? child.nodeValue : child.nodeName === 'BR' ? '\n' : readText(child)).join('');
  }
  function baseStyles(node) {
    const computed = getComputedStyle(node), result = {};
    for (const name of styleKeys) result[name] = computed.getPropertyValue(name);
    const size = parseFloat(result['font-size']), height = parseFloat(result['line-height']);
    if (Number.isFinite(size) && Number.isFinite(height)) result['line-height'] = String(Math.round(height / size * 1000) / 1000);
    if (result['letter-spacing'] === 'normal') result['letter-spacing'] = '0px';
    return result;
  }
  function remember(node, id, page, label, extra = {}) {
    if (entries.has(id)) throw new Error(`Duplicate manga text ID: ${id}`);
    node.dataset.bookText = id;
    const originalStyle = {};
    for (const name of styleKeys) originalStyle[name] = {value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)};
    entries.set(id, {id,page,label,text:readText(node),style:baseStyles(node),...extra,html:node.innerHTML,originalStyle});
  }
  for (const [index,leaf] of leaves.entries()) {
    if (!leaf.id) leaf.id = 'manga-page-' + (index+1);
    const paper = leaf.querySelector('.leaf-content');
    function register(node) {
      const id = node.dataset.bookText;
      if (!/^p[1-9]\d*-t\d{2}$/.test(id)) throw new Error(`Invalid manga text ID: ${id}`);
      const tag = node.tagName.toLowerCase();
      const kind = /^h[1-6]$/.test(tag) ? '標題' : node.classList.contains('page-number') ? '頁碼' : tag === 'a' ? '連結文字' : tag === 'strong' || tag === 'em' || tag === 'i' ? '強調文字' : '文字';
      const text = readText(node).trim().replace(/\s+/g,' ');
      remember(node,id,index+1,`${kind} · ${text.slice(0,48)}`,node.dataset.editId === 'p6-text' ? {legacyId:'p6-text'} : {});
    }
    function scan(node) {
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches(excluded)) return;
      if (node.dataset.bookText !== undefined) { register(node); return; }
      // Permanent markers live in the source HTML. Inserting or rearranging
      // unmarked copy must never transfer a saved edit to a different sentence.
      for (const child of node.childNodes) if (child.nodeType === Node.ELEMENT_NODE) scan(child);
    }
    if (paper) scan(paper);
  }
  const thought = document.querySelector('.monologue-text');
  const reflections = window.mangaDrawing?.reflections || {};
  if (thought) {
    for (const word of wordNames) {
      if (!reflections[word]) continue;
      const id = 'word-' + word;
      remember(thought,id,leaves.findIndex(leaf=>leaf.classList.contains('words'))+1,`互動感想 · ${word}`,{text:reflections[word].text,variant:word,pages:leaves.flatMap((leaf,index)=>leaf.matches('.words,.pause')?[index+1]:[])});
    }
  }
  function safeStyle(input) {
    const result = {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
    for (const name of styleKeys) {
      if (input[name] === undefined) continue;
      const value = String(input[name]).trim();
      if (!value || value.length > 160 || /[;{}<>\\@]|url\s*\(|expression\s*\(|!important|var\s*\(/i.test(value)) continue;
      if (name === 'font-family' && !/^[\p{L}\p{N}\s,\-'"_]+$/u.test(value)) continue;
      if (name === 'font-size' && (!/^\d+(?:\.\d+)?px$/.test(value) || parseFloat(value) < 8 || parseFloat(value) > 120)) continue;
      if (name === 'line-height' && (!/^\d+(?:\.\d+)?$/.test(value) || +value < .5 || +value > 4)) continue;
      if (name === 'letter-spacing' && (!/^-?\d+(?:\.\d+)?px$/.test(value) || parseFloat(value) < -5 || parseFloat(value) > 20)) continue;
      if (CSS.supports(name,value)) result[name] = value;
    }
    return result;
  }
  function setText(node, value) {
    const children = [];
    value.split('\n').forEach((line,index) => {if (index) children.push(document.createElement('br'));children.push(document.createTextNode(line));});
    node.replaceChildren(...children);
  }
  function restoreStyle(node,entry) {
    for (const name of styleKeys) {
      const initial = entry.originalStyle[name];
      if (initial.value) node.style.setProperty(name,initial.value,initial.priority); else node.style.removeProperty(name);
    }
    if (entry.legacyId === 'p6-text') {
      const legacy = safeStyle(window.MANGA_PAGE6_EDITS?.text?.style);
      Object.entries(legacy).forEach(([name,value]) => node.style.setProperty(name,value));
    }
  }
  function render(entry, node, override) {
    restoreStyle(node,entry);
    if (override && typeof override.text === 'string') {
      const text = override.text.replace(/\r\n?/g,'\n').slice(0,5000);
      if (text === entry.text && !entry.variant) node.innerHTML = entry.html; else setText(node,text);
      Object.entries(safeStyle(override.style)).forEach(([name,value]) => node.style.setProperty(name,value));
    } else if (entry.legacyId === 'p6-text') {
      setText(node,window.MANGA_PAGE6_EDITS?.text?.text ?? entry.text);
    } else if (entry.variant) setText(node,entry.text);
    else node.innerHTML = entry.html;
  }
  function nodesFor(id) {return document.querySelectorAll(`[data-book-text="${id}"]`);}
  function selectWord(word) {
    if (!wordNames.includes(word) || !entries.has('word-'+word)) return false;
    currentWord = word;
    const id = 'word-' + word, entry = entries.get(id);
    document.querySelectorAll('.monologue-text').forEach(node => {node.dataset.bookText = id;render(entry,node,overrides[id]);});
    return true;
  }
  function apply(texts) {
    overrides = texts && typeof texts === 'object' && !Array.isArray(texts) ? texts : {};
    const active = new Set();
    for (const entry of entries.values()) {
      if (entry.variant) continue;
      const override = Object.prototype.hasOwnProperty.call(overrides,entry.id) ? overrides[entry.id] : undefined;
      if (!override && !previousIds.has(entry.id)) continue;
      nodesFor(entry.id).forEach(node => render(entry,node,override));
      if (override) active.add(entry.id);
    }
    previousIds = active;
    selectWord(currentWord);
    return catalog();
  }
  function catalog() {
    return [...entries.values()].map(({html,originalStyle,...entry}) => ({...entry,style:{...entry.style}}));
  }
  window.mangaText = {catalog,apply,selectWord};
  apply(window.MANGA_PAGE6_EDITS?.texts);
})();
