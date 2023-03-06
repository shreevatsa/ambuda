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
        regions_for_name[name].append({'page_id': page_id, 'xmin': xmin, 'ymin': ymin, 'width': xmax - xmin, 'height': ymax - ymin})

for name, regions in regions_for_name.items():
    print(name, regions)

ratio = 1.5
for name, regions in regions_for_name.items():
    urls = []
    for region in regions:
        n = region['page_id'] - 1
        x = int(region['xmin'] * ratio) - 1
        y = int(region['ymin'] * ratio) - 1
        w = int(region['width'] * ratio) + 2
        h = int(region['height'] * ratio) + 2
        url = 'https://archive.org/download/EpigramsAttributedToBhartrhariKosambiBookmarked/page/' + f'n{n}_x{x}_y{y}_w{w}_h{h}.jpg'
        urls.append(url)
    print(name, urls)
