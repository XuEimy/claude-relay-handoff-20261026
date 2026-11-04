export const SSH_CLAUDE_SESSIONS_SCRIPT = String.raw`
import json, os, pathlib, re, sys
request = json.load(sys.stdin)
cwd = request['cwd']
if not os.path.isabs(cwd):
    raise ValueError('Workspace must be absolute')
config = pathlib.Path(os.environ.get('CLAUDE_CONFIG_DIR', str(pathlib.Path.home() / '.claude')))
root = config / 'projects' / re.sub(r'[^a-zA-Z0-9]', '-', cwd)
def messages(path, tail=False):
    with path.open('rb') as stream:
        if tail:
            size = stream.seek(0, 2)
            stream.seek(max(0, size - 2097152))
            if size > 2097152: stream.readline()
        for _ in range(2000):
            line = stream.readline(1048577)
            if not line: break
            if len(line) > 1048576: continue
            try: row = json.loads(line)
            except (ValueError, UnicodeDecodeError): continue
            if row.get('isSidechain') or row.get('isMeta'): continue
            message = row.get('message') or {}
            role = message.get('role')
            if role not in ('user', 'assistant'): continue
            content = message.get('content', '')
            text = content if isinstance(content, str) else '\n'.join(part.get('text', '') for part in content if isinstance(part, dict) and part.get('type') == 'text')
            if text.lstrip().startswith(('<system-reminder>', '<local-command', '<command-name>')): continue
            if text.strip(): yield {'id': str(row.get('uuid') or stream.tell()), 'role': role, 'text': text[:16000], 'createdAt': row.get('timestamp')}
if request['operation'] == 'claude-trust':
    import fcntl, tempfile
    project = str(pathlib.Path(cwd).resolve(strict=True))
    configured = os.environ.get('CLAUDE_CONFIG_DIR')
    settings = pathlib.Path(configured) / '.claude.json' if configured else pathlib.Path.home() / '.claude.json'
    settings.parent.mkdir(parents=True, exist_ok=True)
    with (settings.parent / '.kelaodeyun-trust.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        original = settings.read_bytes() if settings.exists() else None
        data = json.loads(original) if original is not None else {}
        entry = data.setdefault('projects', {}).setdefault(project, {})
        if not entry.get('hasTrustDialogAccepted'):
            entry['hasTrustDialogAccepted'] = True
            if original is not None:
                backup = settings.with_name(settings.name + '.before-kelaodeyun-trust')
                if not backup.exists():
                    with backup.open('xb') as output:
                        os.chmod(backup, 0o600)
                        output.write(original)
            fd, temporary = tempfile.mkstemp(prefix='.claude-trust-', dir=settings.parent)
            try:
                with os.fdopen(fd, 'w') as output:
                    json.dump(data, output, ensure_ascii=False, indent=2)
                    output.flush()
                    os.fsync(output.fileno())
                current = settings.read_bytes() if settings.exists() else None
                if current != original: raise ValueError('Claude settings changed; retry opening the terminal')
                os.replace(temporary, settings)
            finally:
                if os.path.exists(temporary): os.unlink(temporary)
    print(json.dumps({'trusted': True, 'cwd': project}))
elif request['operation'] == 'claude-list':
    paths = sorted(root.glob('*.jsonl'), key=lambda p: p.stat().st_mtime, reverse=True)[:100]
    sessions = []
    for path in paths:
        if not re.fullmatch(r'[a-fA-F0-9-]{36}', path.stem) or path.is_symlink(): continue
        try:
            first = next((m for m in messages(path) if m['role'] == 'user'), None)
            if first: sessions.append({'id': path.stem, 'title': first['text'].replace('\n', ' ')[:100], 'updatedAt': path.stat().st_mtime})
        except (OSError, ValueError): continue
    print(json.dumps(sessions, ensure_ascii=False))
elif request['operation'] == 'claude-read':
    session = request['relativePath']
    if not re.fullmatch(r'[a-fA-F0-9-]{36}', session): raise ValueError('Invalid session id')
    path = root / (session + '.jsonl')
    if path.is_symlink(): raise ValueError('Invalid session path')
    print(json.dumps(list(messages(path, True))[-100:], ensure_ascii=False))
else:
    raise ValueError('Unsupported operation')
`;
