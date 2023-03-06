import collections
import json
import math
import sqlite3

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
    print('\n' * 20)
    assert content['type'] == 'doc'
    groups = content['content']
    for group in groups:
        if not('attrs' in group and 'groupName' in group['attrs']): continue
        name = group['attrs']['groupName']
        if name is None: continue
        xmin = math.inf
        xmax = -math.inf
        ymin = math.inf
        ymax = -math.inf
        for line in group['content']:
            box = line['attrs']['box']
            xmin = min(xmin, box['xmin'])
            xmax = max(xmax, box['xmax'])
            ymin = min(ymin, box['ymin'])
            ymax = max(ymax, box['ymax'])
        regions_for_name[name].append({'xmin': xmin, 'xmax': xmax, 'ymin': ymin, 'ymax': ymax})

for name, regions in regions_for_name.items():
    print(name, regions)
