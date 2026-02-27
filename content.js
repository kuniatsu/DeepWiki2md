(function() {
  'use strict';

  /**
   * Devin DeepWiki One-Tap Exporter
   * 機能: サイドバーの全ボタンをクリックして巡回し、本文をMarkdown化して1つのファイルに結合。
   *
   * URL形式について:
   *   DeepWikiはReact SPA。各Wikiページは #番号 のフラグメントURLで識別される。
   *   例: https://app.devin.ai/org/.../wiki/...#1
   *       https://app.devin.ai/org/.../wiki/...#1.1
   *       https://app.devin.ai/org/.../wiki/...#3.4
   *
   *   fetch() でこれらのURLを取得しても、# 以降はHTTPリクエストに含まれないため
   *   サーバーは空のSPAシェルHTMLを返すだけ。コンテンツは取得できない。
   *   → 解決策: ボタンを直接クリックし MutationObserver でDOM更新を待つ。
   */

  const VERSION = 'v0.0.4';
  const LOG = (...args) => console.log('[DeepWiki2md]', ...args);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // sidebar-group-content 内の li + button を解析し
  // セクション番号・予想URLを付けて返す
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function parseSidebarItems() {
    const groupContent = document.querySelector('[data-slot="sidebar-group-content"]');
    if (!groupContent) return null;

    const liItems = [...groupContent.querySelectorAll('li[data-slot="sidebar-menu-item"]')];
    const baseUrl = window.location.href.split('#')[0];

    let topCount = 0;
    // サブレベルごとのカウンタ (margin-left px → count)
    const subCounters = {};

    const items = liItems.map((li, idx) => {
      const btn       = li.querySelector('button[aria-label]');
      const label     = btn ? btn.getAttribute('aria-label') : `Item-${idx + 1}`;
      const styleAttr = li.getAttribute('style') || '';
      const mlMatch   = styleAttr.match(/margin-left:\s*(\d+)px/);
      const marginLeft = mlMatch ? parseInt(mlMatch[1], 10) : 0;

      let sectionNum;
      if (marginLeft === 0) {
        // トップレベル
        topCount++;
        // サブカウンタをリセット
        Object.keys(subCounters).forEach(k => { subCounters[k] = 0; });
        sectionNum = `${topCount}`;
      } else {
        // サブレベル (margin-left: 12px, 24px, ... に対応)
        if (!subCounters[marginLeft]) subCounters[marginLeft] = 0;
        subCounters[marginLeft]++;
        // 上位レベルのカウンタをリセット
        Object.keys(subCounters)
          .filter(k => parseInt(k) > marginLeft)
          .forEach(k => { subCounters[k] = 0; });
        sectionNum = `${topCount}.${subCounters[marginLeft]}`;
      }

      return {
        label,
        sectionNum,
        url: `${baseUrl}#${sectionNum}`,
        marginLeft,
        btn,
        li,
      };
    });

    return items;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 目次・ページ数・URLリストを console.log に出力
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function logTableOfContents(items) {
    LOG('');
    LOG('╔═══════════════════════════════════════════╗');
    LOG('║   DeepWiki 目次 (sidebar-group-content)   ║');
    LOG('╚═══════════════════════════════════════════╝');

    items.forEach(({ label, sectionNum, marginLeft, btn, li }) => {
      const indent = '  '.repeat(marginLeft / 12);
      const btnInfo  = btn  ? `<button aria-label="${btn.getAttribute('aria-label')}">` : '(button なし)';
      const liInfo   = `<li data-slot="sidebar-menu-item" style="margin-left:${marginLeft}px">`;
      LOG(`${indent}[${sectionNum}]  ${label}`);
      LOG(`${indent}      li  → ${liInfo}`);
      LOG(`${indent}      btn → ${btnInfo}`);
    });

    LOG('');
    LOG(`━━━ DL対象ページ数: ${items.length} ページ ━━━`);
    LOG('');
    LOG('━━━ DL対象URLリスト ━━━');
    LOG('  ※ DeepWikiはSPA (React)。fetch()でこれらのURLを取得すると');
    LOG('  ※ #以降がHTTPリクエストから除外され空のシェルHTMLが返るだけ。');
    LOG('  ※ → 当拡張はボタンクリック方式で正しく対応済み。');
    LOG('');
    items.forEach(({ sectionNum, url, label }) => {
      LOG(`  #${sectionNum}  ${url}  (${label})`);
    });
    LOG('');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ページ読み込み後、サイドバーが揃い次第 TOC をログ出力
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function waitForSidebarAndLog() {
    const tryLog = () => {
      const items = parseSidebarItems();
      if (items && items.length > 0) {
        logTableOfContents(items);
        return true;
      }
      return false;
    };

    if (tryLog()) return;

    // sidebar-group-content がまだ未レンダリングの場合は待機
    const observer = new MutationObserver(() => {
      if (tryLog()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 30000);
  }

  // 初回ログ出力
  waitForSidebarAndLog();

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 現在表示中のページのコンテンツエリアを取得
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function findContentBody() {
    // 方法1: .prose-main (DeepWikiのメインコンテンツ)
    const proseMain = document.querySelector('.wiki-content-container .prose-main');
    if (proseMain) return proseMain;

    // 方法2: wiki-content-container 内の flex-1
    const container = document.querySelector('.wiki-content-container');
    if (container) {
      const flexOne = container.querySelector(':scope > div > .flex-1');
      if (flexOne) {
        return flexOne.querySelector('article') ||
               flexOne.querySelector('.prose') ||
               flexOne;
      }
      return container.querySelector('article') ||
             container.querySelector('.prose') ||
             container;
    }

    // 方法3: article
    const article = document.querySelector('article');
    if (article) return article;

    // 方法4: .prose
    return document.querySelector('.prose');
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ボタンクリック後にReactのDOM更新を待機
  // DeepWikiの #fragment URL はSPAナビゲーション = ボタンクリック方式で対応
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function clickAndWait(button, timeout = 4000) {
    return new Promise((resolve) => {
      const contentContainer =
        document.querySelector('.wiki-content-container') ||
        document.querySelector('main');

      if (!contentContainer) {
        button.click();
        setTimeout(resolve, 1200);
        return;
      }

      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          setTimeout(resolve, 400);
        }
      };

      const observer = new MutationObserver(done);
      observer.observe(contentContainer, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      button.click();
      setTimeout(done, timeout);
    });
  }

  // HTMLをMarkdownに変換
  function htmlToMarkdown(html) {
    try {
      const ts = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });
      ts.remove(['button', 'script', 'style', 'svg', 'noscript']);
      return ts.turndown(html);
    } catch (e) {
      LOG('Turndown変換エラー:', e);
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return tmp.textContent;
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // ボタンを画面右下に生成
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const exportBtn = document.createElement('button');
  exportBtn.id = 'deepwiki-one-tap-btn';
  exportBtn.innerText = `🚀 一括MD生成 ${VERSION}`;
  Object.assign(exportBtn.style, {
    position: 'fixed',
    bottom: '30px',
    right: '30px',
    zIndex: '999999',
    padding: '12px 24px',
    backgroundColor: '#ec4899',
    color: '#ffffff',
    border: 'none',
    borderRadius: '50px',
    cursor: 'pointer',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    fontWeight: 'bold',
    fontSize: '14px',
    transition: 'transform 0.2s ease',
  });

  exportBtn.onmouseover = () => { exportBtn.style.transform = 'scale(1.05)'; };
  exportBtn.onmouseout  = () => { exportBtn.style.transform = 'scale(1)'; };

  document.body.appendChild(exportBtn);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // メイン実行ロジック
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  exportBtn.onclick = async () => {
    LOG('=== ボタンクリック ===');

    // 最新のサイドバー情報を取得してログ再出力
    const items = parseSidebarItems();
    if (!items || items.length === 0) {
      alert(
        'サイドバーのナビゲーションが見つかりません。\n' +
        'DeepWikiのWikiページを開いているか確認してください。\n' +
        '詳細はDevTools Console(F12)を確認してください。'
      );
      return;
    }

    logTableOfContents(items);

    if (!confirm(`${items.length} ページを抽出してMarkdownを作成します。よろしいですか？`)) {
      return;
    }

    exportBtn.disabled = true;
    let combinedMarkdown =
      `# DeepWiki Export: ${document.title}\n` +
      `Export Date: ${new Date().toLocaleString()}\n\n`;

    let successCount = 0;

    for (let i = 0; i < items.length; i++) {
      const { label, sectionNum, btn } = items[i];

      exportBtn.innerText = `⏳ 取得中... (${i + 1}/${items.length})`;
      LOG(`クリック中 [${i + 1}/${items.length}] #${sectionNum}: ${label}`);

      try {
        await clickAndWait(btn);

        // クリック後の実際のURL (#fragment付き) を記録
        const pageUrl = window.location.href;
        LOG(`  → 実際のURL: ${pageUrl}`);

        const contentNode = findContentBody();
        LOG(`  コンテンツ取得: ${contentNode
          ? 'OK (' + contentNode.className.slice(0, 60) + ')'
          : 'NG'}`);

        if (contentNode) {
          const markdown = htmlToMarkdown(contentNode.innerHTML);
          combinedMarkdown += `\n---\n\n# ${label}\n\nURL: ${pageUrl}\n\n${markdown}\n`;
          successCount++;
        } else {
          combinedMarkdown += `\n---\n\n# ${label}\n\n⚠️ コンテンツが見つかりませんでした。\n`;
        }
      } catch (error) {
        console.error(`[DeepWiki2md] 取得失敗: ${label}`, error);
        combinedMarkdown += `\n---\n\n# ${label}\n\n⚠️ このページの取得に失敗しました。\n`;
      }
    }

    // ファイルダウンロード
    const blob = new Blob([combinedMarkdown], { type: 'text/markdown' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `DeepWiki_Export_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);

    exportBtn.disabled = false;
    exportBtn.innerText = `✅ ${successCount}件完了!`;
    setTimeout(() => {
      exportBtn.innerText = `🚀 一括MD生成 ${VERSION}`;
    }, 5000);
  };
})();
