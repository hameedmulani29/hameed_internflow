import importlib

import pytest


def reload_config(monkeypatch, **env):
    import app.core.config as config_module

    for key in [
        'APP_ENV',
        'DATABASE_URL',
        'INTERNFLOW_JWT_SECRET',
        'INTERNFLOW_CORS_ORIGINS',
        'PROVIDER_ALLOWED_EMAIL_DOMAINS',
        'MENTOR_ALLOWED_EMAIL_DOMAINS',
    ]:
        monkeypatch.delenv(key, raising=False)

    for key, value in env.items():
        monkeypatch.setenv(key, value)

    return importlib.reload(config_module)


def test_production_requires_explicit_jwt_secret(monkeypatch):
    with pytest.raises(ValueError, match='JWT secret'):
        reload_config(monkeypatch, APP_ENV='production', DATABASE_URL='postgresql://user:pass@db.internal:5432/internflow')


def test_production_requires_explicit_database_url(monkeypatch):
    reload_config(monkeypatch, APP_ENV='production', INTERNFLOW_JWT_SECRET='production-secret')

    from app.db import get_db_url

    with pytest.raises(ValueError, match='DATABASE_URL'):
        get_db_url()
