"""Generate the demo's original, CC0 studio environment (no external images)."""

import math
from pathlib import Path

width, height = 512, 256
output = bytearray(f"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {height} +X {width}\n".encode())
for y in range(height):
    row = []
    latitude = math.pi * (0.5 - (y + 0.5) / height)
    for x in range(width):
        longitude = 2 * math.pi * ((x + 0.5) / width - 0.5)
        value = 0.12 + 0.28 * max(0, math.sin(latitude))
        # Three broad softboxes create readable reflections on curved materials.
        for center, elevation, strength, spread in [(-1.2, 0.6, 5, 0.22), (1.6, 0.4, 3, 0.3), (0, 1.2, 2, 0.45)]:
            delta = (longitude - center + math.pi) % (2 * math.pi) - math.pi
            value += strength * math.exp(-((delta / spread) ** 6 + ((latitude - elevation) / 0.4) ** 6))
        rgb = [value, value * 0.97, value * 0.92]
        mantissa, exponent = math.frexp(max(rgb))
        scale = mantissa * 256 / max(rgb)
        row.append([int(channel * scale) for channel in rgb] + [exponent + 128])
    output.extend([2, 2, width >> 8, width & 255])
    for channel in range(4):
        for start in range(0, width, 127):
            values = [pixel[channel] for pixel in row[start:start + 127]]
            output.extend([len(values), *values])

Path(__file__).with_name("studio.hdr").write_bytes(output)
