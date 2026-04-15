// ==UserScript==
// @name         Codeforces Problemset Filter
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Allows filtering Codeforces problems by multiple tags with an OR logic.
// @author       You
// @match        *://codeforces.com/problemset*
// @match        *://codeforces.com/problemset/page/*
// @grant        none
// @run-at       document-end
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/574069/Codeforces%20Problemset%20Filter.user.js
// @updateURL https://update.greasyfork.org/scripts/574069/Codeforces%20Problemset%20Filter.meta.js
// ==/UserScript==

(function () {
  'use strict';

  // --- Settings ---
  const API_URL = 'https://xan-ca.github.io/cf-api/enriched_problems.json';
  const CACHE_KEY = 'cf_problems_cache';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
  const STORAGE_KEY_FILTER = 'cf_selected_category';
  const SIDEBOX_ID = 'cf-filter-sidebox';

  const CATEGORIES = [
    { value: 'all', label: 'All Problems' },
    { value: 'Div. 1', label: 'Div. 1' },
    { value: 'Div. 2', label: 'Div. 2' },
    { value: 'Div. 3', label: 'Div. 3' },
    { value: 'Div. 4', label: 'Div. 4' },
    { value: 'Educational', label: 'Educational' },
    { value: 'Global', label: 'Global Round' },
    { value: 'ICPC', label: 'ICPC' },
  ];

  // --- Data Fetching and Caching ---
  async function fetchAndCache() {
    console.log('[CF Filter] Fetching fresh data from API…');
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`API fetch failed: ${response.status}`);
    }

    const json = await response.json();
    const problems = json.result ?? json;

    const problemMap = {};
    for (const p of problems) {
      const key = `${p.contestId}${p.index}`;
      problemMap[key] = p;
    }

    const payload = {
      timestamp: Date.now(),
      problemMap,
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    console.log(`[CF Filter] Cached ${Object.keys(problemMap).length} problems.`);
    return problemMap;
  }

  async function getProblemMap() {
    try {
      const cachedStr = localStorage.getItem(CACHE_KEY);
      if (cachedStr) {
        const cached = JSON.parse(cachedStr);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
          console.log('[CF Filter] Serving from cache.');
          return cached.problemMap;
        }
      }
    } catch (e) {
      console.warn('[CF Filter] Error reading cache from localStorage:', e);
    }
    return fetchAndCache();
  }

  // --- Filter State Management ---
  async function getSavedFilter() {
    try {
      const val = localStorage.getItem(STORAGE_KEY_FILTER);
      if (!val) return [];
      const parsed = JSON.parse(val);
      if (val === 'all') return [];
      if (typeof parsed === 'string') return [parsed]; // legacy storage fallback
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {
      // Handle case where raw string might be stored instead of JSON
      const val = localStorage.getItem(STORAGE_KEY_FILTER);
      if (val && val !== 'all') return [val];
    }
    return [];
  }

  function saveFilter(values) {
    localStorage.setItem(STORAGE_KEY_FILTER, JSON.stringify(values));
  }

  // --- DOM Utilities ---
  function queryAny(...selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  }

  function getProblemId(row) {
    const cell = row.querySelector('td:first-child');
    if (!cell) return '';
    return cell.innerText.replace(/\s+/g, '').trim();
  }

  function findProblemsTable() {
    return queryAny(
      'table.problems',
      '.problemset table',
      '#pageContent table',
      'table[class*="problem"]',
      'main table',
      'table'
    );
  }

  // --- UI Construction ---
  function buildSidebox() {
    if (!document.getElementById('cf-filter-styles')) {
      const style = document.createElement('style');
      style.id = 'cf-filter-styles';
      style.textContent = `
        .cf-filter-opts { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .cf-filter-lbl { cursor: pointer; user-select: none; }
        .cf-filter-cb { display: none; }
        .cf-filter-txt {
          display: inline-block;
          padding: 4px 8px;
          border: 1px solid #b9b9b9;
          border-radius: 4px;
          background: #f8f8f8;
          color: #222;
          font-size: 11px;
          font-family: inherit;
          transition: all 0.1s ease-in-out;
        }
        .cf-filter-lbl:hover .cf-filter-txt {
          background: #e8e8e8;
        }
        .cf-filter-cb:checked + .cf-filter-txt {
          background: #e1eefc;
          border-color: #3b5998;
          color: #3b5998;
          font-weight: bold;
        }
        #cf-filter-clear {
          width: 100%;
          padding: 5px;
          font-size: 12px;
          cursor: pointer;
          border: 1px solid #b9b9b9;
          background: #eee;
          border-radius: 4px;
          color: #333;
          transition: background 0.1s;
        }
        #cf-filter-clear:hover { background: #ddd; }
      `;
      document.head.appendChild(style);
    }

    const sidebox = document.createElement('div');
    sidebox.id = SIDEBOX_ID;
    sidebox.className = 'sidebox';

    const opts = CATEGORIES.filter(c => c.value !== 'all')
      .map(
        c =>
          '<label class="cf-filter-lbl">' +
          '<input type="checkbox" value="' + c.value + '" class="cf-filter-cb">' +
          '<span class="cf-filter-txt">' + c.label + '</span>' +
          '</label>'
      )
      .join('');

    sidebox.innerHTML =
      '<div class="roundbox">' +
      '<div class="caption titled" style="font-weight:bold;padding:6px 8px;border-bottom:1px solid #b9b9b9;">' +
      '&#9776; Filter Categories' +
      '</div>' +
      '<div class="content" style="padding:10px;">' +
      '<div class="cf-filter-opts">' +
      opts +
      '</div>' +
      '<div>' +
      '<button id="cf-filter-clear">Clear Filters (Show All)</button>' +
      '</div>' +
      '</div>' +
      '</div>';

    return sidebox;
  }

  function injectSidebox() {
    if (document.getElementById(SIDEBOX_ID)) {
      return document.getElementById(SIDEBOX_ID);
    }

    const sidebar = queryAny(
      '._rightVertical',
      '.right-sidebar',
      '#sidebar',
      '.sidebar',
      '[class*="rightVertical"]',
      '[class*="right"]',
      'td.right-sidebar',
      '.roundbox-list'
    );

    const sidebox = buildSidebox();

    if (sidebar) {
      const firstChild = sidebar.firstElementChild;
      if (firstChild) sidebar.insertBefore(sidebox, firstChild);
      else sidebar.appendChild(sidebox);
    } else {
      console.warn('[CF Filter] No sidebar found — using floating widget');
      sidebox.style.cssText =
        'position:fixed;top:80px;right:12px;z-index:99999;width:185px;box-shadow:0 2px 10px rgba(0,0,0,0.2);border-radius:4px;background:#fff;border:1px solid #ddd;';
      document.body.appendChild(sidebox);
    }

    return sidebox;
  }

  // --- Main Logic ---
  function applyFilter(selectedCategories, problemMap) {
    const table = findProblemsTable();
    if (!table) return;

    const rows = table.querySelectorAll('tr');

    for (const row of rows) {
      if (!row.querySelector('td')) continue;
      const id = getProblemId(row);
      if (!id) continue;

      if (!selectedCategories || selectedCategories.length === 0) {
        row.style.display = '';
        continue;
      }

      const problem = problemMap[id];
      if (!problem) {
        row.style.display = '';
        continue;
      }

      const matches =
        Array.isArray(problem.categories) &&
        selectedCategories.some(c => problem.categories.includes(c));
      
      if (matches) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    }
  }

  async function init() {
    console.log('[CF Filter Userscript] Script injected and running!');
    const path = window.location.pathname;
    if (!/^(\/problemset\/?|\/problemset\/page\/\d+\/?)$/.test(path)) {
      console.log('[CF Filter Userscript] Not a problemset page, aborting.');
      return;
    }

    if (!findProblemsTable()) {
      console.log('[CF Filter Userscript] Could not find the problems table! Check if Codeforces changed their layout.');
      return;
    }

    const sidebox = injectSidebox();
    if (!sidebox) return;

    let problemMap = null;
    try {
      problemMap = await getProblemMap();
    } catch (err) {
      console.error('[CF Filter] Error fetching problem map:', err);
      return;
    }

    let savedCategories = await getSavedFilter();

    const checkboxes = document.querySelectorAll('.cf-filter-cb');
    const updateCheckboxes = () => {
      checkboxes.forEach(cb => {
        cb.checked = savedCategories.includes(cb.value);
      });
    };
    updateCheckboxes();

    const applyAndSave = () => {
      saveFilter(savedCategories);
      applyFilter(savedCategories, problemMap);
    };

    applyAndSave();

    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          if (!savedCategories.includes(cb.value)) savedCategories.push(cb.value);
        } else {
          savedCategories = savedCategories.filter(v => v !== cb.value);
        }
        applyAndSave();
      });
    });

    document.getElementById('cf-filter-clear').addEventListener('click', () => {
      savedCategories = [];
      updateCheckboxes();
      applyAndSave();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
