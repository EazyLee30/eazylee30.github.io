#!/usr/bin/env python3
"""Build the personal pages and Markdown journal. Other existing routes are preserved."""
from pathlib import Path
import argparse, datetime, html, json, os, re, urllib.request
import markdown
from opencc import OpenCC
ROOT = Path(__file__).resolve().parents[1]
LOCALES = json.loads((ROOT/'content/site.json').read_text())
OWNER = 'EazyLee30'
def esc(value): return html.escape(str(value), quote=True)
def icon(name): return f'<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg?v=20261012h#{name}"/></svg>'
def arrow(): return icon('arrow-up-right')
def save(path, content):
    path=ROOT/path; path.parent.mkdir(parents=True,exist_ok=True); path.write_text(content, encoding='utf-8')
def refresh_github():
    path=ROOT/'assets/data/github.json'
    try:
        rows=[]
        for page in range(1,11):
            headers={'User-Agent':'eazylee-portfolio','Accept':'application/vnd.github+json'}
            if os.environ.get('GITHUB_TOKEN'): headers['Authorization']='Bearer '+os.environ['GITHUB_TOKEN']
            request=urllib.request.Request(f'https://api.github.com/users/{OWNER}/repos?per_page=100&sort=pushed&page={page}',headers=headers)
            batch=json.load(urllib.request.urlopen(request,timeout=15)); rows.extend(batch)
            if len(batch)<100: break
        fields=['name','description','html_url','homepage','pushed_at','language','fork','archived','stargazers_count']
        public=[{k:r.get(k) for k in fields} for r in rows if not r.get('private')]
        path.write_text(json.dumps({'fetched_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'repositories':public},ensure_ascii=False,indent=2)+'\n')
    except Exception as error:
        if not path.exists(): raise
        print(f'GitHub unavailable; using saved snapshot ({type(error).__name__}).')
def wordmark(locale):
    svg=(ROOT/'assets/art/eazylee-wordmark.svg').read_text()
    bitmap=(ROOT/'assets/data/wordmark.json').read_text()
    action={'en':'Replay wordmark animation','zh-CN':'重播字标动效','zh-TW':'重播字標動效'}[locale]
    return f'<h1 class="wordmark" id="name"><button class="wordmark-target" type="button" aria-label="EAZYLEE — {action}"><span class="sr-only">EAZYLEE</span>'+svg+'</button></h1><script id="wordmark-data" type="application/json">'+bitmap+'</script>'

def site_menu(locale, route):
    d=LOCALES[locale]
    caption,label,language,themes,close,empty={'en':('Go…','Navigation','Language','Themes','Close menu','No matches'), 'zh-CN':('前往…','导航','语言','主题','关闭菜单','没有匹配项'), 'zh-TW':('前往…','導覽','語言','主題','關閉選單','沒有符合項目')}[locale]
    search_label={'en':'Search pages, projects and articles','zh-CN':'搜索页面、项目和文章','zh-TW':'搜尋頁面、專案與文章'}[locale]
    def link(title,url,mark,keywords='',current=False,avatar=False):
        art='<img class="brand-avatar" src="/assets/avatar-head.png" width="24" height="24" alt="">' if avatar else icon(mark)
        active=' aria-current="page"' if current else ''
        return f'<a class="site-menu-row" href="{esc(url)}" data-menu-search="{esc(str(title)+" "+keywords)}"{active}>{art}<span>{esc(title)}</span></a>'
    def branch(name,title,mark,keywords):
        active=' aria-current="page"' if route==name+'/' else ''
        return f'<button class="site-menu-row" type="button" data-menu-go="{name}" data-menu-search="{esc(title+" "+keywords)}" aria-controls="site-menu-{name}" aria-expanded="false"{active}>{icon(mark)}<span>{esc(title)}</span><span class="site-menu-chevron">{icon("chevron")}</span></button>'
    def panel(name,title,rows):
        return f'<div data-menu-panel="{name}" data-menu-label="{esc(title)}" id="site-menu-{name}" role="listbox" hidden>{rows}</div>'
    rows=link(d['back'],d['prefix']+'/', 'grid','home homepage 首页 首頁 eazylee biotech super intelligence',route=='',True)
    for name,mark in [('works','grid'),('writing','book'),('workout','workout')]:
        rows+=branch(name,d[name],mark,name+' '+LOCALES['zh-CN'][name]+' '+LOCALES['zh-TW'][name])
    rows+=f'<button class="site-menu-row" type="button" data-menu-theme data-menu-search="themes theme palette color 主题 主題">{icon("palette")}<span>{themes}</span></button>'
    rows+=branch('language',language,'globe','language languages 语言 語言 English Chinese')
    rows+=link('GitHub',f'https://github.com/{OWNER}','github','github repositories 仓库 倉庫')
    overview={'en':{'works':'All works','writing':'All writing','workout':'Workout overview'},'zh-CN':{'works':'全部作品','writing':'全部文章','workout':'训练主页'},'zh-TW':{'works':'全部作品','writing':'全部文章','workout':'訓練首頁'}}[locale]
    work_rows=link(overview['works'],d['prefix']+'/works/','grid','works projects 作品',route=='works/')
    snapshot=ROOT/'assets/data/github.json'
    repos={r['name']:r for r in json.loads(snapshot.read_text())['repositories']} if snapshot.exists() else {}
    for project in sorted(PROJECTS,key=lambda p:repos.get(p['name'],{}).get('pushed_at') or '',reverse=True):
        title=project['title'];title=title.get(locale,title.get('en')) if isinstance(title,dict) else title
        url=project.get('visit') or f'https://github.com/{OWNER}/{project["name"]}'
        if project['name']=='reberry':url={'en':'/reberry/','zh-CN':'/reberry/zh-CN/','zh-TW':'/reberry/zh-TW/'}[locale]
        keywords=project['name']+' '+' '.join(project['description'].values())
        work_rows+=link(title,url,'grid',keywords)
    writing_rows=link(overview['writing'],d['prefix']+'/writing/','book','writing articles 文章',route=='writing/')
    writing_rows+=link('Mosaico 手记','/mosaico/','book','mosaico esp claw vibe 固件 开发 实验')
    reberry_title={'en':'reberry — The keyboard remembers','zh-CN':'reberry — 键盘还记得','zh-TW':'reberry — 鍵盤還記得'}[locale]
    reberry_url={'en':'/reberry/','zh-CN':'/reberry/zh-CN/','zh-TW':'/reberry/zh-TW/'}[locale]
    writing_rows+=link(reberry_title,reberry_url,'book','blackberry classic reberry 黑莓')
    for slug,key in [('cliproxy-design','article1'),('nas-stack','article2')]:
        writing_rows+=link(d[key],f'{d["prefix"]}/archive/{slug}.html','book',slug+' '+' '.join(v[key] for v in LOCALES.values()))
    workout_rows=link(overview['workout'],d['prefix']+'/workout/','workout','workout training exercise fitness 训练 訓練 健身',route=='workout/')
    workout_rows+=link('Whooper','https://whooper.eazylee.si','workout','WHOOP recovery sleep training 恢复 恢復 睡眠 训练 訓練')
    workout_rows+=link('Luck Ring',f'https://github.com/{OWNER}/luck-ring','workout','smart ring sleep activity 智能戒指 睡眠')
    language_rows=''.join(link({'en':'English','zh-CN':'简体中文','zh-TW':'繁體中文'}[k],v['prefix']+'/'+route,'globe','language languages '+k,k==locale) for k,v in LOCALES.items())
    panels=panel('works',d['works'],work_rows)+panel('writing',d['writing'],writing_rows)+panel('workout',d['workout'],workout_rows)+panel('language',language,language_rows)
    return f'<dialog class="site-menu" id="site-menu" aria-label="{label}" data-menu-empty="{empty}"><div class="site-menu-head"><button class="site-menu-back" type="button" data-menu-back aria-label="{ {'en':'Back','zh-CN':'返回','zh-TW':'返回'}[locale] }" tabindex="-1" hidden>{icon("arrow-left")}</button><input class="site-menu-search" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" placeholder="{caption}" data-root-placeholder="{caption}" aria-label="{search_label}" aria-controls="site-menu-main" autocomplete="off" spellcheck="false" enterkeyhint="go"></div><span class="sr-only" data-menu-status aria-live="polite"></span><div class="site-menu-body"><div data-menu-panel="main" data-menu-label="" id="site-menu-main" role="listbox">{rows}</div>{panels}<div data-menu-panel="results" id="site-menu-results" role="listbox" hidden></div></div></dialog>'

def header(locale, route=''):
    d=LOCALES[locale]
    links=''.join(f'<a href="{v["prefix"]}/{route}" lang="{k}" hreflang="{k}"'+(' aria-current="page"' if k==locale else '')+'>'+label+'</a>' for k,v,label in [(k,v,{'en':'EN','zh-CN':'简','zh-TW':'繁'}[k]) for k,v in LOCALES.items()])
    globe='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z"/></svg>'
    navigation=''.join(f'<a href="{d["prefix"]}/{name}/"'+(' aria-current="page"' if route.startswith(name+'/') else '')+f'>{d[name]}</a>' for name in ('works','writing','workout'))
    menu_label, close_label, theme_label = {'en': ('Menu', 'Close menu', 'Change theme'), 'zh-CN': ('菜单', '关闭菜单', '切换主题'), 'zh-TW': ('選單', '關閉選單', '切換主題')}[locale]
    toggle = f'<button class="mobile-nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-drawer" aria-label="{menu_label}" data-label-open="{menu_label}" data-label-close="{close_label}"><span class="mnav-bars" aria-hidden="true"><span></span><span></span><span></span></span></button>'
    sheet = f'<aside class="mobile-drawer" id="mobile-drawer" aria-label="{menu_label}"><nav class="drawer-nav" aria-label="{menu_label}">{navigation}</nav><div class="drawer-tools"><button class="drawer-row" type="button" data-open-theme>{icon("palette")}<span>{theme_label}</span><kbd>T</kbd></button><div class="drawer-row drawer-lang"><span>{d["lang"]}</span><nav aria-label="{d["lang"]}">{links}</nav></div><a class="drawer-row" href="https://github.com/{OWNER}">{icon("github")}<span>GitHub</span></a></div></aside>'
    scrim = '<div class="nav-scrim" data-nav-close></div>'
    return f'<header class="site-header"><div class="header-inner"><button class="brand-name" type="button" data-site-menu aria-haspopup="dialog" aria-controls="site-menu" aria-expanded="false" aria-label="EazyLee · {menu_label}"><img class="brand-avatar" src="/assets/avatar-head.png" width="44" height="44" alt=""></button><nav class="page-nav" aria-label="{menu_label}">{navigation}</nav><div class="header-actions"><div data-theme-control></div><details class="language-control"><summary aria-label="Language">{globe}</summary><nav class="language-options" aria-label="Language">{links}</nav></details><a class="header-github" href="https://github.com/{OWNER}" aria-label="GitHub">{icon("github")}</a>{toggle}</div>{sheet}</div></header>' + scrim + site_menu(locale,route)

def share_metadata(locale, route='', title='EazyLee'):
    d=LOCALES[locale]; section=route.split('/')[0]
    social_title='EazyLee' if not section else f'{d.get(section, title.split(" · ")[0])} · EazyLee'
    description=d.get({'works':'worksNote','workout':'workoutNote'}.get(section,''),d['subtitle'])
    if section=='workout':description={'en':'Today on WHOOP. Nudge EazyLee to train if no workout is recorded.','zh-CN':'今天练了吗？查看 WHOOP 训练状态，催 EazyLee 练薄肌。','zh-TW':'今天練了嗎？查看 WHOOP 訓練狀態，催 EazyLee 練薄肌。'}[locale]
    if route.startswith('workout/share/'):
        social_title=title
        date=route.split('/')[2]
        description={'en':f"EazyLee's WHOOP training record · {date}",'zh-CN':f'EazyLee 的 WHOOP 训练记录 · {date}','zh-TW':f'EazyLee 的 WHOOP 訓練記錄 · {date}'}[locale]
    canonical=f'https://eazylee.xyz{d["prefix"]}/{route}'
    square='https://eazylee.xyz/assets/brand/share-avatar-v1.png'
    cover='https://eazylee.xyz/assets/brand/share-cover-v1.png'
    alt={'en':"EazyLee’s Notion-style avatar",'zh-CN':'EazyLee 的 Notion 风格头像','zh-TW':'EazyLee 的 Notion 風格頭像'}[locale]
    og_locale={'en':'en_US','zh-CN':'zh_CN','zh-TW':'zh_TW'}[locale]
    tags=[('og:type','website'),('og:site_name','EazyLee'),('og:locale',og_locale),('og:title',social_title),('og:description',description),('og:url',canonical),('og:image',square),('og:image:secure_url',square),('og:image:type','image/png'),('og:image:width','600'),('og:image:height','600'),('og:image:alt',alt)]
    out=''.join(f'<meta property="{name}" content="{esc(value)}">' for name,value in tags)
    out+=''.join(f'<meta name="{name}" content="{esc(value)}">' for name,value in [('twitter:card','summary_large_image'),('twitter:title',social_title),('twitter:description',description),('twitter:image',cover),('twitter:image:alt',alt+' · EAZYLEE')])
    out+='<link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/favicon-32-v1.png"><link rel="icon" type="image/png" sizes="192x192" href="/assets/brand/favicon-192-v1.png"><link rel="apple-touch-icon" sizes="180x180" href="/assets/brand/apple-touch-icon-v1.png">'
    out+=f'<link rel="image_src" href="{square}">'
    return out

def page(locale,body,route='',journal=False,title='EazyLee'):
    d=LOCALES[locale];head_filter='<svg width="0" height="0" class="avatar-filters" aria-hidden="true"><defs><filter id="header-avatar-ink" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha" result="shade"/><feComponentTransfer in="shade" result="line"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feComposite in="line" in2="SourceAlpha" operator="in" result="glyph"/><feFlood class="portrait-tint" result="ink"/><feComposite in="ink" in2="glyph" operator="in"/></filter></defs></svg>';alts=''.join(f'<link rel="alternate" hreflang="{k}" href="https://eazylee.xyz{v["prefix"]}/{route}">' for k,v in LOCALES.items())
    return f'''<!DOCTYPE html>
<html lang="{locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(title)}</title>{share_metadata(locale,route,title)}<meta name="description" content="{esc(d['subtitle'])}"><link rel="canonical" href="https://eazylee.xyz{d['prefix']}/{route}">{alts}<link rel="alternate" hreflang="x-default" href="https://eazylee.xyz/{route}"><script src="/assets/js/theme.js?v=20261012e"></script><script defer src="/assets/js/portfolio.js?v=20261012e"></script><script defer src="/assets/js/hero-field.js?v=20261012h"></script><script defer src="/assets/js/mobile-nav.js?v=20261012e"></script><script defer src="/assets/js/site-menu.js?v=20261012k"></script><script type="module" src="/assets/js/avatar-turn.js?v=20261012e"></script><link rel="stylesheet" href="/assets/css/main.css?v=20261015a"><link rel="stylesheet" href="/assets/css/portfolio.css?v=20261012e"></head>
<body class="{'journal-page' if journal else 'home-page'}"><a class="skip-link" href="#main-content">{d['skip']}</a>{head_filter}{header(locale,route)}{body}</body></html>'''
def device():
    keys=''.join(f'<rect x="{154+c*19}" y="{154+r*14}" width="15" height="9" rx="2"/>' for r in range(4) for c in range(7))
    return f'<svg class="berry-device" viewBox="0 0 420 260" fill="none" stroke="currentColor" aria-hidden="true"><rect x="139" y="13" width="143" height="230" rx="15" stroke-width="2"/><path d="M181 24h58" stroke-width="2"/><rect x="150" y="36" width="121" height="98" rx="2"/><path class="berry-terminal" d="m161 58 9 6-9 6m17 0h21M161 89h91m-91 12h67m-67 12h81" stroke-width="1.5"/><path d="M149 143h123"/><rect x="201" y="137" width="20" height="13" rx="4"/>{keys}<path d="M163 218h96" stroke-width="4"/><path class="device-dimension" d="M110 14v229m-5-229h10m-10 229h10M300 36h48m-48 98h48" stroke-dasharray="2 4" opacity=".35"/></svg>'
def journal_entries():
    entries={}
    for locale in LOCALES:
        for path in sorted((ROOT/f'content/journal/{locale}').glob('*.md')):
            if path.name.startswith('_'): continue
            match=re.fullmatch(r'(\d{4}-\d{2}-\d{2})(?:-[a-z0-9-]+)?',path.stem)
            if not match: raise ValueError(f'Use YYYY-MM-DD-slug.md: {path}')
            datetime.date.fromisoformat(match[1])
            source=path.read_text(); meta={}
            if source.startswith('---\n'):
                end=source.find('\n---\n',4)
                if end<0: raise ValueError(f'Unclosed frontmatter: {path}')
                for line in source[4:end].splitlines():
                    if ':' in line:
                        k,v=line.split(':',1);meta[k.strip()]=v.strip().strip('"\'')
                source=source[end+5:]
            if meta.get('draft','false').lower()=='true': continue
            title=meta.get('title') or path.stem
            excerpt=meta.get('description','')
            entries.setdefault(path.stem,{})[locale]={'slug':path.stem,'date':match[1],'title':title,'description':excerpt,'html':markdown.markdown(source,extensions=['extra','sane_lists'])}
    return entries

def journal_rows(locale,entries,limit=None):
    rows=[]; d=LOCALES[locale]
    for n,slug in enumerate(sorted(entries,reverse=True)[:limit],1):
        translations=entries[slug]; entry=translations.get(locale) or translations.get('en') or next(iter(translations.values()))
        original=next(k for k,v in translations.items() if v is entry)
        marker='' if original==locale else f'<span class="entry-language">{LOCALES[original]["label"]}</span>'
        rows.append(f'<a class="journal-row" href="{d["prefix"]}/journal/{slug}/"><span class="sheet-number">{n:02}</span><time datetime="{entry["date"]}">{entry["date"].replace("-",".")}</time><span>{esc(entry["title"])} {marker}</span>{arrow()}</a>')
    return ''.join(rows) or f'<div class="journal-empty"><span class="sheet-number">01</span><p>{d["journalEmpty"]}</p></div>'
def home(locale,entries,repos):
    d=LOCALES[locale];p=d['prefix'];known={r['name']:r for r in repos};git=f'https://github.com/{OWNER}'
    cards=[]
    for name,desc,art in [('reberry',d['reberry'],f'<div class="project-art reberry-art">{device()}<span class="art-label">BlackBerry Classic / Q20</span></div>'),('muse-charm',d['muse'],f'<div class="project-art muse-art"><div class="muse-screen"><img src="https://raw.githubusercontent.com/EazyLee30/muse-charm/main/docs/charm-ui.gif" alt="Muse Charm firmware UI" width="848" height="354" loading="lazy"><span class="muse-fallback" aria-hidden="true">Muse</span></div><button type="button" class="demo-switch" aria-label="{d["demo"]}" aria-pressed="false">Paper / Ink</button></div>'),('whooper-2.0',d['whooper'],'<div class="project-art whooper-art" aria-hidden="true"><div class="rhythm-lines">'+''.join(f'<i style="--bar:{height}%"></i>' for height in [18,31,40,29,55,83,65,44,72,91,68,56,77,96,79,50,64,43,25,31,47,26,12])+ '</div><span class="art-label">Whooper / Recovery · Sleep · Training</span></div>')]:
        r=known.get(name,{});url=r.get('html_url',git+'/'+name); visit=('https://whooper.eazylee.si' if name=='whooper-2.0' else r.get('homepage'))
        links=(f'<a class="inline-link" href="{esc(visit)}">{d["visit"]} {arrow()}</a>' if visit else '')+f'<a class="inline-link" href="{esc(url)}">{icon("github")}{d["source"]} {arrow()}</a>'
        display={'reberry':'reberry','muse-charm':'Muse Charm','whooper-2.0':'Whooper'}[name]
        cards.append(f'<article class="work-card reveal">{art}<div class="work-card-copy"><h3>{display}</h3><p>{desc}</p><div class="project-links">{links}</div></div></article>')
    others=''.join(f'<a class="other-work" href="{esc(url)}"><span><strong>{name}</strong><small>{desc}</small></span>{arrow()}</a>' for name,desc,url in [('xfxmd',d['xfxmd'],'https://md.shxfx.top/'),('Image prompt gallery',d['gallery'],'https://eazylee.xyz/gpt-image2-gallery/'),(d['stock'],d['stockDesc'],'/stock/cn/')])
    recent=sorted([r for r in repos if not r['fork'] and not r['archived'] and r['name'] not in [OWNER,'eazylee30.github.io','whooper-privacy']],key=lambda r:r['pushed_at'] or '',reverse=True)[:4]
    rows=''.join(f'<a class="activity-row" href="{esc(r["html_url"])}"><span>{icon("github")}<span><strong>{esc(r["name"])}</strong><small>{esc(r.get("description") or "")}</small></span></span><time datetime="{esc(r["pushed_at"])}">{r["pushed_at"][:10].replace("-",".")}</time>{arrow()}</a>' for r in recent)
    xhs={'en':'Xiaohongshu','zh-CN':'小红书','zh-TW':'小紅書'}[locale]
    social=''.join(f'<a href="{url}"><span class="social-label">{icon(mark)}{label}</span>{arrow()}</a>' for mark,label,url in [('x','X / Twitter','https://x.com/0xEzLee'),('instagram','Instagram','https://www.instagram.com/0xeazylee/'),('github','GitHub',git),('linkedin','LinkedIn','https://www.linkedin.com/in/eazylee/'),('xiaohongshu',xhs,'https://xhslink.cn/o/3dyQZAFo5xL'),('wechat',d['wechat'],p+'/wechat/official/'),('channels',d['channels'],p+'/wechat/channels/')])
    articlep=p
    body=f'''<svg width="0" height="0" aria-hidden="true" class="avatar-filters"><defs><filter id="avatar-ink-light" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha" result="shade"/><feComponentTransfer in="shade" result="inverse"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feComposite in="inverse" in2="SourceAlpha" operator="in" result="contours"/><feFlood class="portrait-tint" result="ink"/><feComposite in="ink" in2="contours" operator="in"/></filter><filter id="avatar-ink-dark" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha" result="shade"/><feComposite in="shade" in2="SourceAlpha" operator="in" result="highlights"/><feFlood class="portrait-tint" result="ink"/><feComposite in="ink" in2="highlights" operator="in"/></filter></defs></svg>
<main id="main-content"><section class="hero"><div class="site-shell hero-inner">{wordmark(locale)}<div class="hero-intro"><h2>{d['title']}</h2><p>{d['subtitle']}</p><div class="hero-actions"><a class="button button-primary" href="{p}/journal/">{icon('book')}{d['journal']}</a><a class="button" href="{git}">{icon('github')}GitHub</a></div></div></div></section>
<section class="about-section"><div class="site-shell about-grid"><div class="about-copy reveal"><h2 class="type-title">{d['about']}</h2><p>{d['bio']}</p><a class="inline-link" href="mailto:0xeazylee@gmail.com">0xeazylee@gmail.com {arrow()}</a></div><div class="portrait reveal"><canvas class="avatar-turn" role="img" aria-label="{d['portrait']}"></canvas><div class="portrait-scan" aria-hidden="true"></div><svg class="avatar-image" viewBox="134 12 152 406" role="img" aria-label="{d['portrait']}"><image href="/assets/art/eazylee-turnaround-v3.png" width="1254" height="1254"/></svg></div></div></section>
<div class="site-shell"><section class="section"><div class="section-heading reveal"><h2 class="type-title">{d['works']}</h2></div><div class="portfolio-grid">{''.join(cards)}</div><div class="other-works reveal">{others}</div></section>
<section class="section activity-section"><div class="section-heading reveal"><h2 class="type-title">{d['recent']}</h2><a class="inline-link" href="{git}?tab=repositories">{d['more']} {arrow()}</a></div><div data-github-activity class="activity-list">{rows}</div><p class="activity-note" data-github-status>{d['updated']} <time>{esc(json.loads((ROOT/'assets/data/github.json').read_text())['fetched_at'][:10])}</time></p></section>
<section class="section"><div class="section-heading reveal"><h2 class="type-title">{d['writing']}</h2><a class="inline-link" href="{articlep}/archive.html">{d['allArticles']} {icon('arrow-right')}</a></div><div class="writing-list">'''+''.join(f'<a class="writing-row reveal" href="{articlep}/archive/{slug}.html"><time datetime="2026-05-06">2026.05.06</time><h3>{d[key]}</h3>{arrow()}</a>' for slug,key in [('cliproxy-design','article1'),('nas-stack','article2')])+f'''</div></section><section class="section connect-section"><div class="section-heading reveal"><h2 class="type-title">{d['links']}</h2><a class="inline-link" href="mailto:0xeazylee@gmail.com">{icon('mail')}Email</a></div><div class="social-grid">{social}</div><a class="music-link" href="https://music.apple.com/cn/playlist/mega-hits/pl.u-r2yBDVqsR4dG59P">{icon('applemusic')}Apple Music {arrow()}</a></section><footer class="site-footer"><a href="{p}/">eazylee</a><span>© {datetime.date.today().year}</span></footer></div></main>'''
    end=body.index('</section>\n<div class="site-shell">')+len('</section>')
    body=body[:end]+'<div class="site-shell">'+body[body.index('<section class="section connect-section">'):]
    body=body.replace(f'href="{p}/journal/">'+icon('book')+d['journal'],f'href="{p}/works/">'+icon('book')+d['works'])
    save(f'{p.lstrip("/")+"/" if p else ""}index.html',page(locale,body))
def build_journal(locale,entries):
    d=LOCALES[locale];base=d['prefix'].lstrip('/');base=(base+'/' if base else '')+'journal/'
    body=f'<main id="main-content" class="journal-shell"><div class="journal-paper"><div class="journal-masthead"><span class="paper-index">EAZYLEE / {datetime.date.today().year}</span><span class="paper-index">{len(entries):03} / JOURNAL</span></div><div class="journal-cover"><h1>{d["journal"]}</h1><p>{d["journalNote"]}</p></div><div class="journal-list">{journal_rows(locale,entries)}</div><footer class="journal-foot"><a href="{d["prefix"]}/">{d["back"]} {icon("arrow-right")}</a><span>EAZYLEE</span></footer></div></main>'
    save(base+'index.html',page(locale,body,'journal/',True,'Journal · EazyLee'))
    for slug,translations in entries.items():
        entry=translations.get(locale) or translations.get('en') or next(iter(translations.values()))
        original=next(k for k,v in translations.items() if v is entry)
        note='' if original==locale else f'<p class="translation-note">{d["noTranslation"]} {LOCALES[original]["label"]}.</p>'
        body=f'<main id="main-content" class="journal-shell"><article class="journal-paper journal-article"><div class="paper-index">EAZYLEE / JOURNAL <time datetime="{entry["date"]}">{entry["date"].replace("-",".")}</time></div><h1>{esc(entry["title"])}</h1>{note}<div class="journal-prose" lang="{original}">{entry["html"]}</div><footer class="journal-foot"><a href="{d["prefix"]}/journal/">{d["backJournal"]} {icon("arrow-right")}</a><span>EAZYLEE</span></footer></article></main>'
        save(base+slug+'/index.html',page(locale,body,'journal/'+slug+'/',True,entry['title']+' · EazyLee'))
    # Only generated articles are removed when a source entry is deleted/drafted.
    manifest=ROOT/(base+'.generated.json'); previous=json.loads(manifest.read_text()) if manifest.exists() else []
    for slug in set(previous)-set(entries):
        target=ROOT/(base+slug+'/index.html')
        if target.exists(): target.unlink()
    save(base+'.generated.json',json.dumps(sorted(entries)))
def build_traditional_pages():
    converter=OpenCC('s2twp')
    routes=['archive.html','archive/cliproxy-design.html','archive/nas-stack.html','wechat/official/index.html','wechat/channels/index.html']
    for route in routes:
        source=(ROOT/('cn/'+route)).read_text()
        protected=0; parts=[]
        for token in re.split(r'(<[^>]+>)',source):
            if token.startswith('<'):
                tag=re.match(r'</?([a-zA-Z0-9]+)',token)
                name=tag[1].lower() if tag else ''
                if name in ('script','style','pre','code'):
                    protected+= -1 if token.startswith('</') else 1
                token=token.replace('lang="zh-CN"','lang="zh-TW"').replace('href="/cn/','href="/tw/').replace('href="/reberry/zh-CN/','href="/reberry/zh-TW/')
                for attribute in ('alt','title','aria-label'):
                    token=re.sub(r'('+attribute+r'=")([^"]*)(")',lambda m:m[1]+converter.convert(m[2])+m[3],token)
                parts.append(token)
            else: parts.append(token if protected else converter.convert(token))
        save('tw/'+route,''.join(parts))


def contribution_data(source):
    from html.parser import HTMLParser
    class Calendar(HTMLParser):
        def __init__(self):super().__init__();self.days={};self.tip=None
        def handle_starttag(self,tag,attrs):
            a=dict(attrs)
            if tag=='td' and a.get('data-date'):self.days[a['id']]={'date':a['data-date'],'level':int(a.get('data-level',0)),'count':0}
            if tag=='tool-tip':self.tip=a.get('for')
        def handle_data(self,data):
            if self.tip in self.days:
                m=re.search(r'(\d+) contribution',data)
                if m:self.days[self.tip]['count']=int(m[1])
        def handle_endtag(self,tag):
            if tag=='tool-tip':self.tip=None
    parser=Calendar();parser.feed(source)
    return {'fetched_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'days':sorted(parser.days.values(),key=lambda d:d['date'])}

def refresh_contributions():
    target=ROOT/'assets/data/contributions.json'
    try:
        request=urllib.request.Request(f'https://github.com/users/{OWNER}/contributions',headers={'User-Agent':'eazylee-portfolio'})
        data=contribution_data(urllib.request.urlopen(request,timeout=15).read().decode())
        if len(data['days'])<300:raise ValueError('Incomplete calendar')
        target.write_text(json.dumps(data,indent=2)+'\n')
    except Exception as error:
        if not target.exists():raise
        print(f'Using saved GitHub calendar ({type(error).__name__}).')

def heatmap(locale):
    d=LOCALES[locale];data=json.loads((ROOT/'assets/data/contributions.json').read_text());days=data['days'];start=datetime.date.fromisoformat(days[0]['date']);start-=datetime.timedelta(days=(start.weekday()+1)%7);rects=[]
    for day in days:
        date=datetime.date.fromisoformat(day['date']);delta=(date-start).days;label=f'{day["date"]}: {day["count"]} contributions'
        rects.append(f'<rect x="{delta//7*14+1}" y="{delta%7*14+1}" width="10" height="10" rx="1" class="heat-{day["level"]}"><title>{label}</title></rect>')
    width=((datetime.date.fromisoformat(days[-1]['date'])-start).days//7+1)*14
    return f'<section class="contribution-section"><div class="section-heading"><h2>{d["heatmap"]}</h2><a class="inline-link" href="https://github.com/{OWNER}">{icon("github")}GitHub {arrow()}</a></div><div class="contribution-scroll"><svg viewBox="0 0 {width} 100" role="img" aria-label="{esc(d["heatmap"])}">'+''.join(rects)+f'</svg></div><div class="contribution-caption"><time>{days[0]["date"]} — {days[-1]["date"]}</time><span>{sum(day["count"] for day in days)} contributions</span></div></section>'

PROJECTS=json.loads((ROOT/'content/projects.json').read_text())

def column_masthead(locale,key):
    svg=(ROOT/'assets/art/eazylee-wordmark.svg').read_text()
    return f'<div class="column-masthead"><a class="column-wordmark" href="{LOCALES[locale]["prefix"]}/" aria-label="EazyLee">{svg}</a><span class="column-label">{esc(LOCALES[locale][key])}</span></div>'

def project_media(project):
    title=esc(project['title']);name=project['name'];cover=project.get('cover','banner');media=project['media'];url=f'https://github.com/{OWNER}/{name}'
    if cover=='diagram':
        visual=(ROOT/f'assets/projects/{media}').read_text()
    elif cover=='logo':
        visual=f'<img src="/assets/projects/{media}" alt="" loading="lazy" decoding="async"><span class="repo-cover-title">{title}</span><span class="repo-cover-caption">{esc(project["strap"])}</span>'
    else:
        visual=f'<img src="/assets/projects/{media}" alt="{title}" loading="lazy" decoding="async">'
    return f'<a class="work-media work-media-{cover}" href="{url}" aria-label="{title} — GitHub">{visual}</a>'


def _wnum(value):
    if isinstance(value,float):
        text=('%.1f'%value).rstrip('0').rstrip('.')
        return text or '0'
    return str(value)

def sheet(w):
    groups=[]
    for ex in w.get('exercises',[]):
        for record in ex.get('sets',[]):
            key=(ex.get('name',''),record.get('weight',0),record.get('units','kg'),record.get('reps','—'))
            if groups and groups[-1][0]==key: groups[-1][1]+=1
            else: groups.append([key,1])
    sheets=[]
    # The source photograph is displayed byte-for-byte unchanged. New data is
    # positioned in its blank cells; additional records continue on another sheet.
    positions=[30.80,37.05,43.30,49.55,55.80,62.00,68.00,73.85,79.60,86.05]
    for offset in range(0,max(1,len(groups)),10):
        rows=[]
        for i,((name,weight,unit,reps),count) in enumerate(groups[offset:offset+10]):
            pounds=weight*2.2046226218 if unit.lower()=='kg' else weight
            load='B.W.' if not weight else f'{pounds:.1f}'.rstrip('0').rstrip('.')
            rows.append(f'<div class="sheet-entry" style="top:{positions[i]}%"><span>{esc(name)}</span><span>{count}</span><span>{esc(load)}</span><span>{esc(str(reps))}</span><span>{esc(name)}</span></div>')
        date=datetime.date.fromisoformat(w['date']).strftime('%b %d, %Y').upper()
        sheets.append(f'''<figure class="training-sheet" aria-label="EazyLee · {esc(w['date'])} · Exercise list"><img class="sheet-original" src="/assets/art/workout/exercise-list-original.png" width="1086" height="1448" alt="克強健力學院 Exercise List. Original training sheet, handwritten EAZY LEE, sex M."><time class="sheet-date hand" datetime="{esc(w['date'])}">{date}</time><div class="sheet-entries hand">{''.join(rows)}</div></figure>''')
    return '<div class="training-sheets">'+''.join(sheets)+'</div>'


def workout_source(w, paper=True):
    units='<small>WEIGHT IN LBS · B.W. = BODYWEIGHT</small>' if paper else ''
    return f'<div class="workout-paper-source"><div><span>{esc(str(w.get("duration_min","—")))} MIN</span><span>{esc(str(w.get("strain","—")))} STRAIN</span><span>{esc(str(w.get("total_volume_kg","—")))} KG VOLUME</span>{units}</div><div class="whoop-credit"><small>DATA FROM</small><img src="/assets/brand/whoop/wordmark-black.svg" width="90" height="24" alt="WHOOP"></div></div>'


def labels(locale):
    return {'en':('Training log','Handwritten','Movement','Swipe to change view','Share session','Copy link','Print / Save PDF','Link copied','Sharing unavailable. Copy the link instead.','Back to workout','Training on','Save image'), 'zh-CN':('训练记录','手写训练单','动作演示','左右滑动，切换视图','分享本次训练','复制链接','打印 / 存为 PDF','链接已复制','暂时无法分享，请复制链接。','返回训练','训练日期','保存图片'), 'zh-TW':('訓練記錄','手寫訓練單','動作示範','左右滑動，切換視圖','分享本次訓練','複製連結','列印 / 存為 PDF','連結已複製','暫時無法分享，請複製連結。','返回訓練','訓練日期','儲存圖片')}[locale]


def workout_detail(locale):
    d=LOCALES[locale]
    src=ROOT/'assets/data/workout-detail.json'
    if not src.exists(): return ''
    try: w=json.loads(src.read_text())
    except Exception: return ''
    kicker=f'<div class="wdetail-kicker">{esc(d["workoutDetailKicker"])}</div>'
    cmd=f'<div class="wdetail-term"><span class="wprompt">$</span> {esc(d["workoutDetailCmd"])}</div>'
    if not w.get('exercises'):
        body=f'<p class="wdetail-empty">{esc(d["workoutEmpty"])}</p>'
    else:
        meta=f'<div class="wdetail-meta"><span>{esc(str(w.get("date","")).replace("-","."))}</span><span>{esc(_wnum(w.get("duration_min","—")))} {esc(d["workoutMin"])} · strain {esc(_wnum(w.get("strain","—")))}</span><span>{esc(_wnum(w.get("total_volume_kg","—")))} kg {esc(d["workoutVolume"])} · {esc(_wnum(w.get("set_count","—")))} {esc(d["workoutSets"])} · {esc(_wnum(w.get("exercise_count","—")))} {esc(d["workoutExercises"])}</span></div>'
        cards=[]
        for ex in w['exercises']:
            slug=ex.get('art')
            if slug:
                fig=f'<div class="wfig" data-art="{esc(slug)}" role="img" aria-label="{esc(ex.get("name",""))}"><span class="wfig-loading" aria-hidden="true">…</span></div>'
            else:
                fig='<div class="wfig wfig-none" aria-hidden="true"><span>./</span></div>'
            rows=[]
            for i,s in enumerate(ex.get('sets') or [],1):
                wt=s.get('weight',0)
                wlabel=esc(d['workoutBodyweight']) if not wt else esc(_wnum(wt)+' kg')
                rows.append(f'<div class="wset"><span class="wset-n">SET {i:02d}</span><span class="wset-r">{esc(_wnum(s.get("reps","—")))} {esc(d["workoutReps"])}</span><span class="wset-w">{wlabel}</span></div>')
            muscles=' '.join(ex.get('muscles') or [])
            tag=f'<span class="wtag">{esc(muscles)}</span>' if muscles else ''
            cards.append(f'<article class="wcard"><div class="wcard-head"><h3>{esc(ex.get("name",""))}</h3>{tag}</div>{fig}<div class="wsets">{"".join(rows)}</div></article>')
        body=meta+'<div class="wgrid">' + ''.join(cards) + '</div>'
    credit='<p class="wcredit"><a href="https://github.com/bryllim/workout-guide">Workout Guide</a> · Bryl Lim / Everkinetic · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></p>'
    if not w.get('exercises'): return f'<section class="wdetail">{kicker}{body}</section>'
    l=labels(locale)
    route=f'workout/share/{w["date"]}/'
    share_url=f'{d["prefix"]}/{route}'
    for view,view_label in [('sheet',l[1]),('movement',l[2])]:
        view_route=route+('movement/' if view=='movement' else '')
        content=sheet(w)+workout_source(w) if view=='sheet' else f'<div class="movement-share-content">{body}{workout_source(w, False)}</div>'
        other_url=f'{share_url}movement/' if view=='sheet' else share_url
        other_label=l[2] if view=='sheet' else l[1]
        share_body=f'<main id="main-content" class="site-shell workout-share" data-session-date="{w['date']}" data-share-view="{view}"><div class="share-toolbar"><a class="inline-link" href="{d["prefix"]}/workout/">← {l[9]}</a><div><button type="button" data-share-link>{l[5]}</button><button type="button" data-share-native>{l[4]}</button><button type="button" data-share-print>{l[6]}</button><button type="button" data-share-image>{l[11]}</button></div></div><div class="share-view-label"><strong>{view_label}</strong><a class="inline-link" href="{other_url}">{other_label} ↔</a></div><p class="share-date">{l[10]} · <time datetime="{esc(w["date"])}">{esc(w["date"])}</time></p><div data-share-content>{content}</div><p class="share-feedback" role="status" data-share-feedback></p>{credit}<script type="application/json" id="share-copy">{json.dumps(l,ensure_ascii=False)}</script><script defer src="/assets/js/workout-live.js?v=20261016c"></script><script defer src="/assets/js/workout-art.js?v=20261016b"></script><script defer src="/assets/js/workout-views.js?v=20261016b"></script><link rel="stylesheet" href="/assets/css/workout-sheet.css?v=20261016b"></main>'
        save(d['prefix'].lstrip('/')+('/' if d['prefix'] else '')+view_route+'index.html',page(locale,share_body,view_route,title=f'{w["date"]} · {view_label} · EazyLee'))
    generic=share_body.replace('data-share-view="movement"', 'data-live-share data-share-view="movement" data-loading="true"')
    save(d['prefix'].lstrip('/')+('/' if d['prefix'] else '')+'workout/share/index.html',page(locale,generic,'workout/share/',title=f'Workout · EazyLee'))
    return f'''<section class="wdetail" data-session-date="{w['date']}" data-workout-views aria-label="{esc(l[0])}"><div class="workout-view-heading"><div>{kicker}<h2>{l[0]}</h2></div><a class="workout-share-link" data-view-share data-sheet-url="{share_url}" data-movement-url="{share_url}movement/" href="{share_url}movement/">{l[4]} {arrow()}</a></div><div class="workout-view-controls"><div class="workout-tabs" role="tablist" aria-label="{l[0]}"><button type="button" id="motion-tab" role="tab" aria-selected="true" aria-controls="motion-view" tabindex="0">{l[2]}</button><button type="button" id="sheet-tab" role="tab" aria-selected="false" aria-controls="sheet-view" tabindex="-1">{l[1]}</button></div></div><div class="workout-view-track" tabindex="0" aria-label="{l[3]}"><div class="workout-view-panel" id="motion-view" role="tabpanel" aria-labelledby="motion-tab">{body}{workout_source(w, False)}</div><div class="workout-view-panel" id="sheet-view" role="tabpanel" aria-labelledby="sheet-tab" inert>{sheet(w)}{workout_source(w)}</div></div><div class="workout-view-progress" aria-hidden="true"><span></span></div><p class="workout-data-note">WHOOP · {esc(w['date'])} · {esc(w.get('fetched_at','')[:16].replace('T',' '))} UTC</p></section>{credit}<script defer src="/assets/js/workout-live.js?v=20261016c"></script><script defer src="/assets/js/workout-art.js?v=20261016b"></script><script defer src="/assets/js/workout-views.js?v=20261016b"></script><link rel="stylesheet" href="/assets/css/workout-sheet.css?v=20261016b">'''

def accountability(locale):
    d=LOCALES[locale]
    en=locale=='en';tw=locale=='zh-TW'
    title='A little push. A little stronger.' if en else ('催一下，薄肌加一點。' if tw else '催一下，薄肌加一点。')
    week='THE LAST 7 DAYS' if en else '最近 7 天'
    note='One browser, one nudge per day. No message is sent.' if en else ('同一瀏覽器每天一次，這裡只記錄你的支持。' if tw else '同一浏览器每天一次，这里只记录你的支持。')
    return f'''<section class="workout-today nudge-club" data-workout data-state="loading" aria-labelledby="workout-question"><div class="nudge-main"><div class="nudge-meta"><span>THE TRAINING CLUB</span><time data-workout-date>—</time><span class="sr-only">Asia/Shanghai</span></div><h2 id="workout-question">{title}</h2><div class="nudge-stage" aria-hidden="true"><div class="wfig nudge-curl" data-art="bicep-curl" role="img" aria-label="Bicep curl · Workout Guide"><span class="wfig-loading" aria-hidden="true">…</span></div><div class="nudge-score"><span class="nudge-today-number" data-nudge-number>—</span><span>{'nudging today' if en else ('今天一起催' if tw else '今天一起催')}</span></div><div class="nudge-particles"></div></div><p class="workout-state" data-workout-state role="status">{d['workoutLoading']}</p><p class="workout-complete" data-workout-complete hidden>{d['workoutDone']}</p><div class="nudge-actions"><button class="workout-nudge" type="button" data-workout-nudge hidden>{d['workoutNudge']}</button></div><div class="workout-support sr-only"><strong data-workout-count>—</strong><span data-workout-rule hidden>{d['workoutRule']}</span></div><p class="workout-feedback" data-workout-feedback aria-live="polite"></p><div class="workout-freshness"><span data-workout-checked></span><button class="inline-link" type="button" data-workout-retry hidden>{d['workoutRetry']}</button></div></div><div class="nudge-history"><div class="nudge-history-head"><h3>{week}</h3><span data-nudge-week-total>—</span></div><div class="nudge-chart" data-nudge-chart aria-label="{'Daily nudges and workout records' if en else '每日催练与训练记录'}"><p>{d['workoutLoading']}</p></div><p class="nudge-day-detail" data-nudge-day-detail role="status"></p><div class="nudge-legend"><span><i></i>{'Workout recorded' if en else '已训练'}</span><span><i class="pending"></i>{'No workout yet' if en else '暂无训练'}</span><span>· {'Unknown' if en else '未知'} ?</span></div><div class="nudge-insight" data-nudge-insight></div><p class="nudge-data-note">{'Anonymous browser counts · Same-day association, not causation.' if en else ('按匿名瀏覽器去重 · 同日對照，不代表因果。' if tw else '按匿名浏览器去重 · 同日对照，不代表因果。')}</p></div></section>'''

def build_columns(locale,repos):
    d=LOCALES[locale];prefix=d['prefix'];known={r['name']:r for r in repos};cards=[]
    ordered=sorted((p for p in PROJECTS if p['name'] in known and not known[p['name']].get('fork') and not known[p['name']].get('archived')),key=lambda p:known[p['name']].get('pushed_at') or '',reverse=True)
    for project in ordered:
        name=project['name'];title=project['title'];visit=project.get('visit');repo=known[name];date=(repo.get('pushed_at') or '')[:10]
        label='GitHub' if project.get('closed') else d['source']
        links=(f'<a class="inline-link" href="{esc(visit)}">{d["visit"]} {arrow()}</a>' if visit else '')+f'<a class="inline-link" href="https://github.com/{OWNER}/{name}">{icon("github")}{label} {arrow()}</a>'
        if project.get('demo'):links+=f'<a class="inline-link" href="{esc(project["demo"])}">'+{'en':'Demo','zh-CN':'演示','zh-TW':'示範'}[locale]+f' {arrow()}</a>'
        cards.append(f'<article class="work-card reveal" data-project-name="{name}">{project_media(project)}<div class="work-card-copy"><div class="project-meta"><span data-project-language>{esc(repo.get("language") or ("Releases" if project.get("closed") else "Agent skill"))}</span><time datetime="{date}">{date}</time></div><h2>{esc(title)}</h2><p>{esc(project["description"][locale])}</p><div class="project-links">{links}</div></div></article>')
    foot=f'<footer class="site-footer"><a href="{prefix}/">eazylee</a><span>© {datetime.date.today().year}</span></footer>'
    fetched=json.loads((ROOT/'assets/data/github.json').read_text())['fetched_at'][:10]
    toolbar=f'<div class="works-toolbar"><span data-github-status>{d["updated"]} {fetched}</span><a class="inline-link" href="https://github.com/{OWNER}?tab=repositories">{d["more"]} {arrow()}</a></div>'
    body=f'<main id="main-content" class="site-shell column-page works-page">{column_masthead(locale,"works")}<div class="column-heading"><h1>{d["works"]}</h1><p>{d["worksNote"]}</p></div>{heatmap(locale)}{toolbar}<div class="works-grid">'+''.join(cards)+f'</div>{foot}</main>'
    save(prefix.lstrip('/')+('/' if prefix else '')+'works/index.html',page(locale,body,'works/',title='Works · EazyLee'))
    rows=''.join(f'<a class="writing-row reveal" href="{prefix}/archive/{slug}.html"><time datetime="2026-05-06">2026.05.06</time><h2>{d[key]}</h2>{arrow()}</a>' for slug,key in [('cliproxy-design','article1'),('nas-stack','article2')])
    reberry_route={'en':'/reberry/','zh-CN':'/reberry/zh-CN/','zh-TW':'/reberry/zh-TW/'}[locale]
    reberry_title={'en':'reberry — The keyboard remembers','zh-CN':'reberry — 键盘还记得','zh-TW':'reberry — 鍵盤還記得'}[locale]
    rows=f'<a class="writing-row reveal" href="{reberry_route}"><time datetime="2026-10-11">2026.10.11</time><h2>{reberry_title}</h2>{arrow()}</a>'+rows
    mosaico_title={'en':'Mosaico field notes','zh-CN':'Mosaico 手记','zh-TW':'Mosaico 手記'}[locale]
    rows=f'<a class="writing-row reveal" href="/mosaico/"><time datetime="2026-10-23">2026.10.23</time><h2>{mosaico_title}</h2>{arrow()}</a>'+rows
    body=f'<main id="main-content" class="site-shell column-page writing-page">{column_masthead(locale,"writing")}<div class="column-heading"><h1>{d["writing"]}</h1></div><div class="writing-list">{rows}</div>{foot}</main>'
    save(prefix.lstrip('/')+('/' if prefix else '')+'writing/index.html',page(locale,body,'writing/',title='Writing · EazyLee'))
    workout_today={'en':'TODAY','zh-CN':'今天','zh-TW':'今天'}[locale]
    workout_copy={key.removeprefix('workout'):value for key,value in d.items() if key.startswith('workout')}
    copy_json=json.dumps(workout_copy,ensure_ascii=False).replace('<','\\u003c')
    body=f'<main id="main-content" class="site-shell column-page workout-page">{column_masthead(locale,"workout")}<div class="column-heading"><h1>{d["workout"]}</h1><p>{d["workoutNote"]}</p></div>{accountability(locale)}{workout_detail(locale)}<script type="application/json" id="workout-copy">{copy_json}</script><script defer src="/assets/js/workout.js?v=20261016c"></script>{foot}</main>'
    save(prefix.lstrip('/')+('/' if prefix else '')+'workout/index.html',page(locale,body,'workout/',title='Workout · EazyLee'))

def retire_journal_pages():
    # A generation manifest identifies only the pages created by this builder.
    for locale in LOCALES:
        base=ROOT/(LOCALES[locale]['prefix'].lstrip('/') or '.')/'journal'
        manifest=base/'.generated.json'
        if not manifest.exists():continue
        for slug in json.loads(manifest.read_text()):
            article=base/slug/'index.html'
            if article.exists():article.unlink()
            if article.parent.exists() and not any(article.parent.iterdir()):article.parent.rmdir()
        index=base/'index.html'
        if index.exists():index.unlink()
        manifest.unlink()
        if not any(base.iterdir()):base.rmdir()

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--refresh-github',action='store_true');args=parser.parse_args()
    if args.refresh_github: refresh_github();refresh_contributions()
    build_traditional_pages()
    repos=json.loads((ROOT/'assets/data/github.json').read_text())['repositories'];entries={}
    retire_journal_pages()
    for locale in LOCALES: home(locale,entries,repos);build_columns(locale,repos)
    from build_mosaico import build as build_mosaico
    mosaico_count=build_mosaico(ROOT)
    print(f'Built Mosaico section with {mosaico_count} articles.')
    print(f'Built 3 homepages and 9 column pages; {len(PROJECTS)} project covers. Journal sources are retained.')
if __name__=='__main__': main()
