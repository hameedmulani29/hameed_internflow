import os
# pyrefly: ignore [missing-import]
import psycopg
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

db_url = os.getenv("DATABASE_URL")
print(f"Connecting to: {db_url.split('@')[-1] if '@' in db_url else db_url}")

with psycopg.connect(db_url) as conn:
    with conn.cursor() as cur:
        cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'app_schema' AND table_name != 'alembic_version' ORDER BY table_name")
        tables = [r[0] for r in cur.fetchall()]
        print(f"\nTotal application tables in PostgreSQL: {len(tables)}")
        print("=" * 60)
        for t in tables:
            cur.execute(f"""
                SELECT count(*) FROM information_schema.columns WHERE table_schema = 'app_schema' AND table_name = '{t}'
            """)
            col_count = cur.fetchone()[0]
            print(f"Table: {t:<35} | Columns: {col_count}")
