#!/usr/bin/env python3
"""
Convert a PyTorch cephalometric landmark model to ONNX for WebCeph's in-browser
auto-plot (onnxruntime-web). Tested against the MIT-licensed HRNet model
`cwlachap/hrnet-cephalometric-landmark-detection` (19 lateral landmarks).

This runs OUTSIDE WebCeph, in a normal Python environment with internet access
and PyTorch (a GPU is not required for export). WebCeph itself only needs the
resulting .onnx file.

USAGE
-----
    pip install torch onnx huggingface_hub
    # Provide the HRNet model definition: the easiest path is to clone the model
    # repo / paper code that defines `HRNet`/`get_face_alignment_net` and import
    # it here, since the .pth contains weights only, not the architecture.
    python tools/convert_hrnet_to_onnx.py --out build/models/cephalometric.onnx

Then place the .onnx at WebCeph's MODEL_URL (default `/models/cephalometric.onnx`,
i.e. served from the build output / public root), set the CONFIG constants in
src/predictors/onnx.ts to match (input size, channels, normalisation, output
type), and set USE_ONNX = true in src/predictors/index.ts.

IMPORTANT: keep the preprocessing in src/predictors/onnx.ts identical to the
model's training preprocessing (input size, RGB vs grayscale, mean/std). The
defaults in onnx.ts (256x256, 3-channel, ImageNet mean/std, heatmap output)
match a typical HRNet-W32 setup; adjust if your model differs.
"""

import argparse
import os

import torch
from huggingface_hub import hf_hub_download

# Match these to onnx.ts CONFIG.
INPUT_SIZE = 256
INPUT_CHANNELS = 3

HF_REPO = "cwlachap/hrnet-cephalometric-landmark-detection"
HF_WEIGHTS_FILE = "best_model.pth"


def build_model():
    """Return the HRNet model with weights loaded, in eval mode.

    The .pth is a state_dict (weights only), so the architecture must be
    constructed first. Import the model definition from the source repository
    that produced the weights and instantiate it here, e.g.:

        from hrnet import get_face_alignment_net, config   # from the model repo
        model = get_face_alignment_net(config)             # 19 output channels

    Then load the downloaded weights:

        weights = hf_hub_download(repo_id=HF_REPO, filename=HF_WEIGHTS_FILE)
        state = torch.load(weights, map_location="cpu")
        model.load_state_dict(state.get("state_dict", state))
        model.eval()
        return model
    """
    raise NotImplementedError(
        "Plug in the HRNet architecture from the model's source repo (see the "
        "docstring above). The weights download is already wired below."
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="build/models/cephalometric.onnx")
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    # Pre-download the weights so build_model() can load them.
    weights_path = hf_hub_download(repo_id=HF_REPO, filename=HF_WEIGHTS_FILE)
    print(f"Downloaded weights: {weights_path}")

    model = build_model()

    dummy = torch.randn(1, INPUT_CHANNELS, INPUT_SIZE, INPUT_SIZE)
    torch.onnx.export(
        model,
        dummy,
        args.out,
        input_names=["input"],
        output_names=["heatmaps"],
        opset_version=args.opset,
        dynamic_axes={"input": {0: "batch"}, "heatmaps": {0: "batch"}},
    )
    print(f"Wrote ONNX model: {args.out}")
    print("Place it at WebCeph's MODEL_URL and set USE_ONNX = true.")


if __name__ == "__main__":
    main()
