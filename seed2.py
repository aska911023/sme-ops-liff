import urllib.request, json

key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12a3ZudXhlYW1haGhmYWhjbG1pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODM3NDIsImV4cCI6MjA5MDE1OTc0Mn0.XdwpFEvels80p8A7u99hV-SChf_vu2jbb-28q8qJLoo'
base = 'https://mvkvnuxeamahhfahclmi.supabase.co/rest/v1'

def post(table, rows):
    data = json.dumps(rows).encode('utf-8')
    req = urllib.request.Request(f'{base}/{table}', data=data, method='POST')
    req.add_header('apikey', key)
    req.add_header('Authorization', f'Bearer {key}')
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'return=representation')
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read())
        print(f'{table}: inserted {len(result)} rows')
    except urllib.error.HTTPError as e:
        print(f'{table} error: {e.read().decode()[:300]}')

# Update stores table too (高雄 already exists but status wrong, and add new ones)
# First update 高雄 status
import urllib.parse
patch_url = f'{base}/stores?name=eq.{urllib.parse.quote("高雄分店")}'
patch_data = json.dumps({'status': '營運中'}).encode('utf-8')
req = urllib.request.Request(patch_url, data=patch_data, method='PATCH')
req.add_header('apikey', key)
req.add_header('Authorization', f'Bearer {key}')
req.add_header('Content-Type', 'application/json')
try:
    resp = urllib.request.urlopen(req)
    print('Updated 高雄 status')
except Exception as e:
    print(f'Patch error: {e}')

# Add new stores
post('stores', [
    {'name': '新竹分店', 'company': 'Master AI', 'address': '新竹市東區光復路二段101號', 'phone': '03-1234-5678', 'manager': '劉俊傑', 'employee_count': 3, 'status': '營運中'},
    {'name': '桃園分店', 'company': 'Master AI', 'address': '桃園市中壢區中正路88號', 'phone': '03-9876-5432', 'manager': '黃文達', 'employee_count': 4, 'status': '營運中'},
    {'name': '台南分店', 'company': 'Master AI', 'address': '台南市東區大學路168號', 'phone': '06-1234-5678', 'manager': '林尚賢', 'employee_count': 1, 'status': '籌備中'},
])

# Also update existing stores employee counts
for name, count, manager in [('台北總部', 14, '劉佳玲'), ('台中分店', 6, '李宗翰'), ('高雄分店', 5, '王建國')]:
    encoded = urllib.parse.quote(name)
    patch_data = json.dumps({'employee_count': count, 'manager': manager}).encode('utf-8')
    req = urllib.request.Request(f'{base}/stores?name=eq.{encoded}', data=patch_data, method='PATCH')
    req.add_header('apikey', key)
    req.add_header('Authorization', f'Bearer {key}')
    req.add_header('Content-Type', 'application/json')
    try:
        urllib.request.urlopen(req)
        print(f'Updated {name}: {count} employees, manager={manager}')
    except Exception as e:
        print(f'Update {name} error: {e}')

print('Done!')
