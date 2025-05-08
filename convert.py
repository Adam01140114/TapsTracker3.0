import os
from pathlib import Path
from pillow_heif import register_heif_opener
from PIL import Image

# Register HEIC format with Pillow
register_heif_opener()

# Input and output folders
input_folder = Path("input_heic")
output_folder = Path("output_jpg")
output_folder.mkdir(exist_ok=True)

# Convert all .HEIC files in the input folder
count = 0
for file in input_folder.glob("*.HEIC"):
    try:
        with Image.open(file) as img:
            output_path = output_folder / (file.stem + ".jpg")
            img.convert("RGB").save(output_path, "JPEG")
            print(f"✔ Converted: {file.name} → {output_path.name}")
            count += 1
    except Exception as e:
        print(f"✖ Error converting {file.name}: {e}")

print(f"\nDone. {count} images converted.")
