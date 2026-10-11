# Journal

Write Markdown here and commit to `main`. GitHub Actions builds the homepage excerpts, journal indexes and article pages before publishing to GitHub Pages.

## Write an entry

Create a file in one of these folders:

- `en/2026-10-11-title.md` — English
- `zh-CN/2026-10-11-title.md` — 简体中文
- `zh-TW/2026-10-11-title.md` — 繁體中文

Use the same filename in each language for translations. The filename date is the publication date. You can publish in one language; the other two routes show the original with an explicit language note. Translations are never invented. `_`-prefixed files and `draft: true` entries are not published.

```markdown
---
title: 今天的标题
description: 首页列表中使用的简短介绍。
draft: false
---

今天的正文。

## 一张照片

![说明](/assets/journal/2026-10-11/photo.jpg)
```

Markdown supports headings, lists, links, images, blockquotes, fenced code and tables. Put images under `assets/journal/`; use site-root URLs so they work from all three language routes.

## Local preview

```sh
python3 -m pip install -r requirements-site.txt
python3 scripts/build_site.py
python3 -m http.server 8765 --bind 127.0.0.1
```

After editing Markdown, run the build again and reload `/journal/`, `/cn/journal/` or `/tw/journal/`. There is no browser editor or account login to manage.

`content/` and build scripts are excluded from the deployed artifact, so draft source files are not published. Deleting an entry or marking it draft removes its generated article routes on the next build. Existing articles are preserved independently.
