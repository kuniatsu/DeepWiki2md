(function() {
  'use strict';

  /**
   * Devin DeepWiki One-Tap Exporter
   * 機能: サイドバーの全リンクを巡回し、本文をMarkdown化して1つのファイルに結合。
   */

  // サイドバーのulを複数の方法で検索（アプリのDOM変更に対応）
  function findSidebarUl() {
    // 方法1: shadcn/ui SidebarコンポーネントのData属性
    let el = document.querySelector('[data-sidebar="menu"] ul');
    if (el) return el;

    el = document.querySelector('[data-slot="sidebar"] ul');
    if (el) return el;

    // 方法2: aside要素
    el = document.querySelector('aside ul');
    if (el) return el;

    // 方法3: wiki-content-containerの左サイドバー
    const container = document.querySelector('.wiki-content-container');
    if (container) {
      // flex-1でない子要素（メインコンテンツ以外）のulを探す
      for (const child of container.children) {
        if (!child.classList.contains('flex-1')) {
          const ul = child.querySelector('ul');
          if (ul) return ul;
        }
      }
      // 最初の子要素のulを試す
      if (container.firstElementChild) {
        el = container.firstElementChild.querySelector('ul');
        if (el) return el;
      }
    }

    // 方法4: user-layout-body内のnav
    el = document.querySelector('.user-layout-body nav ul');
    if (el) return el;

    return null;
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
  exportBtn.innerText = '🚀 一括Markdown生成';
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
    const sidebarUl = findSidebarUl();
    if (!sidebarUl) {
      alert('サイドバーが見つかりません。Wikiのトップ画面を開いているか確認してください。');
      return;
    }

    // サイドバー内の全リンク（またはボタン）を取得
    const navElements = Array.from(
      sidebarUl.querySelectorAll('li button, li a'),
    );

    if (navElements.length === 0) {
      alert('ページリンクが見つかりませんでした。');
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
        continue;
      }

      try {
        const response = await fetch(pageUrl);
        if (!response.ok) {
          throw new Error('Fetch failed');
        }
        const html = await response.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const contentNode = findContentBody(doc);

        if (contentNode) {
          const markdown = turndownService.turndown(contentNode.innerHTML);
          combinedMarkdown += `\n---\n\n# ${pageTitle}\n\nURL: ${pageUrl}\n\n${markdown}\n`;
          successCount++;
        }
      } catch (error) {
        console.error(`Failed to fetch: ${pageTitle}`, error);
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
      exportBtn.innerText = '🚀 一括Markdown生成';
    }, 5000);
  };
})();

