import json
import math
import sqlite3
import sys

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

regions = []

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
        assert group['type'] in ('lgHeader', 'lgFootnote', 'lgVerse'), group['type']
        name = group['attrs']['groupName']
        assert group['type'] == 'lgHeader' or name is not None, group
        # Normalize name
        if name.startswith('V'): name = name[1:]
        i = min([i for i in range(len(name)) if not str.isdigit(name[i])] + [len(name)])
        assert name[i:] in ('', 'f'), (name, name[i:])
        new_name = '' if name == '' else (f'{int(name[:i]):03}' + ('f' if group['type'] == 'lgFootnote' else ''))
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
        regions.append({'slug': slug, 'type': group['type'], 'name': name, 
                        'xmin': xmin, 'ymin': ymin, 'width': xmax - xmin, 'height': ymax - ymin, 'text': text})
print(json.dumps(regions, indent=4))
