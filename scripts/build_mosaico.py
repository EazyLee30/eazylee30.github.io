"""Build the Mosaico-only Markdown collection within the existing Pages site."""
from datetime import date
import html
import json
from pathlib import Path
import re
import markdown

CANONICAL = 'https://eazylee.xyz'
TITLE = 'Mosaico 手记'
DESCRIPTION = '记录 ESP-Mosaico 的固件、应用开发与实机实验。从遇到问题，到可重复的解决办法。'


def esc(value):
    return html.escape(str(value), quote=True)


def entries(root):
    result = []
    for path in sorted((root / 'content/mosaico').glob('*.md'), reverse=True):
        if path.name.startswith('_'):
            continue
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}-[a-z0-9-]+', path.stem):
            raise ValueError('Invalid Mosaico article filename: ' + path.name)
        date.fromisoformat(path.stem[:10])
        source = path.read_text(encoding='utf-8')
        if not source.startswith('---\n') or '\n---\n' not in source[4:]:
            raise ValueError('Missing article metadata: ' + path.name)
        front, body = source[4:].split('\n---\n', 1)
        meta = dict(line.split(':', 1) for line in front.splitlines() if ':' in line)
        meta = {key.strip(): value.strip().strip('"\'') for key, value in meta.items()}
        if meta.get('draft', 'false').lower() == 'true':
            continue
        if not meta.get('title') or not meta.get('description'):
            raise ValueError('Article needs title and description: ' + path.name)
        engine = markdown.Markdown(extensions=['extra', 'sane_lists', 'toc'],
                                   extension_configs={'toc': {'toc_depth': '2'}})
        content = engine.convert(body)
        result.append({**meta, 'slug': path.stem, 'date': path.stem[:10],
                       'html': content, 'toc': engine.toc,
                       'minutes': max(1, round(len(body) / 650))})
    return result


def shell(title, description, route, body, article=False):
    canonical = CANONICAL + route
    kind = 'article' if article else 'website'
    return f'''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)} · EazyLee</title><meta name="description" content="{esc(description)}">
<link rel="canonical" href="{canonical}"><meta property="og:type" content="{kind}">
<meta property="og:title" content="{esc(title)}"><meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{canonical}"><meta property="og:image" content="{CANONICAL}/assets/brand/share-cover-v1.png">
<link rel="icon" href="/favicon.ico"><script src="/assets/js/theme.js?v=20261012e"></script>
<link rel="stylesheet" href="/assets/css/main.css?v=20261015a"><link rel="stylesheet" href="/assets/css/portfolio.css?v=20261012e"><link rel="stylesheet" href="/mosaico/assets/mosaico.css?v=20261023a">
</head><body class="mosaico-body"><a class="skip-link" href="#main">跳至正文</a>
<header class="m-header"><a class="m-brand" href="/cn/"><img src="/assets/avatar-head.png" width="32" height="32" alt="">EazyLee</a><span class="m-slash">/</span><a href="/mosaico/" class="m-section">Mosaico</a><nav aria-label="专区导航"><a href="/mosaico/">全部文章</a><a href="/cn/writing/">博客</a></nav><span data-theme-control></span></header>
{body}<footer class="m-footer"><a href="/mosaico/">Mosaico 手记</a><span>硬件 · 固件 · 实践</span><a href="/cn/">EazyLee ↗</a></footer></body></html>'''


def build(root):
    root = Path(root)
    posts = entries(root)
    output = root / 'mosaico'
    output.mkdir(exist_ok=True)
    rows = []
    for index, post in enumerate(posts, 1):
        rows.append(f'''<a class="m-post" href="/mosaico/{post['slug']}/"><span class="m-number">{index:02}</span><div><div class="m-meta"><time datetime="{post['date']}">{post['date'].replace('-', '.')}</time><span>{esc(post.get('category', '实机记录'))}</span></div><h2>{esc(post['title'])}</h2><p>{esc(post['description'])}</p><span class="m-read">阅读全文 <span aria-hidden="true">↗</span></span></div></a>''')
        article = f'''<main id="main" class="m-article-layout"><article class="m-article"><a class="m-back" href="/mosaico/">← 全部 Mosaico 文章</a><div class="m-meta"><time datetime="{post['date']}">{post['date'].replace('-', '.')}</time><span>{esc(post.get('category', '实机记录'))}</span><span>约 {post['minutes']} 分钟</span></div><h1>{esc(post['title'])}</h1><p class="m-deck">{esc(post['description'])}</p><div class="m-prose">{post['html']}</div><div class="m-article-end"><span class="m-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><p>继续记录，让下一次少走一点弯路。</p><a href="/mosaico/">返回 Mosaico 手记 →</a></div></article><aside class="m-toc" aria-label="文章目录"><span>本文目录</span>{post['toc']}</aside></main>'''
        target = output / post['slug'] / 'index.html'
        target.parent.mkdir(exist_ok=True)
        target.write_text(shell(post['title'], post['description'], '/mosaico/' + post['slug'] + '/', article, True), encoding='utf-8')
    listing = ''.join(rows) or '<p class="m-empty">文章准备中。</p>'
    body = f'''<main id="main" class="m-index"><section class="m-hero"><div class="m-eyebrow"><span class="m-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>EAZYLEE / FIELD NOTES</span></div><h1>Mosaico<span>手记</span><span class="m-dot">.</span></h1><p>{DESCRIPTION}</p><div class="m-hero-bottom"><span>ESP-Mosaico / 乐鑫</span><span>{len(posts):02} 篇记录</span></div></section><section class="m-entries" aria-labelledby="articles"><div class="m-section-label"><h2 id="articles">实验记录</h2><span>最新在前</span></div>{listing}</section><aside class="m-note"><span>关于这个专区</span><p>这里专门写 Mosaico。记录真实操作、源码依据和验证结果，也保留没有解决的边界。</p></aside></main>'''
    (output / 'index.html').write_text(shell(TITLE, DESCRIPTION, '/mosaico/', body), encoding='utf-8')
    manifest = output / '.generated.json'
    previous = json.loads(manifest.read_text()) if manifest.exists() else []
    current = [post['slug'] for post in posts]
    for slug in set(previous) - set(current):
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}-[a-z0-9-]+', slug):
            raise ValueError('Invalid generated-page record')
        target = output / slug / 'index.html'
        target.unlink(missing_ok=True)
        if target.parent.is_dir() and not any(target.parent.iterdir()):
            target.parent.rmdir()
    manifest.write_text(json.dumps(current) + '\n')
    return len(posts)


if __name__ == '__main__':
    print('Built', build(Path(__file__).resolve().parents[1]), 'Mosaico articles')
