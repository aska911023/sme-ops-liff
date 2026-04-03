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
        return result
    except urllib.error.HTTPError as e:
        print(f'{table} error: {e.read().decode()[:300]}')
        return []

# ═══════════════════════════════════
# 1. WAREHOUSES (新增4個)
# ═══════════════════════════════════
wh = post('warehouses', [
    {'name': '高雄倉', 'code': 'WH-KHH', 'address': '高雄市前鎮區成功二路88號', 'manager': '吳志偉', 'status': '啟用'},
    {'name': '新竹倉', 'code': 'WH-HSC', 'address': '新竹市東區光復路201號', 'manager': '劉俊傑', 'status': '啟用'},
    {'name': '桃園倉', 'code': 'WH-TYN', 'address': '桃園市中壢區環中東路350號', 'manager': '簡志明', 'status': '啟用'},
    {'name': '台南倉', 'code': 'WH-TNN', 'address': '台南市永康區中華路500號', 'manager': '林尚賢', 'status': '籌備中'},
])

# ═══════════════════════════════════
# 2. SKUS (品項)
# ═══════════════════════════════════
post('skus', [
    {'code': 'SKU-001', 'name': '有機綠茶包（50入）', 'category': '茶飲', 'unit': '盒', 'price': 280},
    {'code': 'SKU-002', 'name': '精品咖啡豆 中深焙 1kg', 'category': '咖啡', 'unit': '包', 'price': 650},
    {'code': 'SKU-003', 'name': '鮮奶油 1L', 'category': '乳品', 'unit': '瓶', 'price': 120},
    {'code': 'SKU-004', 'name': '杯蓋（中杯）500入', 'category': '耗材', 'unit': '箱', 'price': 350},
    {'code': 'SKU-005', 'name': '紙杯（大杯）300入', 'category': '耗材', 'unit': '箱', 'price': 420},
    {'code': 'SKU-006', 'name': '糖漿（香草）750ml', 'category': '調味', 'unit': '瓶', 'price': 180},
    {'code': 'SKU-007', 'name': '糖漿（焦糖）750ml', 'category': '調味', 'unit': '瓶', 'price': 180},
    {'code': 'SKU-008', 'name': '珍珠粉圓 3kg', 'category': '原料', 'unit': '包', 'price': 95},
    {'code': 'SKU-009', 'name': '紅茶茶葉 600g', 'category': '茶飲', 'unit': '包', 'price': 320},
    {'code': 'SKU-010', 'name': '椰果（罐裝）3kg', 'category': '原料', 'unit': '罐', 'price': 110},
    {'code': 'SKU-011', 'name': '吸管（粗）1000入', 'category': '耗材', 'unit': '箱', 'price': 280},
    {'code': 'SKU-012', 'name': '外帶提袋（單杯）', 'category': '耗材', 'unit': '箱', 'price': 150},
    {'code': 'SKU-013', 'name': '鮮榨柳橙原汁 2L', 'category': '果汁', 'unit': '瓶', 'price': 240},
    {'code': 'SKU-014', 'name': '抹茶粉（日本進口）200g', 'category': '原料', 'unit': '罐', 'price': 580},
    {'code': 'SKU-015', 'name': '清潔劑（食品級）5L', 'category': '清潔', 'unit': '桶', 'price': 320},
])

# ═══════════════════════════════════
# 3. STOCK_LEVELS (庫存) - 4個倉庫各有品項
# ═══════════════════════════════════
import random
stock_rows = []
# warehouse_id: 1=台北, 2=台中, 3=高雄, 4=新竹, 5=桃園
wh_ids = [1, 2, 3, 4, 5]  # 3,4,5 are new ones but ID depends on insert
# Get actual warehouse IDs
req = urllib.request.Request(f'{base}/warehouses?select=id,name&order=id')
req.add_header('apikey', key)
req.add_header('Authorization', f'Bearer {key}')
resp = urllib.request.urlopen(req)
warehouses = json.loads(resp.read())
wh_ids = [w['id'] for w in warehouses if '籌備' not in str(w.get('status',''))]

skus_data = [
    ('SKU-001', '有機綠茶包（50入）', '盒', 10),
    ('SKU-002', '精品咖啡豆 中深焙 1kg', '包', 8),
    ('SKU-003', '鮮奶油 1L', '瓶', 15),
    ('SKU-004', '杯蓋（中杯）500入', '箱', 5),
    ('SKU-005', '紙杯（大杯）300入', '箱', 5),
    ('SKU-006', '糖漿（香草）750ml', '瓶', 8),
    ('SKU-007', '糖漿（焦糖）750ml', '瓶', 8),
    ('SKU-008', '珍珠粉圓 3kg', '包', 10),
    ('SKU-009', '紅茶茶葉 600g', '包', 8),
    ('SKU-010', '椰果（罐裝）3kg', '罐', 6),
    ('SKU-011', '吸管（粗）1000入', '箱', 3),
    ('SKU-012', '外帶提袋（單杯）', '箱', 5),
    ('SKU-013', '鮮榨柳橙原汁 2L', '瓶', 10),
    ('SKU-014', '抹茶粉（日本進口）200g', '罐', 5),
    ('SKU-015', '清潔劑（食品級）5L', '桶', 3),
]

for wh_id in wh_ids:
    for code, name, unit, min_qty in skus_data:
        qty = random.randint(2, 50)
        stock_rows.append({
            'warehouse_id': wh_id,
            'sku_code': code,
            'sku_name': name,
            'quantity': qty,
            'unit': unit,
            'min_qty': min_qty,
        })

post('stock_levels', stock_rows)

# ═══════════════════════════════════
# 4. CUSTOMERS (20個客戶)
# ═══════════════════════════════════
post('customers', [
    {'name': '鮮茶道中正店', 'contact_person': '李明哲', 'phone': '02-2345-0001', 'email': 'mingzhe@fresh.com', 'address': '台北市中正區忠孝東路100號', 'tag': '經銷商', 'location': '台北總部', 'credit_limit': 500000, 'outstanding_amount': 120000, 'assigned_to': '陳大偉', 'status': '活躍'},
    {'name': '好茶多連鎖', 'contact_person': '王美華', 'phone': '02-2345-0002', 'email': 'meihua@goodtea.com', 'address': '台北市大安區復興南路250號', 'tag': 'VIP', 'location': '台北總部', 'credit_limit': 800000, 'outstanding_amount': 350000, 'assigned_to': '陳國華', 'status': '活躍'},
    {'name': '清心福全台中店', 'contact_person': '張文龍', 'phone': '04-2345-0001', 'email': 'wenlong@qxfq.com', 'address': '台中市西屯區台灣大道三段88號', 'tag': '大客戶', 'location': '台中分店', 'credit_limit': 600000, 'outstanding_amount': 200000, 'assigned_to': '李宗翰', 'status': '活躍'},
    {'name': '茶湯會高雄店', 'contact_person': '陳志偉', 'phone': '07-2345-0001', 'email': 'zhiwei@tp.com', 'address': '高雄市前鎮區中華五路789號', 'tag': '經銷商', 'location': '高雄分店', 'credit_limit': 400000, 'outstanding_amount': 80000, 'assigned_to': '王建國', 'status': '活躍'},
    {'name': '迷客夏新竹店', 'contact_person': '林淑惠', 'phone': '03-1234-0001', 'email': 'shuhui@milk.com', 'address': '新竹市東區光復路一段50號', 'tag': '一般', 'location': '新竹分店', 'credit_limit': 300000, 'outstanding_amount': 45000, 'assigned_to': '劉俊傑', 'status': '活躍'},
    {'name': '大苑子桃園店', 'contact_person': '黃國榮', 'phone': '03-9876-0001', 'email': 'guorong@dayuan.com', 'address': '桃園市中壢區中正路120號', 'tag': '大客戶', 'location': '桃園分店', 'credit_limit': 500000, 'outstanding_amount': 180000, 'assigned_to': '黃文達', 'status': '活躍'},
    {'name': '五十嵐台北信義', 'contact_person': '趙志明', 'phone': '02-2345-0003', 'email': 'zhiming@50lan.com', 'address': '台北市信義區松仁路100號', 'tag': 'VIP', 'location': '台北總部', 'credit_limit': 1000000, 'outstanding_amount': 420000, 'assigned_to': '陳國華', 'status': '活躍'},
    {'name': '春水堂台中', 'contact_person': '劉建宏', 'phone': '04-2345-0002', 'email': 'jianhong@spring.com', 'address': '台中市西區大墩路200號', 'tag': '大客戶', 'location': '台中分店', 'credit_limit': 700000, 'outstanding_amount': 280000, 'assigned_to': '李宗翰', 'status': '活躍'},
    {'name': '可不可台北', 'contact_person': '吳美琪', 'phone': '02-2345-0004', 'email': 'meiqi@kebuke.com', 'address': '台北市中山區南京東路三段50號', 'tag': '經銷商', 'location': '台北總部', 'credit_limit': 400000, 'outstanding_amount': 150000, 'assigned_to': '陳大偉', 'status': '活躍'},
    {'name': '一芳水果茶高雄', 'contact_person': '蔡玉芬', 'phone': '07-2345-0002', 'email': 'yufen@yifang.com', 'address': '高雄市苓雅區四維三路80號', 'tag': '一般', 'location': '高雄分店', 'credit_limit': 250000, 'outstanding_amount': 30000, 'assigned_to': '黃玉華', 'status': '活躍'},
    {'name': '丸作食茶新竹', 'contact_person': '周大為', 'phone': '03-1234-0002', 'email': 'dawei@onezo.com', 'address': '新竹市北區西大路150號', 'tag': '潛在客戶', 'location': '新竹分店', 'credit_limit': 200000, 'outstanding_amount': 0, 'assigned_to': '周宇軍', 'status': '活躍'},
    {'name': '萬波桃園', 'contact_person': '簡文彥', 'phone': '03-9876-0002', 'email': 'wenyan@wanpo.com', 'address': '桃園市桃園區大興西路200號', 'tag': '一般', 'location': '桃園分店', 'credit_limit': 300000, 'outstanding_amount': 65000, 'assigned_to': '林佳美', 'status': '活躍'},
    {'name': '老虎堂台中', 'contact_person': '陳小鈴', 'phone': '04-2345-0003', 'email': 'xiaoling@tiger.com', 'address': '台中市北區一中街55號', 'tag': '一般', 'location': '台中分店', 'credit_limit': 250000, 'outstanding_amount': 90000, 'assigned_to': '陳雅婷', 'status': '活躍'},
    {'name': '幸福堂台北', 'contact_person': '林志豪', 'phone': '02-2345-0005', 'email': 'zhihao@happy.com', 'address': '台北市大安區敦化南路一段300號', 'tag': '潛在客戶', 'location': '台北總部', 'credit_limit': 200000, 'outstanding_amount': 0, 'assigned_to': '陳大偉', 'status': '活躍'},
    {'name': '再睡5分鐘高雄', 'contact_person': '謝志強', 'phone': '07-2345-0003', 'email': 'zhiqiang@5min.com', 'address': '高雄市左營區博愛二路500號', 'tag': '一般', 'location': '高雄分店', 'credit_limit': 200000, 'outstanding_amount': 25000, 'assigned_to': '黃玉華', 'status': '活躍'},
    {'name': '鶴茶樓桃園', 'contact_person': '李雅文', 'phone': '03-9876-0003', 'email': 'yawen@crane.com', 'address': '桃園市蘆竹區南崁路一段100號', 'tag': '經銷商', 'location': '桃園分店', 'credit_limit': 350000, 'outstanding_amount': 110000, 'assigned_to': '黃文達', 'status': '活躍'},
    {'name': '龜記茗品台北', 'contact_person': '黃明德', 'phone': '02-2345-0006', 'email': 'mingde@guiji.com', 'address': '台北市松山區民生東路五段60號', 'tag': 'VIP', 'location': '台北總部', 'credit_limit': 600000, 'outstanding_amount': 220000, 'assigned_to': '陳國華', 'status': '活躍'},
    {'name': '珍煮丹新竹', 'contact_person': '趙美玲', 'phone': '03-1234-0003', 'email': 'meiling@jen.com', 'address': '新竹市東區中華路二段80號', 'tag': '一般', 'location': '新竹分店', 'credit_limit': 250000, 'outstanding_amount': 55000, 'assigned_to': '劉俊傑', 'status': '活躍'},
    {'name': '天仁茗茶台中', 'contact_person': '王俊凱', 'phone': '04-2345-0004', 'email': 'junkai@tenren.com', 'address': '台中市南屯區公益路二段300號', 'tag': '大客戶', 'location': '台中分店', 'credit_limit': 900000, 'outstanding_amount': 380000, 'assigned_to': '李宗翰', 'status': '活躍'},
    {'name': '翰林茶館高雄', 'contact_person': '劉怡君', 'phone': '07-2345-0004', 'email': 'yijun@hanlin.com', 'address': '高雄市新興區中山一路260號', 'tag': '一般', 'location': '高雄分店', 'credit_limit': 300000, 'outstanding_amount': 70000, 'assigned_to': '王建國', 'status': '活躍'},
])

# ═══════════════════════════════════
# 5. TASKS (流程任務 demo)
# ═══════════════════════════════════
post('tasks', [
    # 台南開店流程
    {'title': '【台南分店】場地評估與選址', 'workflow': '新店開幕 SOP', 'assignee': '林尚賢', 'priority': '高', 'status': '已完成', 'due_date': '2026-03-20'},
    {'title': '【台南分店】租約簽訂', 'workflow': '新店開幕 SOP', 'assignee': '林尚賢', 'priority': '高', 'status': '已完成', 'due_date': '2026-03-25'},
    {'title': '【台南分店】營業登記與許可證', 'workflow': '新店開幕 SOP', 'assignee': '謝宜君', 'priority': '高', 'status': '進行中', 'due_date': '2026-04-05'},
    {'title': '【台南分店】裝潢設計圖確認', 'workflow': '新店開幕 SOP', 'assignee': '林尚賢', 'priority': '高', 'status': '進行中', 'due_date': '2026-04-10'},
    {'title': '【台南分店】裝潢工程發包施工', 'workflow': '新店開幕 SOP', 'assignee': '吳建德', 'priority': '高', 'status': '未開始', 'due_date': '2026-04-20'},
    {'title': '【台南分店】設備採購', 'workflow': '新店開幕 SOP', 'assignee': '吳建德', 'priority': '高', 'status': '未開始', 'due_date': '2026-04-25'},
    {'title': '【台南分店】人員招募', 'workflow': '新店開幕 SOP', 'assignee': '張美玲', 'priority': '中', 'status': '未開始', 'due_date': '2026-05-01'},
    {'title': '【台南分店】庫存建置', 'workflow': '新店開幕 SOP', 'assignee': '林尚賢', 'priority': '中', 'status': '未開始', 'due_date': '2026-05-10'},

    # 日常營運
    {'title': '台北總部 Q2 業績目標設定', 'workflow': '績效考核流程', 'assignee': '陳國華', 'priority': '高', 'status': '進行中', 'due_date': '2026-04-01'},
    {'title': '全店 POS 系統升級', 'workflow': '採購申請流程', 'assignee': '吳建德', 'priority': '中', 'status': '進行中', 'due_date': '2026-04-15'},
    {'title': '新人教育訓練（4月梯次）', 'workflow': '新人到職流程', 'assignee': '張美玲', 'priority': '中', 'status': '未開始', 'due_date': '2026-04-08'},
    {'title': '高雄分店月度盤點', 'workflow': '開店流程', 'assignee': '吳志偉', 'priority': '中', 'status': '未開始', 'due_date': '2026-04-05'},
    {'title': '桃園分店客訴處理 SOP 檢討', 'workflow': '請假審批流程', 'assignee': '徐欣宜', 'priority': '低', 'status': '未開始', 'due_date': '2026-04-12'},
    {'title': '母親節行銷活動企劃', 'workflow': '採購申請流程', 'assignee': '謝宜君', 'priority': '高', 'status': '進行中', 'due_date': '2026-04-20'},
])

print('All done!')
