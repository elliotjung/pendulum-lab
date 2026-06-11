# One-shot codemod: move every inline style="..." attribute in app.html into
# generated utility classes (css/05-extracted-inline.css) so the CSP can drop
# 'unsafe-inline' for styles.
import re

path = 'app.html'
html = open(path, encoding='utf8').read()

styles = re.findall(r'style="([^"]*)"', html)
unique = []
for s in styles:
    if s not in unique:
        unique.append(s)

class_of = {s: f'xs-{i + 1}' for i, s in enumerate(unique)}

css_lines = [
    '/* Generated from former inline style="" attributes in app.html so the CSP',
    "   can drop 'unsafe-inline' for styles. Regenerate with",
    '   scripts/extract-inline-styles.py if markup styles change. */',
    ''
]
for s, cls in class_of.items():
    css_lines.append(f'.{cls}{{{s}}}')
open('css/05-extracted-inline.css', 'w', encoding='utf8', newline='\n').write('\n'.join(css_lines) + '\n')


def replace_tag(match: 're.Match[str]') -> str:
    tag = match.group(0)
    style_match = re.search(r'\s*style="([^"]*)"', tag)
    if not style_match:
        return tag
    cls = class_of[style_match.group(1)]
    tag = tag.replace(style_match.group(0), '')
    class_match = re.search(r'class="([^"]*)"', tag)
    if class_match:
        tag = tag.replace(f'class="{class_match.group(1)}"', f'class="{class_match.group(1)} {cls}"')
    else:
        # insert class right after the tag name
        tag = re.sub(r'^<(\w+)', rf'<\1 class="{cls}"', tag)
    return tag


html = re.sub(r'<[^>]*style="[^"]*"[^>]*>', replace_tag, html)

# Link the generated stylesheet after the base stylesheet.
html = html.replace(
    '<link rel="stylesheet" href="./css/00-base.css">',
    '<link rel="stylesheet" href="./css/00-base.css">\n<link rel="stylesheet" href="./css/05-extracted-inline.css">'
)

# Tighten the CSP: drop 'unsafe-inline' from style-src.
html = html.replace("style-src 'self' 'unsafe-inline'", "style-src 'self'")

open(path, 'w', encoding='utf8', newline='\n').write(html)
remaining = len(re.findall(r'style="', html))
print(f'extracted {len(unique)} unique styles, remaining style attrs: {remaining}')
