// Directory handles prevent uploads from following symlinks outside the selected cloud folder.
export const SSH_FILE_OPERATION_SCRIPT = String.raw`
import base64, json, os, sys, uuid
request = json.load(sys.stdin)
parts = request['relativePath'].split('/')
if not parts or any(p in ('', '.', '..') or '\\' in p or '\x00' in p for p in parts):
    raise ValueError('Invalid relative path')
root = request['cwd']
if not os.path.isabs(root):
    raise ValueError('Workspace must be an absolute path')
operation = request['operation']
if operation not in ('upload', 'mkdir'):
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
        try:
            os.mkdir(part, 0o755, dir_fd=fd)
        except FileExistsError:
            pass
        child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
        os.close(fd)
        fd = child
    name = parts[-1]
    if operation == 'mkdir':
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
