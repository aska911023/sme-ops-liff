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

# Skip locations (already inserted)

# New employees
employees = [
    # 台中分店
    {'name': '李宗翰', 'name_en': 'Zonghan Li', 'dept': '業務部', 'position': '店長', 'store': '台中分店', 'email': 'zonghan@company.com', 'phone': '0911-111-001', 'join_date': '2021-06-15', 'status': '在職', 'avatar': '#3b82f6', 'role': 'employee'},
    {'name': '謝淑芬', 'name_en': 'Shufen Xie', 'dept': '客服部', 'position': '副店長', 'store': '台中分店', 'email': 'shufen@company.com', 'phone': '0911-111-002', 'join_date': '2022-01-10', 'status': '在職', 'avatar': '#f472b6', 'role': 'employee'},
    {'name': '張家豪', 'name_en': 'Jiahao Zhang', 'dept': '倉管部', 'position': '倉管專員', 'store': '台中分店', 'email': 'jiahao@company.com', 'phone': '0911-111-003', 'join_date': '2023-03-20', 'status': '在職', 'avatar': '#34d399', 'role': 'employee'},
    {'name': '陳雅婷', 'name_en': 'Yating Chen2', 'dept': '業務部', 'position': '業務專員', 'store': '台中分店', 'email': 'yatingc@company.com', 'phone': '0911-111-004', 'join_date': '2024-05-01', 'status': '在職', 'avatar': '#fb923c', 'role': 'employee'},

    # 高雄分店
    {'name': '王建國', 'name_en': 'Jianguo Wang', 'dept': '業務部', 'position': '店長', 'store': '高雄分店', 'email': 'jianguo@company.com', 'phone': '0922-222-001', 'join_date': '2020-09-01', 'status': '在職', 'avatar': '#a78bfa', 'role': 'employee'},
    {'name': '林明潔', 'name_en': 'Mingjie Lin', 'dept': '客服部', 'position': '副店長', 'store': '高雄分店', 'email': 'mingjie@company.com', 'phone': '0922-222-002', 'join_date': '2021-11-15', 'status': '在職', 'avatar': '#22d3ee', 'role': 'employee'},
    {'name': '黃玉華', 'name_en': 'Yuhua Huang', 'dept': '業務部', 'position': '業務專員', 'store': '高雄分店', 'email': 'yuhua@company.com', 'phone': '0922-222-003', 'join_date': '2023-07-01', 'status': '在職', 'avatar': '#f87171', 'role': 'employee'},
    {'name': '吳志偉', 'name_en': 'Zhiwei Wu', 'dept': '倉管部', 'position': '倉管專員', 'store': '高雄分店', 'email': 'zhiwei@company.com', 'phone': '0922-222-004', 'join_date': '2024-01-15', 'status': '在職', 'avatar': '#fbbf24', 'role': 'employee'},

    # 新竹分店
    {'name': '劉俊傑', 'name_en': 'Junjie Liu', 'dept': '業務部', 'position': '店長', 'store': '新竹分店', 'email': 'junjie@company.com', 'phone': '0933-333-001', 'join_date': '2022-04-01', 'status': '在職', 'avatar': '#3b82f6', 'role': 'employee'},
    {'name': '趙雅雯', 'name_en': 'Yawen Zhao', 'dept': '客服部', 'position': '客服專員', 'store': '新竹分店', 'email': 'yawen@company.com', 'phone': '0933-333-002', 'join_date': '2023-08-10', 'status': '在職', 'avatar': '#f472b6', 'role': 'employee'},
    {'name': '周宇軍', 'name_en': 'Yujun Zhou', 'dept': '業務部', 'position': '業務專員', 'store': '新竹分店', 'email': 'yujun@company.com', 'phone': '0933-333-003', 'join_date': '2024-02-20', 'status': '在職', 'avatar': '#34d399', 'role': 'employee'},

    # 桃園分店
    {'name': '黃文達', 'name_en': 'Wenda Huang', 'dept': '業務部', 'position': '店長', 'store': '桃園分店', 'email': 'wenda@company.com', 'phone': '0944-444-001', 'join_date': '2021-03-15', 'status': '在職', 'avatar': '#a78bfa', 'role': 'employee'},
    {'name': '徐欣宜', 'name_en': 'Xinyi Xu', 'dept': '客服部', 'position': '副店長', 'store': '桃園分店', 'email': 'xinyixu@company.com', 'phone': '0944-444-002', 'join_date': '2022-06-01', 'status': '在職', 'avatar': '#22d3ee', 'role': 'employee'},
    {'name': '簡志明', 'name_en': 'Zhiming Jian', 'dept': '倉管部', 'position': '倉管專員', 'store': '桃園分店', 'email': 'zhiming@company.com', 'phone': '0944-444-003', 'join_date': '2023-09-01', 'status': '在職', 'avatar': '#fb923c', 'role': 'employee'},
    {'name': '林佳美', 'name_en': 'Jiamei Lin', 'dept': '業務部', 'position': '業務專員', 'store': '桃園分店', 'email': 'jiamei@company.com', 'phone': '0944-444-004', 'join_date': '2024-04-10', 'status': '在職', 'avatar': '#f87171', 'role': 'employee'},

    # 台北總部 - 主管
    {'name': '陳國華', 'name_en': 'Guohua Chen', 'dept': '業務部', 'position': '業務總監', 'store': '台北總部', 'email': 'guohua@company.com', 'phone': '0955-555-001', 'join_date': '2019-01-15', 'status': '在職', 'avatar': '#3b82f6', 'role': 'employee'},
    {'name': '張美玲', 'name_en': 'Meiling Zhang', 'dept': '人資部', 'position': 'HR 經理', 'store': '台北總部', 'email': 'meiling@company.com', 'phone': '0955-555-002', 'join_date': '2020-03-01', 'status': '在職', 'avatar': '#f472b6', 'role': 'employee'},
    {'name': '吳建德', 'name_en': 'Jiande Wu', 'dept': '採購部', 'position': '採購主管', 'store': '台北總部', 'email': 'jiande@company.com', 'phone': '0955-555-003', 'join_date': '2020-07-15', 'status': '在職', 'avatar': '#34d399', 'role': 'employee'},
    {'name': '謝宜君', 'name_en': 'Yijun Xie', 'dept': '行銷部', 'position': '行銷主管', 'store': '台北總部', 'email': 'yijun@company.com', 'phone': '0955-555-004', 'join_date': '2021-02-01', 'status': '在職', 'avatar': '#fb923c', 'role': 'employee'},

    # 台南分店 (籌備中)
    {'name': '林尚賢', 'name_en': 'Shangxian Lin', 'dept': '業務部', 'position': '店長（籌備）', 'store': '台南分店', 'email': 'shangxian@company.com', 'phone': '0966-666-001', 'join_date': '2026-03-15', 'status': '在職', 'avatar': '#a78bfa', 'role': 'employee'},
]

post('employees', employees)
print('Done!')
