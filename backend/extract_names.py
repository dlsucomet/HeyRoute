import json
import os
import re

GEOJSON_PATH = r"C:\Users\User\Downloads\hotosm_phl_roads_lines_geojson\hotosm_phl_roads_lines_geojson.geojson"
OUTPUT_PATH = r"C:\School\OJT\HeyRoute\backend\philippine_roads.json"

def extract_names():
    print(f"Starting extraction from {GEOJSON_PATH}...")
    
    unique_names = set()
    
    # We read line by line because the file is 1GB. Loading it all into RAM with json.load() might crash.
    # The user's snippet showed that features are often on single lines.
    # We will use a regex to safely extract the 'name', 'name:en', and 'name:fil' properties.
    name_pattern = re.compile(r'"name":\s*"([^"]+)"')
    name_en_pattern = re.compile(r'"name:en":\s*"([^"]+)"')
    name_fil_pattern = re.compile(r'"name:fil":\s*"([^"]+)"')
    
    try:
        with open(GEOJSON_PATH, 'r', encoding='utf-8') as f:
            for line in f:
                # Find all matches in the line
                for match in name_pattern.finditer(line):
                    name = match.group(1).strip()
                    if name and name.lower() != "null":
                        unique_names.add(name)
                        
                for match in name_en_pattern.finditer(line):
                    name = match.group(1).strip()
                    if name and name.lower() != "null":
                        unique_names.add(name)
                        
                for match in name_fil_pattern.finditer(line):
                    name = match.group(1).strip()
                    if name and name.lower() != "null":
                        unique_names.add(name)
                        
    except FileNotFoundError:
        print(f"Error: Could not find the file at {GEOJSON_PATH}")
        return
        
    print(f"Extraction complete! Found {len(unique_names)} unique road names.")
    
    # Sort them alphabetically for a clean output
    sorted_names = sorted(list(unique_names))
    
    # Save to a lightweight JSON array
    print(f"Saving to {OUTPUT_PATH}...")
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as out_f:
        json.dump(sorted_names, out_f, ensure_ascii=False, indent=4)
        
    print(f"Successfully saved {len(sorted_names)} road names to {OUTPUT_PATH}")
    print(f"File size: {os.path.getsize(OUTPUT_PATH) / 1024:.2f} KB")

if __name__ == "__main__":
    extract_names()
