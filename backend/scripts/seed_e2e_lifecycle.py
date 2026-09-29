"""Seed a complete InternFlow lifecycle through the real API.

Creates provider + internship + intern application + AI screening + mentor +
assignment + task, then prints credentials/ids for browser E2E verification.
Run: python scripts/seed_e2e_lifecycle.py
"""
import json
import pathlib
import urllib.request

BASE = 'http://127.0.0.1:8000/api'
SUFFIX = 'p18'


def call(method, path, body=None, token=None, expect_error=False):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f'{BASE}{path}',
        data=data,
        method=method,
        headers={
            'Content-Type': 'application/json',
            **({'Authorization': f'Bearer {token}'} if token else {}),
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()
        if expect_error:
            return {'error': detail}
        print(f'  ! {method} {path} -> {exc.code}: {detail[:200]}')
        return {'error': detail}


def register(role, name, email, password='E2ePass123', organization=None):
    res = call('POST', '/auth/register', {
        'role': role,
        'full_name': name,
        'email': email,
        'password': password,
        'organization': organization,
    }, expect_error=True)
    if 'error' in res and 'already exists' in res['error']:
        res = call('POST', '/auth/login', {'email': email, 'password': password})
        return res['token'], res['user']['id']
    if 'error' in res:
        raise SystemExit(f'Register failed: {res["error"]}')
    return res['token'], res['user']['id']


def main():
    provider_token, provider_id = register('provider', 'Phase18 Provider', f'p18.provider@{SUFFIX}.in', organization='Phase18 Corp')
    mentor_token, mentor_id = register('mentor', 'Phase18 Mentor', 'p18.mentor@dev.in')
    intern_token, intern_id = register('intern', 'Phase18 Intern', f'p18.intern@{SUFFIX}.in')
    print(f'provider id={provider_id}  mentor id={mentor_id}  intern id={intern_id}')

    # Provider publishes an internship
    internship = call('POST', '/internships', {
        'title': 'Phase18 QA Engineering Intern',
        'department': 'Quality Engineering',
        'description': 'Build automated test pipelines and verification dashboards for a production-focused engineering team. Strong Python and API testing focus.',
        'location': 'Remote',
        'work_mode': 'Remote',
        'duration': '3 Months',
        'stipend': '18000/month',
        'openings': 2,
    }, token=provider_token)
    internship_id = internship['id']
    print(f'internship id={internship_id}')

    # Intern applies
    application = call('POST', '/applications', {
        'internship_id': internship_id,
        'resume_text': (
            'Phase18 Intern — QA engineer with 2 years of Python testing experience. '
            'Skilled in pytest, API automation, CI pipelines and regression suites. '
            'Built test frameworks covering REST APIs and dashboards. '
            'Familiar with FastAPI, GitHub Actions and PostgreSQL. '
            'Strengths: test design, debugging, API contracts.'
        ),
        'resume_file_name': 'phase18_resume.txt',
        'resume_mime_type': 'text/plain',
    }, token=intern_token)
    application_id = application['id']
    print(f'application id={application_id} status={application["status"]}')

    # Provider triggers AI screening (works only if a Gemini key is configured)
    screen = call('POST', f'/applications/{application_id}/screen', {}, token=provider_token, expect_error=True)
    if 'error' in screen:
        print(f'screening: NOT run ({screen["error"][:120]})')
    else:
        print(f'screening: completed score={screen["overall_score"]}')

    # Provider selects the intern
    call('PATCH', f'/applications/{application_id}/status', {'status': 'selected'}, token=provider_token)
    print('application status -> selected')

    # Provider assigns mentor
    call('POST', '/mentor/assignments', {'mentor_id': mentor_id, 'intern_id': intern_id, 'internship_id': internship_id}, token=provider_token)
    print('mentor assignment created')

    # Mentor assigns a task
    task = call('POST', '/mentor/tasks', {
        'intern_id': intern_id,
        'title': 'Write smoke tests for the attendance API',
        'description': 'Cover check-in, check-out and the today endpoint with pytest.',
        'priority': 'high',
    }, token=mentor_token)
    print(f'task id={task["id"]}')

    tokens_path = pathlib.Path(__file__).resolve().parents[2] / '.freebuff' / 'p18_tokens.txt'
    tokens_path.parent.mkdir(parents=True, exist_ok=True)
    with open(tokens_path, 'w') as fh:
        fh.write(f'PROVIDER_TOKEN={provider_token}\nMENTOR_TOKEN={mentor_token}\nINTERN_TOKEN={intern_token}\n')
        fh.write(f'PROVIDER_ID={provider_id}\nMENTOR_ID={mentor_id}\nINTERN_ID={intern_id}\n')
        fh.write(f'INTERNSHIP_ID={internship_id}\nAPPLICATION_ID={application_id}\nTASK_ID={task["id"]}\n')
    print('tokens saved to .freebuff/p18_tokens.txt')


if __name__ == '__main__':
    main()
