import os
import pytest

TEST_DATABASE_URL = os.getenv(
    'TEST_DATABASE_URL',
    'postgresql://internflow_user:InternFlow%402026@localhost:5432/internflow?options=-csearch_path%3Dtest_schema,public'
)

# Enforce PostgreSQL test isolation environment BEFORE any app imports
os.environ['FORCE_POSTGRES'] = 'true'
os.environ['APP_ENV'] = 'test'
os.environ['DATABASE_URL'] = TEST_DATABASE_URL
os.environ['INTERNFLOW_SMTP_HOST'] = ''
os.environ['INTERNFLOW_DEMO_DATA'] = 'false'


@pytest.fixture(scope='session', autouse=True)
def setup_test_environment():
    """Session-wide fixture to initialize the isolated PostgreSQL test schema."""
    from app.db import init_db
    init_db()
    yield
