#!/usr/bin/env python3
import os
import json
from PIL import Image, ImageDraw

def main():
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    source_icon_path = os.path.join(root_dir, "NewSparrow.png")
    
    if not os.path.exists(source_icon_path):
        print(f"Error: Source icon not found at {source_icon_path}")
        return

    print(f"Loading source icon: {source_icon_path}")
    im = Image.open(source_icon_path)
    print(f"Original size: {im.size}, mode: {im.mode}")

    # Crop to the actual 800x800 card bounds to remove empty transparent padding
    im = im.crop((110, 119, 910, 919))
    print(f"Cropped icon size: {im.size}")

    resample = getattr(Image, 'Resampling', Image).LANCZOS

    # 1. Frontend UI Assets
    frontend_assets_dir = os.path.join(os.path.dirname(__file__), "src", "assets", "images")
    os.makedirs(frontend_assets_dir, exist_ok=True)
    
    logo_icon_path = os.path.join(frontend_assets_dir, "logo-icon.png")
    icon_path = os.path.join(frontend_assets_dir, "icon.png")

    # Save 512x512 high-res icons for UI & general asset usage
    im_512 = im.resize((512, 512), resample)
    im_512.save(logo_icon_path, "PNG")
    print(f"Updated: {logo_icon_path}")
    im_512.save(icon_path, "PNG")
    print(f"Updated: {icon_path}")

    # Helper for circular icon
    def make_circular(image, size):
        im_resized = image.resize((size, size), resample).convert("RGBA")
        mask = Image.new("L", (size * 4, size * 4), 0)
        draw = ImageDraw.Draw(mask)
        draw.ellipse((0, 0, size * 4, size * 4), fill=255)
        mask = mask.resize((size, size), resample)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(im_resized, (0, 0), mask=mask)
        return out

    # 2. Android Launcher Icons
    android_res_dir = os.path.join(os.path.dirname(__file__), "android", "app", "src", "main", "res")
    android_sizes = {
        "mipmap-ldpi": 36,
        "mipmap-mdpi": 48,
        "mipmap-hdpi": 72,
        "mipmap-xhdpi": 96,
        "mipmap-xxhdpi": 144,
        "mipmap-xxxhdpi": 192,
    }

    for folder, size in android_sizes.items():
        folder_path = os.path.join(android_res_dir, folder)
        os.makedirs(folder_path, exist_ok=True)
        
        square_path = os.path.join(folder_path, "heyroute_icon.png")
        round_path = os.path.join(folder_path, "heyroute_icon_round.png")
        
        # Save square icon
        im_resized = im.resize((size, size), resample)
        im_resized.save(square_path, "PNG")
        print(f"Updated Android [{folder}]: {square_path} ({size}x{size})")
        
        # Save round icon
        im_round = make_circular(im, size)
        im_round.save(round_path, "PNG")
        print(f"Updated Android round [{folder}]: {round_path} ({size}x{size})")

    # 3. iOS Launcher Icons
    ios_iconset_dir = os.path.join(os.path.dirname(__file__), "ios", "heyroute", "Images.xcassets", "AppIcon.appiconset")
    os.makedirs(ios_iconset_dir, exist_ok=True)

    ios_icons = [
        {"filename": "icon-20@2x.png", "idiom": "iphone", "scale": "2x", "size": "20x20", "px": 40},
        {"filename": "icon-20@3x.png", "idiom": "iphone", "scale": "3x", "size": "20x20", "px": 60},
        {"filename": "icon-29@2x.png", "idiom": "iphone", "scale": "2x", "size": "29x29", "px": 58},
        {"filename": "icon-29@3x.png", "idiom": "iphone", "scale": "3x", "size": "29x29", "px": 87},
        {"filename": "icon-40@2x.png", "idiom": "iphone", "scale": "2x", "size": "40x40", "px": 80},
        {"filename": "icon-40@3x.png", "idiom": "iphone", "scale": "3x", "size": "40x40", "px": 120},
        {"filename": "icon-60@2x.png", "idiom": "iphone", "scale": "2x", "size": "60x60", "px": 120},
        {"filename": "icon-60@3x.png", "idiom": "iphone", "scale": "3x", "size": "60x60", "px": 180},
        {"filename": "icon-1024.png", "idiom": "ios-marketing", "scale": "1x", "size": "1024x1024", "px": 1024},
    ]

    images_entry = []
    for icon_spec in ios_icons:
        px = icon_spec["px"]
        filename = icon_spec["filename"]
        out_path = os.path.join(ios_iconset_dir, filename)
        
        im_resized = im.resize((px, px), resample)
        im_resized.save(out_path, "PNG")
        print(f"Updated iOS AppIcon: {filename} ({px}x{px})")
        
        images_entry.append({
            "filename": filename,
            "idiom": icon_spec["idiom"],
            "scale": icon_spec["scale"],
            "size": icon_spec["size"],
        })

    contents_json_path = os.path.join(ios_iconset_dir, "Contents.json")
    contents_data = {
        "images": images_entry,
        "info": {
            "author": "xcode",
            "version": 1
        }
    }

    with open(contents_json_path, "w", encoding="utf-8") as f:
        json.dump(contents_data, f, indent=2)
    print(f"Updated iOS Contents.json: {contents_json_path}")

    print("Icon generation completed successfully!")

if __name__ == "__main__":
    main()
