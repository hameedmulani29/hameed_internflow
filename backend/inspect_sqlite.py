import os
import shutil
import sqlite3

sqlite_path = "internflow.db"
backup_path = "internflow_backup.db"

if os.path.exists(sqlite_path):
    shutil.copyfile(sqlite_path, backup_path)
    print(f"Backed up {sqlite_path} -> {backup_path}")

conn = sqlite3.connect(sqlite_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

tables = [r[0] for r in cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'alembic_version'").fetchall()]
print(f"Total tables: {len(tables)}")
print("-" * 50)
table_counts = {}
for t in sorted(tables):
    cnt = cursor.execute(f"SELECT COUNT(*) FROM `{t}`").fetchone()[0]
    table_counts[t] = cnt
    print(f"{t}: {cnt}")

conn.close()
