(function() {
  'use strict';

  /**
   * Devin DeepWiki One-Tap Exporter
   * 機能: サイドバーの全ボタンをクリックして巡回し、本文をMarkdown化して1つのファイルに結合。
   */

  const VERSION = 'v0.0.3';
  const LOG = (...args) => console.log('[DeepWiki2md]', ...args);

  // サイドバーのwikiナビゲーションボタンを取得
  function findNavButtons() {
    LOG('=== findNavButtons 開始 ===');

    // 方法1: data-slot="sidebar-group-content" 内の button[aria-label]
    // (DeepWikiのWikiページナビゲーションはここに入っている)
    const groupContent = document.querySelector('[data-slot="sidebar-group-content"]');
    if (groupContent) {
      const buttons = [...groupContent.querySelectorAll('button[aria-label]')];
      if (buttons.length > 0) {
        LOG('方法1 sidebar-group-content ボタン → 発見', buttons.length, '件',
          buttons.map(b => b.getAttribute('aria-label')));
        return buttons;
      }
    }
    LOG('方法1 → 見つからず');

    // 方法2: data-slot="sidebar-menu-item" 内の button[aria-label]
    const menuItemButtons = [...document.querySelectorAll(
      '[data-slot="sidebar-menu-item"] button[aria-label]'
    )];
    if (menuItemButtons.length > 0) {
      LOG('方法2 sidebar-menu-item ボタン → 発見', menuItemButtons.length, '件');
      return menuItemButtons;
    }
    LOG('方法2 → 見つからず');

    // 方法3: data-slot="sidebar-content" 内の button[aria-label]
    const contentButtons = [...document.querySelectorAll(
      '[data-slot="sidebar-content"] button[aria-label]'
    )];
    if (contentButtons.length > 0) {
      LOG('方法3 sidebar-content ボタン → 発見', contentButtons.length, '件');
      return contentButtons;
    }
    LOG('方法3 → 見つからず');

    LOG('=== findNavButtons: 全方法失敗 ===');
    return [];
  }

  // 現在表示中のページのコンテンツエリアを取得
  function findContentBody() {
    // 方法1: .prose-main (DeepWikiのメインコンテンツ)
    const proseMain = document.querySelector('.wiki-content-container .prose-main');
    if (proseMain) return proseMain;

    // 方法2: wiki-content-container 内の flex-1 > article or .prose
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

    // 方法3: article要素
    const article = document.querySelector('article');
    if (article) return article;

    // 方法4: .prose クラス
    return document.querySelector('.prose');
  }

  // ボタンクリック後にコンテンツが更新されるまで待機 (MutationObserver使用)
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
          // DOM変更後に少し待ってからresolve (Reactのレンダリング完了を待つ)
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

      // タイムアウトフォールバック
      setTimeout(done, timeout);
    });
  }

  // HTMLをMarkdownに変換 (TurndownService使用)
  function htmlToMarkdown(html) {
    try {
      const ts = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });
      // ヘッダーアンカーボタン等の不要なUI要素を除去
      ts.remove(['button', 'script', 'style', 'svg', 'noscript']);
      return ts.turndown(html);
    } catch (e) {
      LOG('Turndown変換エラー:', e);
      // フォールバック: テキストのみ抽出
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return tmp.textContent;
    }
  }

  // ボタンを画面右下に生成
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

  // メイン実行ロジック
  exportBtn.onclick = async () => {
    LOG('=== ボタンクリック ===');

    const navButtons = findNavButtons();
    LOG('navButtons:', navButtons.length, '件');

    if (navButtons.length === 0) {
      alert(
        'サイドバーのナビゲーションボタンが見つかりません。\n' +
        'DeepWikiのWikiページを開いているか確認してください。\n' +
        '詳細はDevTools Console(F12)を確認してください。'
      );
      return;
    }

    if (!confirm(`${navButtons.length} ページを抽出してMarkdownを作成します。よろしいですか？`)) {
      return;
    }

    exportBtn.disabled = true;
    let combinedMarkdown =
      `# DeepWiki Export: ${document.title}\n` +
      `Export Date: ${new Date().toLocaleString()}\n\n`;

    let successCount = 0;

    for (let i = 0; i < navButtons.length; i++) {
      const btn = navButtons[i];
      const pageTitle = (
        btn.getAttribute('aria-label') || btn.innerText || `Page-${i + 1}`
      ).trim();

      exportBtn.innerText = `⏳ 取得中... (${i + 1}/${navButtons.length})`;
      LOG(`クリック中 [${i + 1}/${navButtons.length}]: ${pageTitle}`);

      try {
        await clickAndWait(btn);

        const contentNode = findContentBody();
        LOG(`  コンテンツ取得: ${contentNode
          ? 'OK (' + contentNode.className.slice(0, 60) + ')'
          : 'NG'}`);

        if (contentNode) {
          const pageUrl = window.location.href;
          const markdown = htmlToMarkdown(contentNode.innerHTML);
          combinedMarkdown += `\n---\n\n# ${pageTitle}\n\nURL: ${pageUrl}\n\n${markdown}\n`;
          successCount++;
        } else {
          combinedMarkdown += `\n---\n\n# ${pageTitle}\n\n⚠️ コンテンツが見つかりませんでした。\n`;
        }
      } catch (error) {
        console.error(`[DeepWiki2md] 取得失敗: ${pageTitle}`, error);
        combinedMarkdown += `\n---\n\n# ${pageTitle}\n\n⚠️ このページの取得に失敗しました。\n`;
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
