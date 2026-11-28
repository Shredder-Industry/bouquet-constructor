"""Generate flower photos locally (free) with SDXL-Turbo on Apple Silicon and cut the background with rembg.

Each flower is generated with several seeds; the kept variant is the largest one whose cutout does not touch
the frame edge (Turbo often crops the bloom).

Usage:
  ~/.venvs/flowers/bin/python tools/gen_flowers.py OUT_DIR key "description" [key "description" ...]
  ~/.venvs/flowers/bin/python tools/gen_flowers.py --cut OUT_DIR image.png [image.png ...]   # only cut backgrounds
Writes OUT_DIR/<key>.png (transparent cutout) and OUT_DIR/raw/<key>_side.png (white background).
"""
import sys
from pathlib import Path

from PIL import Image
from rembg import remove

MODEL_ID = "stabilityai/sdxl-turbo"  # SDXL base 1.0 ran a 16 GB Mac out of memory
STEPS = 4
SIZE = 512  # turbo is trained at 512; larger frames crop the flower
SEEDS = (1, 2, 3)
EDGE_MARGIN = 6  # px of empty space required around the cutout
ALPHA_SOLID = 32
PROMPT = ("{desc}, whole stem shown small in the middle of the frame with lots of white space around it, "
          "photographed from a distance, side view, realistic studio product photo, soft daylight, "
          "isolated on a plain pure white background")


def fits_frame(cut: Image.Image) -> tuple[bool, int]:
    """Whether the cutout keeps EDGE_MARGIN from the top and sides, and its bounding-box area.
    The bottom is free: stems may run off it, they end inside the wrap anyway."""
    box = cut.getchannel("A").point(lambda a: 255 if a > ALPHA_SOLID else 0).getbbox()
    if not box:
        return False, 0
    x0, y0, x1, y1 = box
    w = cut.width
    inside = x0 >= EDGE_MARGIN and y0 >= EDGE_MARGIN and x1 <= w - EDGE_MARGIN
    return inside, (x1 - x0) * (y1 - y0)


def generate(out: Path, pairs: list[tuple[str, str]]) -> None:
    import torch
    from diffusers import AutoPipelineForText2Image

    pipe = AutoPipelineForText2Image.from_pretrained(MODEL_ID, torch_dtype=torch.float16, variant="fp16").to("mps")
    pipe.enable_attention_slicing()
    for key, desc in pairs:
        best = None  # (inside, area, image, cut)
        for seed in SEEDS:
            image = pipe(prompt=PROMPT.format(desc=desc), num_inference_steps=STEPS, guidance_scale=0.0,
                         width=SIZE, height=SIZE, generator=torch.Generator("cpu").manual_seed(seed)).images[0]
            cut = remove(image)
            inside, area = fits_frame(cut)
            # prefer a variant that fits; among those the biggest, otherwise the smallest (least cropped)
            score = (inside, area if inside else -area)
            if best is None or score > best[:2]:
                best = (score[0], score[1], image, cut)
        best[2].save(out / "raw" / f"{key}_side.png")
        best[3].save(out / f"{key}.png")
        print("done", key, "fits" if best[0] else "CROPPED", flush=True)


def cut_only(out: Path, files: list[str]) -> None:
    for f in files:
        key = Path(f).stem.removesuffix("_side")
        remove(Image.open(f)).save(out / f"{key}.png")
        print("cut", key, flush=True)


def main(argv: list[str]) -> None:
    if argv[:1] == ["--cut"] and len(argv) >= 3:
        out = Path(argv[1])
        out.mkdir(parents=True, exist_ok=True)
        cut_only(out, argv[2:])
        return
    if len(argv) < 3 or len(argv) % 2 == 0:
        sys.exit(__doc__)
    out = Path(argv[0])
    (out / "raw").mkdir(parents=True, exist_ok=True)
    generate(out, list(zip(argv[1::2], argv[2::2])))


if __name__ == "__main__":
    main(sys.argv[1:])
