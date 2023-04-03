import collections
import json
import math
import sqlite3
import sys

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

regions_for_name = collections.defaultdict(list)

con = sqlite3.connect("deploy/data/database/database.db")
page_ids = [row[:2] for row in con.execute('select id, slug from proof_pages where project_id = 2')]
for page_id, slug in page_ids:
    eprint(f'Looking at page_id {page_id}, slug {slug}')
    slug = int(slug)
    params = (page_id,)
    content_rows = list(con.execute('select content from (select content, max(created) from proof_revisions where page_id = ?)', params))
    assert len(content_rows) == 1
    content = content_rows[0][0]
    if content is None: continue
    try:
        content = json.loads(content)
    except json.decoder.JSONDecodeError:
        continue
    assert content['type'] == 'doc'
    groups = content['content']
    for group in groups:
        if not('attrs' in group and 'groupName' in group['attrs']): continue
        name = group['attrs']['groupName']
        if group['type'] == 'lgHeader':
            if name is None or name == '': continue
            eprint('Header:', name)
        assert name is not None, group
        assert group['type'] in ('lgFootnote', 'lgVerse'), group['type']
        # Normalize name
        if name.startswith('V'): name = name[1:]
        i = min([i for i in range(len(name)) if not str.isdigit(name[i])] + [len(name)])
        assert name[i:] in ('', 'f'), (name, name[i:])
        new_name = f'{int(name[:i]):03}' + ('f' if group['type'] == 'lgFootnote' else '')
        eprint(f'Converted {name} to {new_name}')
        name = new_name

        xmin = math.inf
        xmax = -math.inf
        ymin = math.inf
        ymax = -math.inf
        text = []
        for line in group['content']:
            for actual_line in line['content']:
                text.append(actual_line['text'])
            box = line['attrs']['box']
            xmin = min(xmin, box['xmin'])
            xmax = max(xmax, box['xmax'])
            ymin = min(ymin, box['ymin'])
            ymax = max(ymax, box['ymax'])
        regions_for_name[name].append({'slug': slug, 'xmin': xmin, 'ymin': ymin, 'width': xmax - xmin, 'height': ymax - ymin, 'text': text})

# for name, regions in regions_for_name.items():
#     print(name, regions)

# TODO(shreevatsa): Remove this hard-coding. Get page dimensions from `content` (after saving it there).
totWidth = 3125.0
totHeight = 5209.0
header = '''
<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    div.outer-s {
      margin: 0.5rem;
      border-radius: 0.5rem;
      border-width: 2px;
      border-color: #3B82F6;
      border-style: solid;
      @media (min-width: 768px) {
        margin: 2.5rem;
       }
    }
    img.inner-img {
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
      width: 91.666667%;
      border-radius: 0.375rem;
      border-width: 2px;
      @media (min-width: 768px) {
        width: 75%;
      }
    }
  </style>
</head>
<h1>Bookchop</h1>
<p><i>(This is a test. Each verse and its footnotes should be read together, as one unit. Clicking on the image will take you to the corresponding page on the archive.org book. Can search for Devanagari—will expand the "not proofread" boxes—modulo OCR errors.)</i></p>
'''
print(header)

names = list(sorted(regions_for_name.keys()))
# expected = []
# for n in range(1, 353): expected.extend([f'{n:03}', f'{n:03}f'])
# try:
#     assert names == expected, (names, 'vs', expected)
# except AssertionError:
#     l = min(len(names), len(expected))
#     i = min([i for i in range(l) if names[i] != expected[i]] + [l])
#     assert False, (names[i:], '\nvs\n', expected[i:])

for name, regions in sorted(regions_for_name.items()):
    blocks = []
    for region in regions:
        n = region['slug'] - 1
        x = region['xmin'] / totWidth; x = int(x * 100) / 100
        y = region['ymin'] / totHeight; y = int(y * 1000) / 1000
        w = region['width'] / totWidth; w = (int(w * 100) + 2) / 100
        h = region['height'] / totHeight; h = (int(h * 1000) + 5) / 1000
        image_url = 'https://archive.org/download/dli.granth.78136/page/' + f'n{n}_x{x}_y{y}_w{w}_h{h}_s2.jpg'
        page_url = f'https://archive.org/details/dli.granth.78136/page/n{n}/mode/2up'
        text = region['text']
        blocks.append((image_url, page_url, text))
    # print(name, urls)
    
    # Generate HTML for this name
    s = f'<p>{name}</p>\n'
    t = ''
    for (image_url, page_url, text) in blocks:
        s += f'<a href="{page_url}"><img src={image_url} class="inner-img"></a>\n'
        for line in text:
            t += f'<p>{line}</p>\n'
    s = f'''
    <div class="outer-s">{s}
    <details>
    <summary>(not proofread)</summary>
    {t}
    </details>
    </div>
    '''
    print(s)
