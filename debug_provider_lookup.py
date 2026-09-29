import sqlite3

db_path = r'd:\Web Dev Projects\internflow\backend\internflow.db'
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
email = 'hameedmulani266@gmail.com'
row = conn.execute('SELECT * FROM users WHERE lower(email) = lower(?)', (email,)).fetchone()
print('FOUND' if row else 'NOT_FOUND')
if row:
    print(dict(row))
print('---GMAIL_USERS---')
rows = conn.execute("SELECT id, full_name, email, role, is_active, is_verified, is_approved, trust_level, requires_2fa, organization FROM users WHERE lower(email) LIKE '%@gmail.com' ORDER BY id LIMIT 50").fetchall()
for r in rows:
    print(dict(r))
conn.close()
