#!/usr/bin/env python3
"""Generate the initial VPS environment without displaying secrets."""
import os
from pathlib import Path
import secrets

path = Path('/opt/vlyntro-agents/.env.production')
password = secrets.token_hex(32)
values = {
    'NODE_ENV': 'production',
    'APP_BASE_URL': 'https://agents.vlyntro.com',
    'APP_DOMAIN': 'agents.vlyntro.com',
    'DATABASE_URL': 'postgres://hq:' + password + '@postgres:5432/hq',
    'POSTGRES_DB': 'hq',
    'POSTGRES_USER': 'hq',
    'POSTGRES_PASSWORD': password,
    'OPENAI_API_KEY': '',
    'ANTHROPIC_API_KEY': '',
    'XAI_API_KEY': '',
    'OPENAI_MODEL': 'gpt-4.1',
    'ANTHROPIC_MODEL': 'claude-sonnet-4-20250514',
    'XAI_MODEL': 'grok-3-mini',
    'CODEX_ENABLED': 'false',
    'AGENT_MAX_HANDOFF_DEPTH': '5',
}
descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, 'w') as output:
    output.write('\n'.join(key + '=' + value for key, value in values.items()) + '\n')
print('Protected production configuration created.')
