import json
import math
import sqlite3
import sys

def eprint(*args, **kwargs):
    print(*args, file=sys.stderr, **kwargs)

regions = []

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
        assert group['type'] in ('lgHeader', 'lgFootnote', 'lgVerse'), group['type']
        name = group['attrs']['groupName']
        if group['type'] == 'lgHeader':
            if name is None or name == '': continue
            eprint(name)
        assert name is not None, group
        assert group['type'] in ('lgFootnote', 'lgVerse'), group['type']
        # Normalize name
        i = min([i for i in range(len(name)) if not str.isdigit(name[i])] + [len(name)])
        assert name[i:] in ('', 'f'), (name, name[i:])
        new_name = '' if name == '' else f'{int(name[:i]):03}'
        # new_name = f'{int(name[:i]):03}' + ('f' if group['type'] == 'lgFootnote' else '')
        if int(new_name[:3]) > 352: continue
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
        regions.append({'page_id': page_id, 'type': group['type'], 'name': name,
                        'xmin': xmin, 'ymin': ymin, 'width': xmax - xmin, 'height': ymax - ymin, 'text': text})

# This dump has the regions in the order they appear in the database.
json.dump(regions, open('kosambi-regions.json', 'w'), indent=4)


import collections
regions_for_name = collections.defaultdict(list)
for region in json.load(open('kosambi-regions.json')):
    name = region['name']
    region_type = {'lgFootnote': 'footnote',
                   'lgVerse': 'verse'
                   }[region['type']]
    regions_for_name[name].append((region_type, region))

# GROUP BY name, type
dump = collections.defaultdict(lambda: collections.defaultdict(list))
for (name, types_and_regions) in regions_for_name.items():
  for (region_type, region) in types_and_regions:
    dump[name][region_type].append(region)
# ORDER BY name
dump2 = [(name, dump[name]) for name in sorted(dump)]
dump3 = {
   'totWidth': 3309.0,
   'totHeight': 4678.0,
   'imageUrlPrefix': 'https://archive.org/download/EpigramsAttributedToBhartrhariKosambiBookmarked',
   'pageUrlPrefix': 'https://archive.org/details/EpigramsAttributedToBhartrhariKosambiBookmarked',
   'regions': dump2,
}
# This dump has the regions GROUP BY name, type ORDER BY name.
json.dump(dump3, open('kosambi-regions-out.json', 'w'), indent=2)
