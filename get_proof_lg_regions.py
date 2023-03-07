import collections
import json
import math
import sqlite3
import sys

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

regions_for_name = collections.defaultdict(list)

con = sqlite3.connect("deploy/data/database/database.db")
page_ids = [row[0] for row in con.execute('select id from proof_pages where project_id = 1')]
for page_id in page_ids:
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
        if name is None: continue
        assert group['type'] in ('lgFootnote', 'lgVerse'), group['type']
        # Normalize name
        i = min([i for i in range(len(name)) if not str.isdigit(name[i])] + [len(name)])
        assert name[i:] in ('', 'f')
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
        regions_for_name[name].append({'page_id': page_id, 'xmin': xmin, 'ymin': ymin, 'width': xmax - xmin, 'height': ymax - ymin, 'text': text})

# for name, regions in regions_for_name.items():
#     print(name, regions)

# TODO(shreevatsa): Remove this hard-coding. Get page dimensions from `content` (after saving it there).
totWidth = 3309.0
totHeight = 4678.0

header = '''
<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
'''
print(header)

for name, regions in sorted(regions_for_name.items()):
    blocks = []
    for region in regions:
        n = region['page_id'] - 1
        x = region['xmin'] / totWidth; x = int(x * 100) / 100
        y = region['ymin'] / totHeight; y = int(y * 1000) / 1000
        w = region['width'] / totWidth; w = int(w * 100) / 100 + 0.02
        h = region['height'] / totHeight; h = int(h * 1000) / 1000 + 0.005
        image_url = 'https://archive.org/download/EpigramsAttributedToBhartrhariKosambiBookmarked/page/' + f'n{n}_x{x}_y{y}_w{w}_h{h}.jpg'
        page_url = f'https://archive.org/details/EpigramsAttributedToBhartrhariKosambiBookmarked/page/n{n}/mode/2up'
        text = region['text']
        blocks.append((image_url, page_url, text))
    # print(name, urls)
    
    # Generate HTML for this name
    s = f'<p>{name}</p>\n'
    t = ''
    for (image_url, page_url, text) in blocks:
        s += f'<a href="{page_url}"><img src={image_url} class="w-11/12 md:w-9/12 border-2 rounded-md my-2"></a>\n'
        for line in text:
            t += f'<p>{line}</p>\n'
    s = f'''
    <div class="border-2 rounded-lg border-blue-500 m-2 md:m-10">{s}
    <details>
    <summary>(not proofread)</summary>
    {t}
    </details>
    </div>
    '''
    print(s)
