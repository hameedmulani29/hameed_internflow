import os

APP_ENV = os.getenv('APP_ENV', 'development').strip().lower()
IS_PRODUCTION = APP_ENV == 'production'


def _first_non_empty(*values: str | None) -> str | None:
    for value in values:
        if value is not None and value.strip():
            return value.strip()
    return None


def _require_setting(setting_name: str, value: str | None, *, allow_dev_fallback: bool = False) -> str:
    if value:
        return value
    if IS_PRODUCTION:
        raise ValueError(f"{setting_name} is required in production.")
    if allow_dev_fallback:
        return allow_dev_fallback
    return ''


JWT_SECRET = _require_setting(
    'JWT secret',
    _first_non_empty(
        os.getenv('INTERNFLOW_JWT_SECRET'),
        os.getenv('JWT_SECRET'),
    ),
    allow_dev_fallback='internflow-development-secret-change-me-2026' if not IS_PRODUCTION else None,
)
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_MINUTES = int(_first_non_empty(os.getenv('INTERNFLOW_JWT_EXPIRE_MINUTES'), os.getenv('JWT_EXPIRE_MINUTES')) or '720')


def _parse_cors_origins(raw_value: str | None) -> list[str]:
    if raw_value is None:
        return ['http://localhost:5173'] if not IS_PRODUCTION else []
    origins = []
    for part in raw_value.split(','):
        value = part.strip()
        if value:
            origins.append(value)
    return origins


CORS_ORIGINS = _parse_cors_origins(
    _first_non_empty(
        os.getenv('INTERNFLOW_CORS_ORIGINS'),
        os.getenv('CORS_ORIGINS'),
    )
)


def _parse_allowed_domains(raw_value: str | None, default_domains: tuple[str, ...]) -> tuple[str, ...]:
    if raw_value is None:
        return default_domains
    domains = []
    for part in raw_value.split(','):
        domain = part.strip().lower()
        if not domain:
            continue
        if not domain.startswith('.'):
            domain = f'.{domain}' if not domain.startswith('@') else domain
        domains.append(domain)
    return tuple(domains) if domains else default_domains


PROVIDER_ALLOWED_EMAIL_DOMAINS = _parse_allowed_domains(
    os.getenv('PROVIDER_ALLOWED_EMAIL_DOMAINS'),
    ('@co.in', 'gmail.com'),
)
MENTOR_ALLOWED_EMAIL_DOMAINS = _parse_allowed_domains(
    os.getenv('MENTOR_ALLOWED_EMAIL_DOMAINS'),
    ('@dev.in', 'gmail.com'),
)


ROLE_ALLOWED_EMAIL_DOMAINS = {
    'provider': PROVIDER_ALLOWED_EMAIL_DOMAINS,
    'mentor': MENTOR_ALLOWED_EMAIL_DOMAINS,
}


def normalize_email_domain(email: str) -> str:
    if not email:
        return ''
    return email.strip().lower()


def email_matches_allowed_domains(email: str, allowed_domains: tuple[str, ...]) -> bool:
    normalized = normalize_email_domain(email)
    if not normalized:
        return False
    if '@' not in normalized:
        return False
    domain = normalized.rsplit('@', 1)[1]
    return any(
        normalized.endswith(candidate_domain if candidate_domain.startswith('@') else f'@{candidate_domain}')
        or domain == candidate_domain.strip('.')
        or normalized.endswith(candidate_domain)
        for candidate_domain in allowed_domains
    )


def validate_email_for_role(role: str, email: str) -> bool:
    if role not in ROLE_ALLOWED_EMAIL_DOMAINS:
        return True
    return email_matches_allowed_domains(email, ROLE_ALLOWED_EMAIL_DOMAINS[role])
