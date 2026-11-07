export const SSH_CLAUDE_SESSIONS_SCRIPT = String.raw`
import json, os, pathlib, re, sys, time, tempfile, datetime
request = json.load(sys.stdin)
cwd = request['cwd']
if not os.path.isabs(cwd):
    raise ValueError('Workspace must be absolute')
config = pathlib.Path(os.environ.get('CLAUDE_CONFIG_DIR', str(pathlib.Path.home() / '.claude')))
root = config / 'projects' / re.sub(r'[^a-zA-Z0-9]', '-', cwd)
status_dir = config / 'kelaodeyun' / 'status'
session_id_pattern = r'[a-fA-F0-9-]{36}'
hook_source = r"""
import json, os, pathlib, re, sys, tempfile, time
try:
    data = json.load(sys.stdin)
    session = data.get('session_id', '')
    if not isinstance(session, str) or not re.fullmatch(r'[a-fA-F0-9-]{36}', session): sys.exit(0)
    event = data.get('hook_event_name')
    state = None
    if event in ('UserPromptSubmit', 'PostToolUse', 'PostToolUseFailure', 'ElicitationResult'): state = 'running'
    elif event == 'PreToolUse': state = 'needs-input' if data.get('tool_name') in ('AskUserQuestion', 'ExitPlanMode') else 'running'
    elif event in ('PermissionRequest', 'Elicitation'): state = 'needs-input'
    elif event == 'Notification' and data.get('notification_type') in ('permission_prompt', 'elicitation_dialog', 'elicitation_url_dialog', 'agent_needs_input'): state = 'needs-input'
    elif event == 'Stop': state = 'done'
    elif event == 'StopFailure': state = 'failed'
    elif event in ('SessionStart', 'SessionEnd'): state = 'idle'
    if state:
        pid = os.getppid()
        found = None
        for _ in range(6):
            try:
                command = pathlib.Path('/proc/%d/cmdline' % pid).read_bytes().lower()
                executable = command.split(b'\0', 1)[0].rsplit(b'/', 1)[-1]
                if b'claude' in command and executable not in (b'sh', b'bash', b'zsh', b'dash', b'fish'):
                    found = pid
                    break
                stat = pathlib.Path('/proc/%d/stat' % pid).read_text()
                pid = int(stat[stat.rfind(')') + 2:].split()[1])
                if pid <= 1: break
            except Exception: break
        directory = pathlib.Path(sys.argv[1])
        directory.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(prefix='.status-', dir=directory)
        try:
            with os.fdopen(fd, 'w') as output:
                json.dump({'state': state, 'at': time.time(), 'event': event, 'cwd': data.get('cwd'), 'transcript': data.get('transcript_path'), 'pid': found}, output)
            os.replace(temporary, directory / (session + '.json'))
        finally:
            if os.path.exists(temporary): os.unlink(temporary)
except BaseException: pass
"""
def atomic_content(path, content):
    if path.exists() and path.read_text() == content: return
    fd, temporary = tempfile.mkstemp(prefix='.kelaodeyun-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as output: output.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
def status_rows(path):
    with path.open('rb') as stream:
        size = stream.seek(0, 2)
        stream.seek(max(0, size - 262144))
        if size > 262144: stream.readline()
        for line in stream:
            try: row = json.loads(line)
            except (ValueError, UnicodeDecodeError): continue
            if not isinstance(row, dict) or row.get('isSidechain') or row.get('isMeta'): continue
            message = row.get('message')
            if not isinstance(message, dict) or message.get('role') not in ('user', 'assistant'): continue
            yield row, message
def message_text(message):
    content = message.get('content')
    if isinstance(content, str): return content
    if isinstance(content, list): return '\n'.join(part.get('text', '') for part in content if isinstance(part, dict) and part.get('type') == 'text' and isinstance(part.get('text'), str))
    return ''
def interrupted(message):
    return message_text(message).lstrip().startswith('[Request interrupted by user')
def messages(path, tail=False, origin=False):
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
            if text.strip():
                result = {'id': str(row.get('uuid') or stream.tell()), 'role': role, 'text': text[:16000], 'createdAt': row.get('timestamp')}
                if origin: result['entrypoint'] = row.get('entrypoint')
                yield result
if request['operation'] == 'claude-info':
    session = request['relativePath']
    if not re.fullmatch(r'[a-fA-F0-9-]{36}', session): raise ValueError('Invalid session id')
    candidates = [p for p in (config / 'projects').glob('*/' + session + '.jsonl') if not p.is_symlink() and not p.parent.is_symlink()]
    if len(candidates) > 1: raise ValueError('Ambiguous session id')
    workspace = None
    if candidates:
        with candidates[0].open('rb') as stream:
            size = stream.seek(0, 2)
            stream.seek(max(0, size - 2097152))
            if size > 2097152: stream.readline()
            for line in stream:
                if len(line) > 1048576: continue
                try: row = json.loads(line)
                except (ValueError, UnicodeDecodeError): continue
                if not isinstance(row, dict) or row.get('isSidechain') or row.get('isMeta'): continue
                if row.get('sessionId', session) != session: continue
                value = row.get('cwd')
                if isinstance(value, str) and os.path.isabs(value) and not any(ord(c) < 32 for c in value): workspace = os.path.normpath(value)
    print(json.dumps({'sessionId': session, 'cwd': workspace, 'exists': bool(workspace and os.path.isdir(workspace))}, ensure_ascii=False))
elif request['operation'] == 'claude-trust':
    import fcntl
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
    result = {'trusted': True, 'cwd': project}
    try:
        hook_dir = (config / 'kelaodeyun').resolve()
        hook = hook_dir / 'hook.py'
        status = hook_dir / 'status'
        if "'" in str(hook) or "'" in str(status): raise ValueError('Unsafe hook path')
        status.mkdir(parents=True, exist_ok=True)
        events = ('SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'Notification', 'Elicitation', 'ElicitationResult', 'Stop', 'StopFailure', 'SessionEnd')
        settings_content = json.dumps({'hooks': {event: [{'hooks': [{'type': 'command', 'command': "python3 '%s' '%s'" % (hook, status), 'timeout': 5}]}] for event in events}}, ensure_ascii=False)
        atomic_content(hook, hook_source)
        atomic_content(hook_dir / 'settings.json', settings_content)
        result['settingsPath'] = str(hook_dir / 'settings.json')
    except Exception: pass
    print(json.dumps(result))
elif request['operation'] == 'claude-status':
    now = time.time()
    states = {}
    for path in status_dir.glob('*.json'):
        try:
            if path.is_symlink() or not re.fullmatch(session_id_pattern, path.stem) or path.stat().st_mtime < now - 7 * 86400: continue
            data = json.loads(path.read_text())
            state, at = data.get('state'), data.get('at')
            if state not in ('running', 'needs-input', 'failed', 'done', 'idle') or not isinstance(at, (int, float)) or isinstance(at, bool): continue
            pid = data.get('pid')
            if state in ('running', 'needs-input') and isinstance(pid, int) and pid > 0 and not pathlib.Path('/proc/%d' % pid).exists(): state = 'idle'
            transcript = data.get('transcript')
            if isinstance(transcript, str):
                transcript_path = pathlib.Path(transcript)
                if transcript_path.is_file() and transcript_path.stat().st_mtime > at:
                    last_user = next((message for _, message in reversed(list(status_rows(transcript_path))) if message.get('role') == 'user'), None)
                    if last_user and interrupted(last_user): state, at = 'idle', transcript_path.stat().st_mtime
            states[path.stem] = {'id': path.stem, 'state': state, 'at': at}
        except (OSError, ValueError, TypeError, AttributeError): continue
    paths = []
    for path in (config / 'projects').glob('*/*.jsonl'):
        try:
            if path.is_symlink() or path.parent.is_symlink() or not re.fullmatch(session_id_pattern, path.stem) or path.stem in states: continue
            mtime = path.stat().st_mtime
            if mtime >= now - 86400: paths.append((mtime, path))
        except OSError: continue
    for mtime, path in sorted(paths, key=lambda item: item[0], reverse=True)[:200]:
        if path.stem in states: continue
        try:
            rows = list(status_rows(path))
            if not rows: continue
            pending = {}
            for _, message in rows:
                content = message.get('content')
                if not isinstance(content, list): continue
                for part in content:
                    if not isinstance(part, dict): continue
                    if message['role'] == 'assistant' and part.get('type') == 'tool_use' and isinstance(part.get('id'), str): pending[part['id']] = part.get('name')
                    elif message['role'] == 'user' and part.get('type') == 'tool_result': pending.pop(part.get('tool_use_id'), None)
            row, message = rows[-1]
            at = mtime
            if message['role'] == 'assistant' and pending:
                state = 'needs-input' if any(name in ('AskUserQuestion', 'ExitPlanMode') for name in pending.values()) else ('running' if mtime > now - 600 else 'idle')
            elif message['role'] == 'assistant':
                state = 'done'
                try: at = datetime.datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00')).timestamp()
                except (KeyError, ValueError, TypeError, AttributeError): pass
            elif interrupted(message): state = 'idle'
            else: state = 'running' if mtime > now - 600 else 'idle'
            states[path.stem] = {'id': path.stem, 'state': state, 'at': at}
        except (OSError, ValueError, TypeError): continue
    print(json.dumps(list(states.values())))
elif request['operation'] == 'claude-list':
    paths = sorted(root.glob('*.jsonl'), key=lambda p: p.stat().st_mtime, reverse=True)[:100]
    sessions = []
    for path in paths:
        if not re.fullmatch(r'[a-fA-F0-9-]{36}', path.stem) or path.is_symlink(): continue
        try:
            first = next((m for m in messages(path, origin=True) if m['role'] == 'user'), None)
            if first and first['entrypoint'] != 't3-code': sessions.append({'id': path.stem, 'title': first['text'].replace('\n', ' ')[:100], 'updatedAt': path.stat().st_mtime})
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
