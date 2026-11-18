import os
import shutil
from PIL import Image, ImageDraw, ImageFilter

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SOURCE_DIR = os.path.join(REPO_ROOT, 'design', 'source')
PUBLIC_BRAND = os.path.join(REPO_ROOT, 'public', 'brand')
ANDROID_RES = os.path.join(REPO_ROOT, 'android', 'app', 'src', 'main', 'res')

os.makedirs(SOURCE_DIR, exist_ok=True)
os.makedirs(PUBLIC_BRAND, exist_ok=True)

src_logo_path = os.path.join(SOURCE_DIR, 'bq-sqwad-tv-logo.png')
if not os.path.exists(src_logo_path):
    existing_logo = os.path.join(PUBLIC_BRAND, 'bq-sqwad-tv-logo.png')
    if os.path.exists(existing_logo):
        shutil.copyfile(existing_logo, src_logo_path)

logo_img = Image.open(src_logo_path).convert('RGBA')
w, h = logo_img.size

# Function to create linear gradient background
def create_gradient(width, height, c1=(10, 17, 40), c2=(0, 31, 84)):
    base = Image.new('RGBA', (width, height), c1)
    top = Image.new('RGBA', (width, height), c2)
    mask = Image.new('L', (width, height))
    for y in range(height):
        for x in range(width):
            # diagonal gradient
            val = int(255 * ((x / width + y / height) / 2))
            mask.putpixel((x, y), min(255, max(0, val)))
    base.paste(top, (0, 0), mask)
    return base

# 1. Square Icon Mark (512x512)
icon_mark = create_gradient(512, 512, (8, 14, 34), (0, 40, 110))
# Place scaled logo centered with padding
ratio = min(400 / w, 400 / h)
new_w, new_h = int(w * ratio), int(h * ratio)
scaled_logo = logo_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
paste_x = (512 - new_w) // 2
paste_y = (512 - new_h) // 2
icon_mark.paste(scaled_logo, (paste_x, paste_y), scaled_logo)
icon_mark.save(os.path.join(PUBLIC_BRAND, 'icon-mark.png'))

# 2. Horizontal Logo
logo_hz = logo_img.copy()
logo_hz.save(os.path.join(PUBLIC_BRAND, 'logo-horizontal.png'))

# 3. Splash image (1080x1920)
splash = create_gradient(1080, 1920, (5, 10, 24), (0, 31, 84))
s_ratio = min(800 / w, 600 / h)
s_w, s_h = int(w * s_ratio), int(h * s_ratio)
s_scaled = logo_img.resize((s_w, s_h), Image.Resampling.LANCZOS)
splash.paste(s_scaled, ((1080 - s_w) // 2, 600), s_scaled)

# Add spinner ring placeholder and text
draw = ImageDraw.Draw(splash)
# Spinner ring
draw.ellipse([490, 1200, 590, 1300], outline=(0, 210, 255, 200), width=4)
splash.save(os.path.join(PUBLIC_BRAND, 'splash.png'))

# 4. Open Graph Image (1200x630)
og_img = create_gradient(1200, 630, (8, 14, 34), (0, 50, 130))
og_ratio = min(900 / w, 450 / h)
og_w, og_h = int(w * og_ratio), int(h * og_ratio)
og_scaled = logo_img.resize((og_w, og_h), Image.Resampling.LANCZOS)
og_img.paste(og_scaled, ((1200 - og_w) // 2, (630 - og_h) // 2), og_scaled)
og_img.save(os.path.join(PUBLIC_BRAND, 'og-image.png'))

# 5. Favicon set
for size in [16, 32, 48, 180, 192, 512]:
    resized = icon_mark.resize((size, size), Image.Resampling.LANCZOS)
    if size == 180:
        resized.save(os.path.join(PUBLIC_BRAND, 'apple-touch-icon.png'))
    elif size in (192, 512):
        resized.save(os.path.join(PUBLIC_BRAND, f'icon-{size}.png'))
    else:
        resized.save(os.path.join(PUBLIC_BRAND, f'favicon-{size}.png'))

icon_mark.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(PUBLIC_BRAND, 'icon-512-maskable.png'))
icon_mark.resize((32, 32), Image.Resampling.LANCZOS).save(os.path.join(REPO_ROOT, 'public', 'favicon.ico'))

# 6. Android assets
nodpi = os.path.join(ANDROID_RES, 'drawable-nodpi')
os.makedirs(nodpi, exist_ok=True)
icon_mark.save(os.path.join(nodpi, 'bq_sqwad_tv_mark.png'))
splash.resize((540, 960), Image.Resampling.LANCZOS).save(os.path.join(nodpi, 'splash_logo.png'))

for density, px in [('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)]:
    d_dir = os.path.join(ANDROID_RES, f'mipmap-{density}')
    os.makedirs(d_dir, exist_ok=True)
    icon_mark.resize((px, px), Image.Resampling.LANCZOS).save(os.path.join(d_dir, 'ic_launcher.png'))
    icon_mark.resize((px, px), Image.Resampling.LANCZOS).save(os.path.join(d_dir, 'ic_launcher_round.png'))

print("Brand assets built successfully!")
