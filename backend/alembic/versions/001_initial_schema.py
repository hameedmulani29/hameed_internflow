"""initial_schema

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-09-26 20:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = '001_initial_schema'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Schema is auto-initialized by app.db.init_db() or reproducible via SQL script.
    pass

def downgrade():
    pass
