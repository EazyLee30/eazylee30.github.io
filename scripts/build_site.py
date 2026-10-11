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
def icon(name): return f'<svg class="icon" aria-hidden="true"><use href="/assets/icons.svg#{name}"/></svg>'
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
def wordmark():
    svg=(ROOT/'assets/art/eazylee-wordmark.svg').read_text()
    bitmap=(ROOT/'assets/data/wordmark.json').read_text()
    return '<h1 class="wordmark" id="name"><button class="wordmark-target" type="button" aria-label="EAZYLEE — Change theme"><span class="sr-only">EAZYLEE</span>'+svg+'</button></h1><script id="wordmark-data" type="application/json">'+bitmap+'</script>'
def header(locale, route=''):
    d=LOCALES[locale]
    links=''.join(f'<a href="{v["prefix"]}/{route}" lang="{k}" hreflang="{k}"'+(' aria-current="page"' if k==locale else '')+'>'+label+'</a>' for k,v,label in [(k,v,{'en':'EN','zh-CN':'简','zh-TW':'繁'}[k]) for k,v in LOCALES.items()])
    globe='<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z"/></svg>'
    navigation=''.join(f'<a href="{d["prefix"]}/{name}/"'+(' aria-current="page"' if route.startswith(name+'/') else '')+f'>{d[name]}</a>' for name in ('works','writing','workout'))
    menu_label, close_label, theme_label = {'en': ('Menu', 'Close menu', 'Change theme'), 'zh-CN': ('菜单', '关闭菜单', '切换主题'), 'zh-TW': ('選單', '關閉選單', '切換主題')}[locale]
    toggle = f'<button class="mobile-nav-toggle" type="button" aria-expanded="false" aria-controls="mobile-drawer" aria-label="{menu_label}"><span class="mnav-bars" aria-hidden="true"><span></span><span></span><span></span></span></button>'
    drawer = f'<div class="nav-scrim" data-nav-close></div><aside class="mobile-drawer" id="mobile-drawer" aria-label="{menu_label}"><div class="drawer-head"><a class="drawer-brand" href="{d["prefix"]}/"><img src="/assets/avatar-head.png" width="30" height="30" alt="EazyLee">eazylee</a><button class="drawer-close" type="button" data-nav-close aria-label="{close_label}"><span aria-hidden="true">×</span></button></div><nav class="drawer-nav" aria-label="{menu_label}">{navigation}</nav><div class="drawer-tools"><button class="drawer-row" type="button" data-open-theme>{icon("palette")}<span>{theme_label}</span><kbd>T</kbd></button><div class="drawer-row drawer-lang"><span>{d["lang"]}</span><nav aria-label="{d["lang"]}">{links}</nav></div><a class="drawer-row" href="https://github.com/{OWNER}">{icon("github")}<span>GitHub</span></a></div></aside>'
    return f'<header class="site-header"><div class="header-inner"><a class="brand-name" href="{d["prefix"]}/" aria-label="EazyLee {esc(d["back"])}"><img class="brand-avatar" src="/assets/avatar-head.png" width="44" height="44" alt="EazyLee"></a><nav class="page-nav" aria-label="{menu_label}">{navigation}</nav><div class="header-actions"><div data-theme-control></div><details class="language-control"><summary aria-label="Language">{globe}</summary><nav class="language-options" aria-label="Language">{links}</nav></details><a class="header-github" href="https://github.com/{OWNER}" aria-label="GitHub">{icon("github")}</a>{toggle}</div></div></header>' + drawer

def page(locale,body,route='',journal=False,title='EazyLee'):
    d=LOCALES[locale];head_filter='<svg width="0" height="0" class="avatar-filters" aria-hidden="true"><defs><filter id="header-avatar-ink" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha" result="shade"/><feComponentTransfer in="shade" result="line"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feComposite in="line" in2="SourceAlpha" operator="in" result="glyph"/><feFlood class="portrait-tint" result="ink"/><feComposite in="ink" in2="glyph" operator="in"/></filter></defs></svg>';alts=''.join(f'<link rel="alternate" hreflang="{k}" href="https://eazylee.xyz{v["prefix"]}/{route}">' for k,v in LOCALES.items())
    return f'''<!DOCTYPE html>
<html lang="{locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{esc(title)}</title><meta name="description" content="{esc(d['subtitle'])}"><link rel="canonical" href="https://eazylee.xyz{d['prefix']}/{route}">{alts}<link rel="alternate" hreflang="x-default" href="https://eazylee.xyz/{route}"><script src="/assets/js/theme.js?v=20261012a"></script><script defer src="/assets/js/portfolio.js?v=20261012a"></script><script defer src="/assets/js/hero-field.js?v=20261012a"></script><script defer src="/assets/js/mobile-nav.js?v=20261012a"></script><script type="module" src="/assets/js/avatar-turn.js?v=20261012a"></script><link rel="stylesheet" href="/assets/css/main.css?v=20261012a"><link rel="stylesheet" href="/assets/css/portfolio.css?v=20261012a"></head>
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
        r=known.get(name,{});url=r.get('html_url',git+'/'+name); visit=('https://whooper.ccwu.cc' if name=='whooper-2.0' else r.get('homepage'))
        links=(f'<a class="inline-link" href="{esc(visit)}">{d["visit"]} {arrow()}</a>' if visit else '')+f'<a class="inline-link" href="{esc(url)}">{icon("github")}{d["source"]} {arrow()}</a>'
        display={'reberry':'reberry','muse-charm':'Muse Charm','whooper-2.0':'Whooper'}[name]
        cards.append(f'<article class="work-card reveal">{art}<div class="work-card-copy"><h3>{display}</h3><p>{desc}</p><div class="project-links">{links}</div></div></article>')
    others=''.join(f'<a class="other-work" href="{esc(url)}"><span><strong>{name}</strong><small>{desc}</small></span>{arrow()}</a>' for name,desc,url in [('xfxmd',d['xfxmd'],'https://md.shxfx.top/'),('Image prompt gallery',d['gallery'],'https://eazylee.xyz/gpt-image2-gallery/'),(d['stock'],d['stockDesc'],'/stock/cn/')])
    recent=sorted([r for r in repos if not r['fork'] and not r['archived'] and r['name'] not in [OWNER,'eazylee30.github.io','whooper-privacy']],key=lambda r:r['pushed_at'] or '',reverse=True)[:4]
    rows=''.join(f'<a class="activity-row" href="{esc(r["html_url"])}"><span>{icon("github")}<span><strong>{esc(r["name"])}</strong><small>{esc(r.get("description") or "")}</small></span></span><time datetime="{esc(r["pushed_at"])}">{r["pushed_at"][:10].replace("-",".")}</time>{arrow()}</a>' for r in recent)
    xhs={'en':'Xiaohongshu','zh-CN':'小红书','zh-TW':'小紅書'}[locale]
    social=''.join(f'<a href="{url}"><span class="social-label">{icon(mark)}{label}</span>{arrow()}</a>' for mark,label,url in [('x','X / Twitter','https://x.com/0xEzLee'),('instagram','Instagram','https://www.instagram.com/0xeazylee/'),('github','GitHub',git),('linkedin','LinkedIn','https://www.linkedin.com/in/eazylee/'),('xiaohongshu',xhs,'https://xhslink.cn/o/3dyQZAFo5xL'),('wechat',d['wechat'],p+'/wechat/official/'),('channels',d['channels'],p+'/wechat/channels/')])
    articlep=p
    body=f'''<div id="loading-screen" class="loading-screen" hidden aria-hidden="true"><div class="terminal"><div class="terminal-title">eazylee</div><div class="terminal-output"></div><div class="progress-bar"><div class="progress-bar-fill"></div></div><div class="progress-text">0%</div></div></div>
<svg width="0" height="0" aria-hidden="true" class="avatar-filters"><defs><filter id="avatar-ink-light" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha" result="shade"/><feComponentTransfer in="shade" result="inverse"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feComposite in="inverse" in2="SourceAlpha" operator="in" result="contours"/><feFlood class="portrait-tint" result="ink"/><feComposite in="ink" in2="contours" operator="in"/></filter><filter id="avatar-ink-dark" color-interpolation-filters="sRGB"><feColorMatrix type="luminanceToAlpha" result="shade"/><feComposite in="shade" in2="SourceAlpha" operator="in" result="highlights"/><feFlood class="portrait-tint" result="ink"/><feComposite in="ink" in2="highlights" operator="in"/></filter></defs></svg>
<main id="main-content"><section class="hero"><div class="site-shell hero-inner">{wordmark()}<div class="hero-intro"><h2>{d['title']}</h2><p>{d['subtitle']}</p><div class="hero-actions"><a class="button button-primary" href="{p}/journal/">{icon('book')}{d['journal']}</a><a class="button" href="{git}">{icon('github')}GitHub</a></div></div></div></section>
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
    body=f'<main id="main-content" class="site-shell column-page writing-page">{column_masthead(locale,"writing")}<div class="column-heading"><h1>{d["writing"]}</h1></div><div class="writing-list">{rows}</div>{foot}</main>'
    save(prefix.lstrip('/')+('/' if prefix else '')+'writing/index.html',page(locale,body,'writing/',title='Writing · EazyLee'))
    body=f'<main id="main-content" class="site-shell column-page workout-page">{column_masthead(locale,"workout")}<div class="column-heading"><h1>{d["workout"]}</h1><p>{d["workoutNote"]}</p></div><div class="workout-empty"><svg class="workout-orbit" viewBox="0 0 200 200" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="100" cy="100" r="79" stroke-width="1" stroke-dasharray="2 8"/><circle cx="100" cy="100" r="61" stroke-width="8" opacity=".13"/><path d="M100 39a61 61 0 0 1 53 31" stroke-width="8"/></svg><h2>{d["workoutEmpty"]}</h2><p>{d["workoutNext"]}</p><a class="inline-link" href="https://github.com/{OWNER}/whooper-2.0">Whooper {arrow()}</a></div>{foot}</main>'
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
    print(f'Built 3 homepages and 9 column pages; {len(PROJECTS)} project covers. Journal sources are retained.')
if __name__=='__main__': main()
