"""Keep the car/glass roots from a downloaded Khronos CC0 ToyCar GLB.

Usage: python3 prepare-model.py /path/to/original/ToyCar.glb
Geometry, textures and materials remain unchanged; the display cloth and sample
cameras are excluded from the active scene. No runtime-specific mesh hiding.
"""

import json
from pathlib import Path
import struct
import sys

source = Path(sys.argv[1]).read_bytes()
json_length = struct.unpack_from("<I", source, 12)[0]
document = json.loads(source[20:20 + json_length])
for scene in document["scenes"]:
    scene["nodes"] = [index for index in scene["nodes"]
                      if "mesh" in document["nodes"][index]
                      and document["nodes"][index].get("name") != "Fabric"]
payload = json.dumps(document, separators=(",", ":")).encode()
payload += b" " * (-len(payload) % 4)
binary = source[20 + json_length:]
result = struct.pack("<III", 0x46546C67, 2, 20 + len(payload) + len(binary))
result += struct.pack("<II", len(payload), 0x4E4F534A) + payload + binary
Path(__file__).with_name("ToyCar.glb").write_bytes(result)
