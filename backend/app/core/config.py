import os

JWT_SECRET = os.getenv('INTERNFLOW_JWT_SECRET', 'internflow-development-secret-change-me-2026')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRE_MINUTES = int(os.getenv('INTERNFLOW_JWT_EXPIRE_MINUTES', '720'))
CORS_ORIGINS = os.getenv('INTERNFLOW_CORS_ORIGINS', 'http://localhost:5173').split(',')


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
        if domain.startswith('@'):
            domain = domain
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
