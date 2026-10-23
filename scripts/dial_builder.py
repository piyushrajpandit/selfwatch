import os
import json
import zipfile
import shutil
import cv2
import numpy as np

OUTPUT_DIR = "/Users/piyushraj/.gemini/antigravity-ide/scratch/noisefit-custom/scripts/custom_dial_pkg"
INPUT_WALLPAPER = "/Users/piyushraj/.gemini/antigravity-ide/scratch/noisefit-custom/client/wallpaper_watch.png"
OUTPUT_ZIP = "/Users/piyushraj/.gemini/antigravity-ide/scratch/noisefit-custom/scripts/custom_wallpaper.dial"

def convert_to_rgb565(img):
    """Converts a standard BGR image into 16-bit RGB565 byte array (used by ATS3085S / PersimWear displays)."""
    b = (img[:, :, 0] >> 3).astype(np.uint16)
    g = (img[:, :, 1] >> 2).astype(np.uint16)
    r = (img[:, :, 2] >> 3).astype(np.uint16)
    rgb565 = (r << 11) | (g << 5) | b
    return rgb565.tobytes()

def build_dial_package():
    print(f"[*] Loading wallpaper from: {INPUT_WALLPAPER}")
    if not os.path.exists(INPUT_WALLPAPER):
        print(f"Error: {INPUT_WALLPAPER} not found!")
        return

    # Create build directory
    if os.path.exists(OUTPUT_DIR):
        shutil.rmtree(OUTPUT_DIR)
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    img = cv2.imread(INPUT_WALLPAPER)
    h, w, _ = img.shape
    print(f"[*] Image Resolution: {w}x{h}")

    # 1. Generate preview bitmap (150x150)
    preview = cv2.resize(img, (150, 150), interpolation=cv2.INTER_AREA)
    cv2.imwrite(os.path.join(OUTPUT_DIR, "preview.png"), preview)
    cv2.imwrite(os.path.join(OUTPUT_DIR, "preview_0565.bmp"), preview)

    # 2. Save background image
    cv2.imwrite(os.path.join(OUTPUT_DIR, "background.png"), img)
    with open(os.path.join(OUTPUT_DIR, "background.bin"), "wb") as f:
        f.write(convert_to_rgb565(img))

    # 3. Copy sample fonts from decompiled template if available
    template_dir = "/Users/piyushraj/.gemini/antigravity-ide/scratch/noisefit-custom/decompiled_app/resources/assets/video/firmware"
    for item in ["Date", "Time", "Week"]:
        src_path = os.path.join(template_dir, item)
        dst_path = os.path.join(OUTPUT_DIR, item)
        if os.path.exists(src_path):
            shutil.copytree(src_path, dst_path)

    # 4. Generate dial.json
    dial_manifest = {
        "frame_version": 1,
        "dial_version": 1,
        "name": "custom_wallpaper",
        "preview": "preview_0565.bmp",
        "dial_type": 1,
        "resolution_ratio": f"{w}x{h}",
        "platform": "ats3085s",
        "size": 300,
        "compress_size": 0,
        "enable_pic_compress": 0,
        "describe_name": "custom_wallpaper",
        "item": [
            {
                "widget": "image",
                "type": "background",
                "x": 0,
                "y": 0,
                "w": w,
                "h": h,
                "img": "background"
            },
            {
                "widget": "text",
                "type": "time",
                "serial_number": 13,
                "x": int(w * 0.15),
                "y": 40,
                "w": int(w * 0.7),
                "h": 60,
                "fontnum": 11,
                "font": "Time",
                "enable_font": 0,
                "min_numwidth": 2,
                "align": "center",
                "color": "#00F2FE"
            },
            {
                "widget": "text",
                "type": "day",
                "serial_number": 3,
                "x": int(w * 0.25),
                "y": 105,
                "w": 60,
                "h": 30,
                "fontnum": 10,
                "font": "Date",
                "enable_font": 0,
                "min_numwidth": 2,
                "align": "center",
                "color": "#FFFFFF"
            }
        ]
    }

    with open(os.path.join(OUTPUT_DIR, "dial.json"), "w") as f:
        json.dump(dial_manifest, f, indent=2)

    # 5. Generate file.json
    file_manifest = {
        "item": [
            {"name": "Date", "format": "png"},
            {"name": "Time", "format": "png"}
        ]
    }
    with open(os.path.join(OUTPUT_DIR, "file.json"), "w") as f:
        json.dump(file_manifest, f, indent=2)

    # 6. Package into .dial zip archive
    print(f"[*] Packaging into {OUTPUT_ZIP}...")
    with zipfile.ZipFile(OUTPUT_ZIP, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(OUTPUT_DIR):
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, OUTPUT_DIR)
                zipf.write(full_path, rel_path)

    print(f"[✅] Custom Watch Face Package Built Successfully!")
    print(f"    File: {OUTPUT_ZIP} ({os.path.getsize(OUTPUT_ZIP)} bytes)")

if __name__ == "__main__":
    build_dial_package()
