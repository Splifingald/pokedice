# The prototype's page: the built index.html's script and stylesheet inlined, without the document's own skeleton
# (the Artifact wraps the page in one). Usage: python3 scripts/proto-inline.py dist-proto out.html
import re, sys, os
dist, out = sys.argv[1], sys.argv[2]
html = open(os.path.join(dist, 'index.html'), encoding='utf-8').read()
js_src = re.search(r'<script type="module" crossorigin src="\./([^"]+)"></script>', html).group(1)
css_href = re.search(r'<link rel="stylesheet" crossorigin href="\./([^"]+)">', html).group(1)
js = open(os.path.join(dist, js_src), encoding='utf-8').read().replace('</script', '<\\/script')
css = open(os.path.join(dist, css_href), encoding='utf-8').read()
theme = re.search(r'<script>\s*//[\s\S]*?</script>', html).group(0)
page = f'''<title>Pokédice Rework</title>
<meta name="claude:viewport-fit-sides" content="cover">
{theme}
<style>{css}</style>
<div id="root"></div>
<script type="module">{js}</script>
'''
open(out, 'w', encoding='utf-8').write(page)
print(out, len(page))
