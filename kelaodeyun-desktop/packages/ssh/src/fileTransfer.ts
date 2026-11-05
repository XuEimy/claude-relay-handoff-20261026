// Directory handles prevent uploads from following symlinks outside the selected cloud folder.
export const SSH_FILE_OPERATION_SCRIPT = String.raw`
import base64, io, json, os, stat, sys, uuid, zipfile
request = json.load(sys.stdin)
operation = request['operation']
parts = request['relativePath'].split('/')
if not (operation == 'download-directory' and parts == ['.']) and (not parts or any(p in ('', '.', '..') or '\\' in p or '\x00' in p for p in parts)):
    raise ValueError('Invalid relative path')
root = request['cwd']
if not os.path.isabs(root):
    raise ValueError('Workspace must be an absolute path')
operation = request['operation']
if operation not in ('upload', 'mkdir', 'download', 'download-directory'):
    raise ValueError('Unsupported file operation')
data = None
if operation == 'upload':
    encoded = request.get('contentsBase64', '')
    if len(encoded) > 44739244:
        raise ValueError('File exceeds 32 MiB')
    data = base64.b64decode(encoded, validate=True)
    if len(data) > 33554432:
        raise ValueError('File exceeds 32 MiB')
fd = os.open(os.path.realpath(root), os.O_RDONLY | os.O_DIRECTORY)
try:
    for part in parts[:-1]:
        if operation not in ('download', 'download-directory'):
            try:
                os.mkdir(part, 0o755, dir_fd=fd)
            except FileExistsError:
                pass
        child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
        os.close(fd)
        fd = child
    name = parts[-1]
    if operation == 'download-directory':
        directory_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
        archive_root = os.path.basename(os.path.normpath(root)) if name == '.' else name
        archive_root = archive_root or 'workspace'
        output = io.BytesIO()
        total = 0
        count = 0
        try:
            with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
                def fail_walk(error):
                    raise error
                for current, dirs, files, current_fd in os.fwalk('.', dir_fd=directory_fd, follow_symlinks=False, onerror=fail_walk):
                    relative = os.path.relpath(current, '.')
                    prefix = archive_root + ('/' + relative if relative != '.' else '')
                    count += 1
                    if count > 10000:
                        raise ValueError('Folder contains too many entries')
                    archive.writestr(prefix + '/', b'')
                    for child in dirs:
                        if stat.S_ISLNK(os.stat(child, dir_fd=current_fd, follow_symlinks=False).st_mode):
                            raise ValueError('Folder contains symbolic links')
                    for child in files:
                        count += 1
                        if count > 10000:
                            raise ValueError('Folder contains too many entries')
                        source = os.open(child, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=current_fd)
                        with os.fdopen(source, 'rb') as stream:
                            info = os.fstat(stream.fileno())
                            if not stat.S_ISREG(info.st_mode):
                                raise ValueError('Folder contains non-regular files')
                            if total + info.st_size > 33554432:
                                raise ValueError('Folder exceeds 32 MiB')
                            data = stream.read(33554433 - total)
                        total += len(data)
                        if total > 33554432:
                            raise ValueError('Folder exceeds 32 MiB')
                        archive.writestr(prefix + '/' + child, data)
            data = output.getvalue()
            if len(data) > 33554432:
                raise ValueError('Archive exceeds 32 MiB')
            print(json.dumps({'contentsBase64': base64.b64encode(data).decode('ascii')}))
        finally:
            os.close(directory_fd)
    elif operation == 'download':
        source = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        with os.fdopen(source, 'rb') as stream:
            info = os.fstat(stream.fileno())
            if not stat.S_ISREG(info.st_mode):
                raise ValueError('Only regular files can be downloaded')
            if info.st_size > 33554432:
                raise ValueError('File exceeds 32 MiB')
            data = stream.read(33554433)
            if len(data) > 33554432:
                raise ValueError('File exceeds 32 MiB')
        print(json.dumps({'contentsBase64': base64.b64encode(data).decode('ascii')}))
    elif operation == 'mkdir':
        os.mkdir(name, 0o755, dir_fd=fd)
    else:
        temporary = '.kelaodeyun-upload-' + uuid.uuid4().hex
        tempfd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600, dir_fd=fd)
        try:
            with os.fdopen(tempfd, 'wb') as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.link(temporary, name, src_dir_fd=fd, dst_dir_fd=fd, follow_symlinks=False)
        finally:
            os.unlink(temporary, dir_fd=fd)
finally:
    os.close(fd)
`;
