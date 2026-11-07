export const SSH_COMPUTER_LINK_SCRIPT = String.raw`
import json, os, pathlib, re, shlex, shutil, subprocess, sys, tempfile, time

request = json.load(sys.stdin)
operation = request.get('operation')
computer = request.get('computer') or {}
root = pathlib.Path.home() / 'computers'
(pathlib.Path.home() / '.ssh').mkdir(mode=0o700, exist_ok=True)
MUX = ['-o', 'ControlMaster=auto', '-o', 'ControlPath=~/.ssh/kelaodeyun-%C', '-o', 'ControlPersist=600']

def error(code, message):
    return {'ok': False, 'error': code, 'message': message}

def atomic_write(path, contents):
    fd, temporary = tempfile.mkstemp(dir=str(path.parent), prefix='.kelaodeyun-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(contents)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

def computer_slug(host):
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9-]', '-', host.split('.')[0].lower())).strip('-') or 'computer'

def write_block(path, start, end, block):
    existing = path.read_text(encoding='utf-8') if path.exists() else ''
    begin = existing.find(start)
    finish = existing.find(end, begin + len(start)) if begin >= 0 else -1
    if begin >= 0 and finish < 0: return False
    if begin >= 0:
        content = existing[:begin] + block + existing[finish + len(end):]
    else:
        content = existing + ('\n' if existing and not existing.endswith('\n') else '') + block + '\n'
    atomic_write(path, content)
    return True

def target():
    host = computer.get('host', '')
    username = computer.get('username', '')
    if not isinstance(host, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9.:-]*', host):
        raise ValueError('电脑地址无效')
    if not isinstance(username, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_.-]*', username):
        raise ValueError('用户名无效')
    return username + '@' + host

def probe():
    try:
        result = subprocess.run(['ssh', *MUX, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
            '-o', 'StrictHostKeyChecking=accept-new', '-o', 'NumberOfPasswordPrompts=0',
            target(), 'uname -s 2>/dev/null || echo unknown'],
            capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return error('unreachable', '无法连接电脑，请检查网络和 SSH 服务')
    if result.returncode == 0:
        return {'ok': True, 'os': result.stdout.strip().lower() or 'unknown'}
    message = result.stderr.strip()[:300]
    if result.returncode == 255 and re.search(r'permission denied|authentication', result.stderr, re.I):
        return error('auth', '需要 SSH 验证')
    return error('unreachable', message or '无法连接电脑，请检查网络和 SSH 服务')

def install_key():
    destination = target()
    password = computer.get('password')
    if not isinstance(password, str) or not password:
        return error('auth', '用户名或密码不正确')
    ssh_dir = pathlib.Path.home() / '.ssh'
    ssh_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    private_key = ssh_dir / 'id_ed25519'
    public_key = ssh_dir / 'id_ed25519.pub'
    if not private_key.exists():
        subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-C',
            'kelaodeyun', '-f', str(private_key)], check=True, capture_output=True, timeout=20)
    if not public_key.exists():
        return error('key', '服务器公钥不存在，请检查 SSH 密钥')
    key = public_key.read_text(encoding='utf-8').strip()
    command = """umask 077; mkdir -p ~/.ssh; k=$(cat); touch ~/.ssh/authorized_keys; grep -qxF "$k" ~/.ssh/authorized_keys || printf '%s\\n' "$k" >> ~/.ssh/authorized_keys"""
    with tempfile.TemporaryDirectory(prefix='kelaodeyun-askpass-') as directory:
        script = pathlib.Path(directory) / 'askpass'
        script.write_text("#!/bin/sh\nprintf '%s\\n' \"$KELAODEYUN_SSH_PASSWORD\"\n", encoding='utf-8')
        script.chmod(0o700)
        env = os.environ.copy()
        env.update({'SSH_ASKPASS': str(script), 'SSH_ASKPASS_REQUIRE': 'force',
            'DISPLAY': ':0', 'KELAODEYUN_SSH_PASSWORD': password})
        prefix = []
        if shutil.which('sshpass'):
            env['SSHPASS'] = password
            prefix = ['sshpass', '-e']
        try:
            result = subprocess.run(prefix + ['ssh', '-o', 'StrictHostKeyChecking=accept-new',
                '-o', 'ConnectTimeout=10', '-o', 'PreferredAuthentications=password,keyboard-interactive',
                '-o', 'NumberOfPasswordPrompts=1', destination, command],
                input=key + '\n', capture_output=True, text=True, timeout=30,
                env=env, start_new_session=True)
        except (OSError, subprocess.TimeoutExpired):
            return error('unreachable', '无法连接电脑，请检查网络和 SSH 服务')
        if result.returncode != 0:
            message = result.stderr.replace(password, '').strip()[:300]
            if re.search(r'permission denied|authentication', message, re.I) or result.returncode in (5, 6):
                return error('auth', '用户名或密码不正确')
            return error('unreachable', message or '无法配置免密登录')
    result = probe()
    if not result['ok'] and result['error'] == 'auth':
        result['message'] = '用户名或密码不正确'
    return result

def peers():
    try:
        result = subprocess.run(['tailscale', 'status', '--json'], capture_output=True, text=True, timeout=10)
    except FileNotFoundError:
        return error('tailscale-missing', '服务器上未检测到 Tailscale')
    except (OSError, subprocess.TimeoutExpired):
        return error('tailscale-error', '无法读取服务器上的 Tailscale 状态')
    try:
        status = json.loads(result.stdout)
        if not isinstance(status, dict): raise ValueError()
    except (ValueError, TypeError):
        return error('tailscale-error', '无法读取服务器上的 Tailscale 状态')
    state = status.get('BackendState')
    if state != 'Running':
        return {'ok': False, 'error': 'tailscale-stopped', 'message': '服务器上的 Tailscale 未连接', 'state': state}
    output = []
    def add(node_id, node, self):
        if not isinstance(node, dict): return
        dns = node.get('DNSName')
        name = node.get('HostName')
        ips = node.get('TailscaleIPs')
        os_name = node.get('OS')
        output.append({'id': node_id, 'hostName': name if isinstance(name, str) else '',
            'dnsName': dns.rstrip('.') if isinstance(dns, str) else '',
            'ips': [ip for ip in ips if isinstance(ip, str)] if isinstance(ips, list) else [],
            'os': os_name.lower() if isinstance(os_name, str) else '',
            'online': node.get('Online') is True, 'self': self})
    self_node = status.get('Self')
    if isinstance(self_node, dict): add(str(self_node.get('PublicKey') or self_node.get('ID') or 'self'), self_node, True)
    nodes = status.get('Peer')
    if isinstance(nodes, dict):
        for node_id, node in nodes.items(): add(node_id, node, False)
    return {'ok': True, 'peers': output}

def tailscale_login():
    prefix = []
    if os.geteuid() != 0:
        try:
            probe = subprocess.run(['sudo', '-n', 'true'], capture_output=True, timeout=10)
        except (OSError, subprocess.SubprocessError):
            probe = None
        if probe is None or probe.returncode != 0:
            return error('tailscale-permission', '当前 SSH 用户没有 root 或免密 sudo 权限，无法安装或登录 Tailscale')
        prefix = ['sudo', '-n']
    login_dir = pathlib.Path.home() / '.kelaodeyun'
    log_path = login_dir / 'tailscale-login.log'
    pid_path = login_dir / 'tailscale-login.pid'
    url_pattern = re.compile(r'https://login\.tailscale\.com/\S+')
    def status():
        try:
            result = subprocess.run(['tailscale', 'status', '--json'],
                capture_output=True, text=True, timeout=10)
            data = json.loads(result.stdout)
            return data if isinstance(data, dict) else None
        except (OSError, ValueError, subprocess.SubprocessError):
            return None
    def auth_url(data):
        url = data.get('AuthURL') if isinstance(data, dict) else None
        if isinstance(url, str) and url_pattern.match(url): return url
        return None
    current = status()
    if current and current.get('BackendState') == 'Running':
        return {'ok': True, 'state': 'running'}
    url = auth_url(current)
    if url: return {'ok': True, 'state': 'needs-login', 'url': url}
    def job_pid():
        try:
            pid = int(pid_path.read_text(encoding='utf-8').strip())
            if pid <= 0: return None
            os.kill(pid, 0)
            return pid
        except PermissionError:
            return pid
        except (OSError, ValueError):
            return None
    job = None
    if job_pid() is None:
        login_dir.mkdir(parents=True, exist_ok=True)
        log_handle = open(log_path, 'w', encoding='utf-8')
        try:
            job = subprocess.Popen(prefix + ['sh', '-c',
                '(command -v tailscale >/dev/null 2>&1 || curl -fsSL https://tailscale.com/install.sh | sh) && tailscale up'],
                stdin=subprocess.DEVNULL, stdout=log_handle, stderr=subprocess.STDOUT,
                start_new_session=True)
        finally:
            log_handle.close()
        pid_path.write_text(str(job.pid), encoding='utf-8')
    def log_tail():
        try:
            return log_path.read_text(encoding='utf-8', errors='replace')[-300:] if log_path.exists() else ''
        except OSError:
            return ''
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        time.sleep(0.5)
        current = status()
        if current:
            if current.get('BackendState') == 'Running':
                return {'ok': True, 'state': 'running'}
            url = auth_url(current)
            if url: return {'ok': True, 'state': 'needs-login', 'url': url}
        match = url_pattern.search(log_tail())
        if match: return {'ok': True, 'state': 'needs-login', 'url': match.group(0)}
        if job is not None:
            code = job.poll()
            if code is not None:
                if code != 0:
                    return error('tailscale-login-failed', log_tail() or 'Tailscale 登录失败')
                job = None
        elif job_pid() is None:
            break
    return {'ok': True, 'state': 'installing' if shutil.which('tailscale') is None else 'starting'}

def prepare():
    target()
    host, username = computer['host'], computer['username']
    label = computer.get('label') or host
    os_name = computer.get('os') or 'unknown'
    if not isinstance(label, str) or not isinstance(os_name, str): raise ValueError('电脑信息无效')
    label = ' '.join(label.splitlines())
    os_name = ' '.join(os_name.splitlines())
    slug = computer_slug(host)
    directory = root / slug
    directory.mkdir(parents=True, exist_ok=True)
    metadata = directory / '.kelaodeyun-computer.json'
    if metadata.exists():
        previous = json.loads(metadata.read_text(encoding='utf-8'))
        if previous.get('host') != host: return error('slug-conflict', '电脑目录名称冲突，请检查已有电脑')
    atomic_write(metadata, json.dumps({'host': host, 'username': username, 'label': label,
        'os': os_name, 'slug': slug}, ensure_ascii=False))
    start, end, bt = '<!-- kelaodeyun:computer:start -->', '<!-- kelaodeyun:computer:end -->', chr(96)
    block = f"""{start}
# 目标电脑：{label}

本目录下的所有开发工作都在远程电脑「{label}」上进行，而不是在当前这台服务器上。

- 连接方式：{bt}ssh {username}@{host}{bt}（已配置免密登录）
- 目标电脑系统：{os_name}
- 读写文件、运行命令、安装依赖、启动服务、执行 git，都通过 ssh 在目标电脑上完成，例如：{bt}ssh {username}@{host} 'cd ~/项目目录 && 命令'{bt}
- 需要编辑文件时，在目标电脑上直接修改（例如通过 ssh 执行脚本、或用 scp 传回修改后的文件）。
- 不要在当前服务器上创建或修改项目代码；本目录只用于存放这份说明和会话记录。
- 如果 ssh 连接失败，先告诉用户，不要改为在当前服务器上继续工作。
{end}"""
    claude = directory / 'CLAUDE.md'
    if not write_block(claude, start, end, block): return error('invalid-markers', 'CLAUDE.md 中的电脑说明标记不完整')
    return {'ok': True, 'root': str(root), 'dir': str(directory), 'slug': slug}

def list_computers():
    computers = []
    if root.exists():
        for file in sorted(root.glob('*/.kelaodeyun-computer.json')):
            try:
                data = json.loads(file.read_text(encoding='utf-8'))
                if isinstance(data, dict):
                    projects = []
                    for project_file in sorted(file.parent.glob('*/.kelaodeyun-project.json')):
                        try:
                            project = json.loads(project_file.read_text(encoding='utf-8'))
                            if isinstance(project, dict) and isinstance(project.get('remotePath'), str):
                                projects.append({'dir': str(project_file.parent), 'remotePath': project['remotePath']})
                        except (OSError, ValueError): continue
                    computers.append({**data, 'dir': str(file.parent), 'projects': projects})
            except (OSError, ValueError): continue
    return {'ok': True, 'root': str(root), 'computers': computers}

def remote_directory(path, listing):
    if str(computer.get('os', '')).lower() == 'windows':
        return error('unsupported', '暂不支持浏览 Windows 电脑的文件夹')
    if not isinstance(path, str) or '\0' in path or '\n' in path or '\r' in path:
        return error('notfound', '目录不存在或无权限')
    script = """p="$1"; [ -n "$p" ] || p="$HOME"; [ "$p" = "~" ] && p="$HOME"
cd "$p" 2>/dev/null || { echo "__ERR__notfound"; exit 3; }
pwd
""" + ("""n=0
for d in .[!.]* ..?* *; do
  [ -d "$d" ] && [ ! -L "$d" ] || continue
  printf '%s\\n' "$d"
  n=$((n+1)); [ "$n" -ge 2000 ] && break
done
exit 0
""" if listing else '')
    try:
        result = subprocess.run(['ssh', *MUX, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
            '-o', 'StrictHostKeyChecking=accept-new', target(), 'sh', '-s', '--', shlex.quote(path)],
            input=script, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.TimeoutExpired):
        return error('unreachable', '无法连接电脑，请检查网络和 SSH 服务')
    if result.returncode == 255 and re.search(r'permission denied|authentication', result.stderr, re.I):
        return error('auth', '需要 SSH 验证')
    if result.returncode == 3 and result.stdout.strip() == '__ERR__notfound':
        return error('notfound', '目录不存在或无权限')
    if result.returncode != 0:
        return error('unreachable', result.stderr.strip()[:300] or '无法连接电脑')
    lines = result.stdout.splitlines()
    if not lines or not lines[0].startswith('/'): return error('unreachable', '无法读取电脑目录')
    return {'ok': True, 'path': lines[0], 'entries': lines[1:2001] if listing else []}

def list_dir():
    return remote_directory(request.get('path', ''), True)

def add_project():
    path = request.get('path')
    if not isinstance(path, str) or not path.startswith('/'):
        return error('notfound', '目录不存在或无权限')
    destination = target()
    host, username = computer['host'], computer['username']
    directory = root / computer_slug(host)
    metadata = directory / '.kelaodeyun-computer.json'
    if not metadata.is_file(): return error('not-prepared', '请先连接目标电脑')
    parent = json.loads(metadata.read_text(encoding='utf-8'))
    if parent.get('host') != host: return error('slug-conflict', '电脑目录名称冲突，请检查已有电脑')
    remote = remote_directory(path, False)
    if not remote['ok']: return remote
    remote_path = remote['path']
    name = re.sub(r'[^A-Za-z0-9._-]', '-', pathlib.PurePosixPath(remote_path).name)
    if name in ('', '.', '..'): name = 'project'
    index = 1
    while True:
        candidate = directory / (name if index == 1 else name + '-' + str(index))
        project_metadata = candidate / '.kelaodeyun-project.json'
        if not candidate.exists() and not candidate.is_symlink():
            candidate.mkdir()
            break
        try:
            previous = json.loads(project_metadata.read_text(encoding='utf-8'))
            if not candidate.is_symlink() and previous.get('remotePath') == remote_path:
                break
        except (OSError, ValueError): pass
        index += 1
    label = parent.get('label') or host
    start, end, bt = '<!-- kelaodeyun:project:start -->', '<!-- kelaodeyun:project:end -->', chr(96)
    remote_command = shlex.quote('cd ' + shlex.quote(remote_path) + ' && 命令')
    block = f"""{start}
# 项目目录：{remote_path}

本项目对应远程电脑「{label}」上的目录 {bt}{remote_path}{bt}。所有读写、命令、git 操作都在这个目录里通过 ssh 完成，例如：{bt}ssh {destination} {remote_command}{bt}
{end}"""
    if not write_block(candidate / 'CLAUDE.md', start, end, block):
        return error('invalid-markers', 'CLAUDE.md 中的项目说明标记不完整')
    atomic_write(project_metadata, json.dumps({'remotePath': remote_path, 'host': host, 'username': username}, ensure_ascii=False))
    return {'ok': True, 'dir': str(candidate), 'name': candidate.name, 'remotePath': remote_path}

try:
    actions = {'computer-list': list_computers, 'computer-peers': peers,
        'computer-tailscale-login': tailscale_login,
        'computer-probe': probe, 'computer-install-key': install_key, 'computer-prepare': prepare,
        'computer-list-dir': list_dir, 'computer-add-project': add_project}
    result = actions[operation]() if operation in actions else error('invalid-operation', '操作无效')
except (OSError, ValueError, subprocess.SubprocessError, KeyError):
    result = error('operation-failed', '电脑配置失败，请检查服务器环境')
print(json.dumps(result, ensure_ascii=False))
`;
