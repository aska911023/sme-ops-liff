import urllib.request, json, random

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
        return result
    except urllib.error.HTTPError as e:
        print(f'{table} error: {e.read().decode()[:300]}')
        return []

# 1. SKUs (no price column, use status)
skus = post('skus', [
    {'code': 'SKU-001', 'name': '有機綠茶包（50入）', 'category': '茶飲', 'unit': '盒', 'status': '上架'},
    {'code': 'SKU-002', 'name': '精品咖啡豆 中深焙 1kg', 'category': '咖啡', 'unit': '包', 'status': '上架'},
    {'code': 'SKU-003', 'name': '鮮奶油 1L', 'category': '乳品', 'unit': '瓶', 'status': '上架'},
    {'code': 'SKU-004', 'name': '杯蓋（中杯）500入', 'category': '耗材', 'unit': '箱', 'status': '上架'},
    {'code': 'SKU-005', 'name': '紙杯（大杯）300入', 'category': '耗材', 'unit': '箱', 'status': '上架'},
    {'code': 'SKU-006', 'name': '糖漿（香草）750ml', 'category': '調味', 'unit': '瓶', 'status': '上架'},
    {'code': 'SKU-007', 'name': '糖漿（焦糖）750ml', 'category': '調味', 'unit': '瓶', 'status': '上架'},
    {'code': 'SKU-008', 'name': '珍珠粉圓 3kg', 'category': '原料', 'unit': '包', 'status': '上架'},
    {'code': 'SKU-009', 'name': '紅茶茶葉 600g', 'category': '茶飲', 'unit': '包', 'status': '上架'},
    {'code': 'SKU-010', 'name': '椰果（罐裝）3kg', 'category': '原料', 'unit': '罐', 'status': '上架'},
    {'code': 'SKU-011', 'name': '吸管（粗）1000入', 'category': '耗材', 'unit': '箱', 'status': '上架'},
    {'code': 'SKU-012', 'name': '外帶提袋（單杯）', 'category': '耗材', 'unit': '箱', 'status': '上架'},
    {'code': 'SKU-013', 'name': '鮮榨柳橙原汁 2L', 'category': '果汁', 'unit': '瓶', 'status': '上架'},
    {'code': 'SKU-014', 'name': '抹茶粉（日本進口）200g', 'category': '原料', 'unit': '罐', 'status': '上架'},
    {'code': 'SKU-015', 'name': '清潔劑（食品級）5L', 'category': '清潔', 'unit': '桶', 'status': '上架'},
])

# 2. Stock levels (columns: sku_id, warehouse_id, quantity, expiry_date)
# Get warehouse IDs
req = urllib.request.Request(f'{base}/warehouses?select=id,name,status&order=id')
req.add_header('apikey', key)
req.add_header('Authorization', f'Bearer {key}')
resp = urllib.request.urlopen(req)
warehouses = json.loads(resp.read())

# Get SKU IDs
sku_ids = [s['id'] for s in skus] if skus else []

if sku_ids and warehouses:
    stock_rows = []
    active_whs = [w for w in warehouses if '籌備' not in str(w.get('status',''))]
    for wh in active_whs:
        for sku_id in sku_ids:
            qty = random.randint(3, 60)
            # Some items with low stock
            if random.random() < 0.15:
                qty = random.randint(1, 5)
            stock_rows.append({
                'sku_id': sku_id,
                'warehouse_id': wh['id'],
                'quantity': qty,
            })
    post('stock_levels', stock_rows)

# 3. Customers (columns: name, company, phone, email, tags, credit_limit, outstanding_amount, assigned_to, source, status, notes, location_id)
post('customers', [
    {'name': '鮮茶道中正店', 'company': '鮮茶道', 'phone': '02-2345-0001', 'email': 'mingzhe@fresh.com', 'tags': '{經銷商}', 'credit_limit': 500000, 'outstanding_amount': 120000, 'assigned_to': '陳大偉', 'source': '業務開發', 'status': '活躍'},
    {'name': '好茶多連鎖', 'company': '好茶多', 'phone': '02-2345-0002', 'email': 'meihua@goodtea.com', 'tags': '{VIP}', 'credit_limit': 800000, 'outstanding_amount': 350000, 'assigned_to': '陳國華', 'source': '轉介紹', 'status': '活躍'},
    {'name': '清心福全台中店', 'company': '清心福全', 'phone': '04-2345-0001', 'email': 'wenlong@qxfq.com', 'tags': '{大客戶}', 'credit_limit': 600000, 'outstanding_amount': 200000, 'assigned_to': '李宗翰', 'source': '業務開發', 'status': '活躍'},
    {'name': '茶湯會高雄店', 'company': '茶湯會', 'phone': '07-2345-0001', 'email': 'zhiwei@tp.com', 'tags': '{經銷商}', 'credit_limit': 400000, 'outstanding_amount': 80000, 'assigned_to': '王建國', 'source': '展會', 'status': '活躍'},
    {'name': '迷客夏新竹店', 'company': '迷客夏', 'phone': '03-1234-0001', 'email': 'shuhui@milk.com', 'tags': '{一般}', 'credit_limit': 300000, 'outstanding_amount': 45000, 'assigned_to': '劉俊傑', 'source': '業務開發', 'status': '活躍'},
    {'name': '大苑子桃園店', 'company': '大苑子', 'phone': '03-9876-0001', 'email': 'guorong@dayuan.com', 'tags': '{大客戶}', 'credit_limit': 500000, 'outstanding_amount': 180000, 'assigned_to': '黃文達', 'source': '業務開發', 'status': '活躍'},
    {'name': '五十嵐信義店', 'company': '五十嵐', 'phone': '02-2345-0003', 'email': 'zhiming@50lan.com', 'tags': '{VIP}', 'credit_limit': 1000000, 'outstanding_amount': 420000, 'assigned_to': '陳國華', 'source': '轉介紹', 'status': '活躍'},
    {'name': '春水堂台中', 'company': '春水堂', 'phone': '04-2345-0002', 'email': 'jianhong@spring.com', 'tags': '{大客戶}', 'credit_limit': 700000, 'outstanding_amount': 280000, 'assigned_to': '李宗翰', 'source': '業務開發', 'status': '活躍'},
    {'name': '可不可台北', 'company': '可不可', 'phone': '02-2345-0004', 'email': 'meiqi@kebuke.com', 'tags': '{經銷商}', 'credit_limit': 400000, 'outstanding_amount': 150000, 'assigned_to': '陳大偉', 'source': '展會', 'status': '活躍'},
    {'name': '一芳水果茶', 'company': '一芳', 'phone': '07-2345-0002', 'email': 'yufen@yifang.com', 'tags': '{一般}', 'credit_limit': 250000, 'outstanding_amount': 30000, 'assigned_to': '黃玉華', 'source': '業務開發', 'status': '活躍'},
    {'name': '丸作食茶新竹', 'company': '丸作食茶', 'phone': '03-1234-0002', 'email': 'dawei@onezo.com', 'tags': '{潛在客戶}', 'credit_limit': 200000, 'outstanding_amount': 0, 'assigned_to': '周宇軍', 'source': '網路', 'status': '活躍'},
    {'name': '萬波桃園', 'company': '萬波', 'phone': '03-9876-0002', 'email': 'wenyan@wanpo.com', 'tags': '{一般}', 'credit_limit': 300000, 'outstanding_amount': 65000, 'assigned_to': '林佳美', 'source': '業務開發', 'status': '活躍'},
    {'name': '老虎堂台中', 'company': '老虎堂', 'phone': '04-2345-0003', 'email': 'xiaoling@tiger.com', 'tags': '{一般}', 'credit_limit': 250000, 'outstanding_amount': 90000, 'assigned_to': '陳雅婷', 'source': '展會', 'status': '活躍'},
    {'name': '幸福堂台北', 'company': '幸福堂', 'phone': '02-2345-0005', 'email': 'zhihao@happy.com', 'tags': '{潛在客戶}', 'credit_limit': 200000, 'outstanding_amount': 0, 'assigned_to': '陳大偉', 'source': '網路', 'status': '活躍'},
    {'name': '再睡5分鐘高雄', 'company': '再睡5分鐘', 'phone': '07-2345-0003', 'email': 'zhiqiang@5min.com', 'tags': '{一般}', 'credit_limit': 200000, 'outstanding_amount': 25000, 'assigned_to': '黃玉華', 'source': '業務開發', 'status': '活躍'},
    {'name': '鶴茶樓桃園', 'company': '鶴茶樓', 'phone': '03-9876-0003', 'email': 'yawen@crane.com', 'tags': '{經銷商}', 'credit_limit': 350000, 'outstanding_amount': 110000, 'assigned_to': '黃文達', 'source': '轉介紹', 'status': '活躍'},
    {'name': '龜記茗品台北', 'company': '龜記', 'phone': '02-2345-0006', 'email': 'mingde@guiji.com', 'tags': '{VIP}', 'credit_limit': 600000, 'outstanding_amount': 220000, 'assigned_to': '陳國華', 'source': '業務開發', 'status': '活躍'},
    {'name': '珍煮丹新竹', 'company': '珍煮丹', 'phone': '03-1234-0003', 'email': 'meiling2@jen.com', 'tags': '{一般}', 'credit_limit': 250000, 'outstanding_amount': 55000, 'assigned_to': '劉俊傑', 'source': '業務開發', 'status': '活躍'},
    {'name': '天仁茗茶台中', 'company': '天仁茗茶', 'phone': '04-2345-0004', 'email': 'junkai@tenren.com', 'tags': '{大客戶}', 'credit_limit': 900000, 'outstanding_amount': 380000, 'assigned_to': '李宗翰', 'source': '轉介紹', 'status': '活躍'},
    {'name': '翰林茶館高雄', 'company': '翰林茶館', 'phone': '07-2345-0004', 'email': 'yijun2@hanlin.com', 'tags': '{一般}', 'credit_limit': 300000, 'outstanding_amount': 70000, 'assigned_to': '王建國', 'source': '展會', 'status': '活躍'},
])

print('All done!')
