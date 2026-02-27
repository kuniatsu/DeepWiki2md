(function() {
  'use strict';

  /**
   * Devin DeepWiki One-Tap Exporter
   * 機能: サイドバーの全リンクを巡回し、本文をMarkdown化して1つのファイルに結合。
   */

  const VERSION = 'v0.0.2';
  const LOG = (...args) => console.log('[DeepWiki2md]', ...args);

  // サイドバーのulを複数の方法で検索（アプリのDOM変更に対応）
  function findSidebarUl() {
    LOG('=== findSidebarUl 開始 ===');

    // 参考情報: DOM内のdata属性を持つ要素を列挙
    const dataSidebarEls = document.querySelectorAll('[data-sidebar]');
    const dataSlotEls    = document.querySelectorAll('[data-slot]');
    const asideEls       = document.querySelectorAll('aside');
    LOG('data-sidebar 要素数:', dataSidebarEls.length, [...dataSidebarEls].map(e => e.tagName + '[' + e.dataset.sidebar + ']'));
    LOG('data-slot 要素数:',    dataSlotEls.length,    [...dataSlotEls].map(e => e.tagName + '[' + e.dataset.slot + ']'));
    LOG('aside 要素数:',        asideEls.length,        [...asideEls]);

    // 方法1: shadcn/ui data-sidebar="menu" 配下の ul
    let el = document.querySelector('[data-sidebar="menu"] ul');
    if (el) {
      LOG('方法1a [data-sidebar="menu"] ul → 発見', el);
      return el;
    }
    LOG('方法1a [data-sidebar="menu"] ul → 見つからず');

    el = document.querySelector('[data-sidebar="menu-button"] ul') ||
         document.querySelector('[data-sidebar] ul');
    if (el) {
      LOG('方法1b [data-sidebar] ul → 発見', el);
      return el;
    }
    LOG('方法1b [data-sidebar] ul → 見つからず');

    // 方法2: data-slot="sidebar" 配下の ul
    el = document.querySelector('[data-slot="sidebar"] ul');
    if (el) {
      LOG('方法2 [data-slot="sidebar"] ul → 発見', el);
      return el;
    }
    LOG('方法2 [data-slot="sidebar"] ul → 見つからず');

    // 方法3: aside 要素配下の ul
    el = document.querySelector('aside ul');
    if (el) {
      LOG('方法3 aside ul → 発見', el);
      return el;
    }
    LOG('方法3 aside ul → 見つからず');

    // 方法4: wiki-content-container の左サイドバー
    const container = document.querySelector('.wiki-content-container');
    LOG('方法4 .wiki-content-container:', container);
    if (container) {
      const children = [...container.children];
      LOG('方法4 子要素数:', children.length, children.map(c => c.className.slice(0, 60)));
      for (const child of children) {
        const hasFlex1 = child.classList.contains('flex-1');
        LOG(`  子要素 flex-1=${hasFlex1}:`, child.className.slice(0, 80));
        if (!hasFlex1) {
          const ul = child.querySelector('ul');
          if (ul) {
            LOG('方法4 flex-1でない子のul → 発見', ul);
            return ul;
          }
        }
      }
    }
    LOG('方法4 .wiki-content-container → 見つからず');

    // 方法5: user-layout-body 内の nav
    el = document.querySelector('.user-layout-body nav ul');
    if (el) {
      LOG('方法5 .user-layout-body nav ul → 発見', el);
      return el;
    }
    LOG('方法5 .user-layout-body nav ul → 見つからず');

    LOG('=== findSidebarUl: 全方法失敗 ===');
    return null;
  }

  // ナビゲーション要素を取得（fragment リンクのみのTOCを除外）
  function findNavElements(sidebarUl) {
    LOG('=== findNavElements 開始 ===');
    LOG('対象ul:', sidebarUl);
    LOG('ul内の子要素数:', sidebarUl.children.length);
    LOG('ul innerHTML(先頭500文字):', sidebarUl.innerHTML.slice(0, 500));

    // li button / li a を優先
    let candidates = [...sidebarUl.querySelectorAll('li button, li a')];
    LOG('li button, li a の件数:', candidates.length, candidates);

    // 見つからなければ a, button すべてを対象に
    if (candidates.length === 0) {
      candidates = [...sidebarUl.querySelectorAll('a, button')];
      LOG('a, button フォールバック件数:', candidates.length, candidates);
    }

    // フラグメントのみのリンク（TOC）を除外し、ページリンクだけ残す
    const pageLinks = candidates.filter(el => {
      if (el.tagName === 'A') {
        const href = el.getAttribute('href') || '';
        return href && !href.startsWith('#');
      }
      return true; // button はそのまま残す
    });
    LOG('フラグメント除外後のページリンク件数:', pageLinks.length, pageLinks);

    return pageLinks;
  }

  // 各ページのコンテンツボディを検索
  function findContentBody(doc) {
    // 方法1: wiki-content-containerのメインコンテンツ(flex-1)
    const container = doc.querySelector('.wiki-content-container');
    if (container) {
      const mainContent =
        container.querySelector(':scope > .flex-1') ||
        container.querySelector(':scope > div.flex.h-full.flex-1');
      if (mainContent) {
        const article =
          mainContent.querySelector('article') ||
          mainContent.querySelector('.prose');
        return article || mainContent;
      }
    }

    // 方法2: article要素
    let el = doc.querySelector('article');
    if (el) return el;

    // 方法3: .proseクラス
    el = doc.querySelector('.prose');
    if (el) return el;

    return null;
  }

  // 1. ボタンを画面に生成
  const exportBtn = document.createElement('button');
  exportBtn.id = 'deepwiki-one-tap-btn';
  exportBtn.innerText = `🚀 一括Markdown生成${VERSION}`;
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

  exportBtn.onmouseover = () => {
    exportBtn.style.transform = 'scale(1.05)';
  };

  exportBtn.onmouseout = () => {
    exportBtn.style.transform = 'scale(1)';
  };

  document.body.appendChild(exportBtn);

  // 2. メイン実行ロジック
  exportBtn.onclick = async () => {
    LOG('=== ボタンクリック ===');

    const sidebarUl = findSidebarUl();
    LOG('findSidebarUl 結果:', sidebarUl);
    if (!sidebarUl) {
      alert('サイドバーが見つかりません。Wikiのトップ画面を開いているか確認してください。\n詳細はDevTools Console(F12)を確認してください。');
      return;
    }

    const navElements = findNavElements(sidebarUl);
    LOG('navElements 最終結果:', navElements.length, '件');

    if (navElements.length === 0) {
      alert('ページリンクが見つかりませんでした。\n詳細はDevTools Console(F12)を確認してください。');
      return;
    }

    if (
      !confirm(
        `${navElements.length} ページを抽出してMarkdownを作成します。よろしいですか？`,
      )
    ) {
      return;
    }

    exportBtn.disabled = true;
    let combinedMarkdown = `# DeepWiki Export: ${
      document.title
    }\nExport Date: ${new Date().toLocaleString()}\n\n`;

    // Turndownサービスの初期化 (Markdown変換)
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });

    const baseUrl = window.location.origin;
    let successCount = 0;

    for (let i = 0; i < navElements.length; i++) {
      const el = navElements[i];
      const pageTitle = el.innerText.trim() || `Page-${i + 1}`;
      exportBtn.innerText = `⏳ 取得中... (${i + 1}/${navElements.length})`;

      // URLの特定
      let pageUrl = '';
      if (el.tagName === 'A' && el.getAttribute('href')) {
        pageUrl = el.href.startsWith('http')
          ? el.href
          : baseUrl + el.getAttribute('href');
      } else {
        // SPA遷移のみでURLが取れない場合は、より高度な実装が必要
        LOG(`スキップ(href無し): ${pageTitle}`);
        continue;
      }

      LOG(`取得中 [${i + 1}/${navElements.length}]: ${pageTitle} → ${pageUrl}`);

      try {
        const response = await fetch(pageUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const contentNode = findContentBody(doc);
        LOG(`  コンテンツ取得: ${contentNode ? 'OK' : 'NG'}`);

        if (contentNode) {
          const markdown = turndownService.turndown(contentNode.innerHTML);
          combinedMarkdown += `\n---\n\n# ${pageTitle}\n\nURL: ${pageUrl}\n\n${markdown}\n`;
          successCount++;
        }
      } catch (error) {
        console.error(`[DeepWiki2md] 取得失敗: ${pageTitle}`, error);
        combinedMarkdown += `\n---\n\n# ${pageTitle}\n\n⚠️ このページの取得に失敗しました。\n`;
      }

      // サーバー負荷軽減のための短い待機
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // 3. ファイルダウンロード処理
    const blob = new Blob([combinedMarkdown], { type: 'text/markdown' });
    const downloadUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = downloadUrl;
    downloadLink.download = `DeepWiki_Export_${new Date()
      .toISOString()
      .slice(0, 10)}.md`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    exportBtn.disabled = false;
    exportBtn.innerText = `✅ ${successCount}件完了!`;
    setTimeout(() => {
      exportBtn.innerText = `🚀 一括Markdown生成${VERSION}`;
    }, 5000);
  };
})();
