/* Keep CJK word units together without changing the saved wording or text IDs.
   Layout-only wrappers are rebuilt after locale / reflection changes. */
(() => {
  'use strict';
  if (!Intl.Segmenter) return;
  const cache = new Map();
  const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  function format() {
    const lang = document.documentElement.lang;
    if (lang !== 'zh-Hant' && lang !== 'ja') return;
    if (!cache.has(lang)) cache.set(lang, new Intl.Segmenter(lang, {granularity:'word'}));
    const segmenter = cache.get(lang);
    document.querySelectorAll('.leaf [data-book-text]').forEach(root => {
      if (root.matches('h1,h2,h3,.page-number') || root.closest('[hidden]')) return;
      const value = root.textContent;
      if (root.dataset.letteringLocale === lang && root.dataset.letteringValue === value) return;
      root.querySelectorAll('[data-comic-word]').forEach(node => node.replaceWith(...node.childNodes));
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (const node of nodes) {
        const fragment = document.createDocumentFragment();
        for (const part of segmenter.segment(node.nodeValue)) {
          if (part.isWordLike && cjk.test(part.segment) && [...part.segment].length <= 10) {
            const word = document.createElement('span');
            word.dataset.comicWord = '';
            word.textContent = part.segment;
            fragment.append(word);
          } else fragment.append(document.createTextNode(part.segment));
        }
        node.replaceWith(fragment);
      }
      root.dataset.letteringLocale = lang;
      root.dataset.letteringValue = value;
    });
  }
  window.addEventListener('manga:languagechange', format);
  format();
})();
