import base64
import io
import sys
from pathlib import Path

from PIL import Image, ImageFilter

root = Path(__file__).resolve().parent.parent
assets = root / "assets" / "agent-cloud-os"
public = root / "apps" / "web" / "public"
check = "--check" in sys.argv
source = Image.open(assets / "app-icon-source.png").convert("RGBA")
body = source.crop(source.getbbox())


def png(image):
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=False)
    return output.getvalue()


def write(path, contents):
    if check:
        if not path.exists() or path.read_bytes() != contents:
            raise SystemExit(f"Regenerate product icons: {path}")
    else:
        path.write_bytes(contents)


resample = Image.Resampling.LANCZOS
icon_body = body.resize((824, 824), resample)
shadow_mask = Image.new("L", (1024, 1024))
shadow_mask.paste(icon_body.getchannel("A").point(lambda alpha: round(alpha * 0.33)), (100, 112))
shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(24))
icon = Image.new("RGBA", (1024, 1024))
icon.paste(Image.new("RGBA", (1024, 1024), (0, 0, 0, 255)), (0, 0), shadow_mask)
icon.alpha_composite(icon_body, (100, 100))
write(assets / "app-icon-1024.png", png(icon))

for name, size in (("apple-touch-icon.png", 180), ("favicon-16x16.png", 16), ("favicon-32x32.png", 32)):
    contents = png(body.resize((size, size), resample))
    write(assets / name, contents)
    write(public / name, contents)

for name, sizes in (
    ("favicon.ico", (16, 32, 48)),
    ("app-icon.ico", (16, 24, 32, 48, 64, 128, 256)),
):
    output = io.BytesIO()
    body.save(output, format="ICO", sizes=[(size, size) for size in sizes])
    contents = output.getvalue()
    write(assets / name, contents)
    if name == "favicon.ico":
        write(public / name, contents)

encoded = base64.b64encode(png(body)).decode("ascii")
svg = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">'
    f'<image width="600" height="600" href="data:image/png;base64,{encoded}"/></svg>\n'
)
write(assets / "app-icon.svg", svg.encode())
