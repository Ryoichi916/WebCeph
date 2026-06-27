#!/usr/bin/env python3
"""
Convert the MIT-licensed HRNet cephalometric landmark model to ONNX for
WebCeph's in-browser auto-plot (onnxruntime-web).

Model: cwlachap/hrnet-cephalometric-landmark-detection (HRNet-W32, 19 lateral
landmarks, heatmap regression, 768x768 input -> 192x192 heatmaps). The HRNet
architecture below is vendored verbatim from the model's own source repo
(https://github.com/cwlachap/hrnet-cephalometric-landmark-detection,
src/model_hrnet.py) so the .pth state_dict loads exactly. MIT is compatible
with WebCeph's GPL-3 license.

This runs OUTSIDE WebCeph, in a normal Python environment with internet access
to huggingface.co and PyTorch (a GPU is not required for export). WebCeph
itself only needs the resulting .onnx file.

USAGE
-----
    pip install torch onnx huggingface_hub
    python tools/convert_hrnet_to_onnx.py --out build/models/cephalometric.onnx

Then place the .onnx at WebCeph's MODEL_URL (default `/models/cephalometric.onnx`,
served from the build output / public root) and set USE_ONNX = true in
src/predictors/index.ts. The preprocessing/decoding in src/predictors/onnx.ts is
already matched to this model (768 letterbox input, ImageNet normalisation,
soft-argmax over 192x192 heatmaps); do not change it without retraining.

NOTE: huggingface.co must be reachable from wherever you run this. WebCeph's
hosted/CI sandboxes may block it by network policy — run this on a machine with
open egress, then commit/serve the produced .onnx.
"""

import argparse
import os

import torch
import torch.nn as nn
import torch.nn.functional as F
from huggingface_hub import hf_hub_download

# Match these to src/predictors/onnx.ts.
INPUT_SIZE = 768
NUM_JOINTS = 19

HF_REPO = "cwlachap/hrnet-cephalometric-landmark-detection"
HF_WEIGHTS_FILE = "best_model.pth"

# HRNet-W32 stage configuration (configs/hrnet_w32_768x768.yaml in the model repo).
HRNET_CONFIG = {
    "NUM_JOINTS": NUM_JOINTS,
    "STAGE2": {"NUM_MODULES": 1, "NUM_BRANCHES": 2, "NUM_BLOCKS": [4, 4],
               "NUM_CHANNELS": [32, 64], "BLOCK": "BASIC", "FUSE_METHOD": "SUM"},
    "STAGE3": {"NUM_MODULES": 4, "NUM_BRANCHES": 3, "NUM_BLOCKS": [4, 4, 4],
               "NUM_CHANNELS": [32, 64, 128], "BLOCK": "BASIC", "FUSE_METHOD": "SUM"},
    "STAGE4": {"NUM_MODULES": 3, "NUM_BRANCHES": 4, "NUM_BLOCKS": [4, 4, 4, 4],
               "NUM_CHANNELS": [32, 64, 128, 256], "BLOCK": "BASIC", "FUSE_METHOD": "SUM"},
}


# --------------------------------------------------------------------------- #
# HRNet architecture (vendored from the model repo's src/model_hrnet.py).
# --------------------------------------------------------------------------- #
class BasicBlock(nn.Module):
    expansion = 1

    def __init__(self, inplanes, planes, stride=1, downsample=None):
        super().__init__()
        self.conv1 = nn.Conv2d(inplanes, planes, 3, stride, 1, bias=False)
        self.bn1 = nn.BatchNorm2d(planes)
        self.relu = nn.ReLU(inplace=True)
        self.conv2 = nn.Conv2d(planes, planes, 3, 1, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(planes)
        self.downsample = downsample

    def forward(self, x):
        residual = x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        if self.downsample is not None:
            residual = self.downsample(x)
        return self.relu(out + residual)


class Bottleneck(nn.Module):
    expansion = 4

    def __init__(self, inplanes, planes, stride=1, downsample=None):
        super().__init__()
        self.conv1 = nn.Conv2d(inplanes, planes, 1, bias=False)
        self.bn1 = nn.BatchNorm2d(planes)
        self.conv2 = nn.Conv2d(planes, planes, 3, stride, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(planes)
        self.conv3 = nn.Conv2d(planes, planes * self.expansion, 1, bias=False)
        self.bn3 = nn.BatchNorm2d(planes * self.expansion)
        self.relu = nn.ReLU(inplace=True)
        self.downsample = downsample

    def forward(self, x):
        residual = x
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.relu(self.bn2(self.conv2(out)))
        out = self.bn3(self.conv3(out))
        if self.downsample is not None:
            residual = self.downsample(x)
        return self.relu(out + residual)


class HighResolutionModule(nn.Module):
    def __init__(self, num_branches, block, num_blocks, num_inchannels,
                 num_channels, fuse_method, multi_scale_output=True):
        super().__init__()
        self.num_inchannels = num_inchannels
        self.num_branches = num_branches
        self.multi_scale_output = multi_scale_output
        self.branches = self._make_branches(num_branches, block, num_blocks, num_channels)
        self.fuse_layers = self._make_fuse_layers()
        self.relu = nn.ReLU(inplace=True)

    def _make_one_branch(self, i, block, num_blocks, num_channels, stride=1):
        downsample = None
        if stride != 1 or self.num_inchannels[i] != num_channels[i] * block.expansion:
            downsample = nn.Sequential(
                nn.Conv2d(self.num_inchannels[i], num_channels[i] * block.expansion,
                          1, stride, bias=False),
                nn.BatchNorm2d(num_channels[i] * block.expansion),
            )
        layers = [block(self.num_inchannels[i], num_channels[i], stride, downsample)]
        self.num_inchannels[i] = num_channels[i] * block.expansion
        for _ in range(1, num_blocks[i]):
            layers.append(block(self.num_inchannels[i], num_channels[i]))
        return nn.Sequential(*layers)

    def _make_branches(self, num_branches, block, num_blocks, num_channels):
        return nn.ModuleList(
            self._make_one_branch(i, block, num_blocks, num_channels)
            for i in range(num_branches)
        )

    def _make_fuse_layers(self):
        if self.num_branches == 1:
            return None
        num_branches = self.num_branches
        num_inchannels = self.num_inchannels
        fuse_layers = []
        for i in range(num_branches if self.multi_scale_output else 1):
            fuse_layer = []
            for j in range(num_branches):
                if j > i:
                    fuse_layer.append(nn.Sequential(
                        nn.Conv2d(num_inchannels[j], num_inchannels[i], 1, 1, 0, bias=False),
                        nn.BatchNorm2d(num_inchannels[i]),
                    ))
                elif j == i:
                    fuse_layer.append(None)
                else:
                    conv3x3s = []
                    for k in range(i - j):
                        if k == i - j - 1:
                            out_c = num_inchannels[i]
                            conv3x3s.append(nn.Sequential(
                                nn.Conv2d(num_inchannels[j], out_c, 3, 2, 1, bias=False),
                                nn.BatchNorm2d(out_c),
                            ))
                        else:
                            out_c = num_inchannels[j]
                            conv3x3s.append(nn.Sequential(
                                nn.Conv2d(num_inchannels[j], out_c, 3, 2, 1, bias=False),
                                nn.BatchNorm2d(out_c),
                                nn.ReLU(inplace=True),
                            ))
                    fuse_layer.append(nn.Sequential(*conv3x3s))
            fuse_layers.append(nn.ModuleList(fuse_layer))
        return nn.ModuleList(fuse_layers)

    def get_num_inchannels(self):
        return self.num_inchannels

    def forward(self, x):
        if self.num_branches == 1:
            return [self.branches[0](x[0])]
        for i in range(self.num_branches):
            x[i] = self.branches[i](x[i])
        x_fuse = []
        for i in range(len(self.fuse_layers)):
            y = x[0] if i == 0 else self.fuse_layers[i][0](x[0])
            for j in range(1, self.num_branches):
                if i == j:
                    y = y + x[j]
                elif j > i:
                    y = y + F.interpolate(
                        self.fuse_layers[i][j](x[j]),
                        size=[x[i].shape[-2], x[i].shape[-1]],
                        mode="bilinear", align_corners=False,
                    )
                else:
                    y = y + self.fuse_layers[i][j](x[j])
            x_fuse.append(self.relu(y))
        return x_fuse


class HRNet(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.num_joints = config.get("NUM_JOINTS", 19)
        blocks_dict = {"BASIC": BasicBlock, "BOTTLENECK": Bottleneck}

        self.conv1 = nn.Conv2d(3, 64, 3, 2, 1, bias=False)
        self.bn1 = nn.BatchNorm2d(64)
        self.conv2 = nn.Conv2d(64, 64, 3, 2, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(64)
        self.relu = nn.ReLU(inplace=True)
        self.layer1 = self._make_layer(Bottleneck, 64, 64, 4)

        stage2_cfg = config["STAGE2"]
        num_channels = [c * blocks_dict[stage2_cfg["BLOCK"]].expansion
                        for c in stage2_cfg["NUM_CHANNELS"]]
        self.transition1 = self._make_transition_layer([256], num_channels)
        self.stage2, pre_stage_channels = self._make_stage(stage2_cfg, num_channels)

        stage3_cfg = config["STAGE3"]
        num_channels = [c * blocks_dict[stage3_cfg["BLOCK"]].expansion
                        for c in stage3_cfg["NUM_CHANNELS"]]
        self.transition2 = self._make_transition_layer(pre_stage_channels, num_channels)
        self.stage3, pre_stage_channels = self._make_stage(stage3_cfg, num_channels)

        stage4_cfg = config["STAGE4"]
        num_channels = [c * blocks_dict[stage4_cfg["BLOCK"]].expansion
                        for c in stage4_cfg["NUM_CHANNELS"]]
        self.transition3 = self._make_transition_layer(pre_stage_channels, num_channels)
        self.stage4, pre_stage_channels = self._make_stage(
            stage4_cfg, num_channels, multi_scale_output=True)

        self.final_layer = nn.Conv2d(pre_stage_channels[0], self.num_joints, 1, 1, 0)
        self.dropout = nn.Dropout2d(0.1)

    def _make_layer(self, block, inplanes, planes, blocks, stride=1):
        downsample = None
        if stride != 1 or inplanes != planes * block.expansion:
            downsample = nn.Sequential(
                nn.Conv2d(inplanes, planes * block.expansion, 1, stride, bias=False),
                nn.BatchNorm2d(planes * block.expansion),
            )
        layers = [block(inplanes, planes, stride, downsample)]
        inplanes = planes * block.expansion
        for _ in range(1, blocks):
            layers.append(block(inplanes, planes))
        return nn.Sequential(*layers)

    def _make_transition_layer(self, num_channels_pre, num_channels_cur):
        num_pre = len(num_channels_pre)
        num_cur = len(num_channels_cur)
        transition_layers = []
        for i in range(num_cur):
            if i < num_pre:
                if num_channels_cur[i] != num_channels_pre[i]:
                    transition_layers.append(nn.Sequential(
                        nn.Conv2d(num_channels_pre[i], num_channels_cur[i], 3, 1, 1, bias=False),
                        nn.BatchNorm2d(num_channels_cur[i]),
                        nn.ReLU(inplace=True),
                    ))
                else:
                    transition_layers.append(None)
            else:
                conv3x3s = []
                for j in range(i + 1 - num_pre):
                    inc = num_channels_pre[-1]
                    outc = num_channels_cur[i] if j == i - num_pre else inc
                    conv3x3s.append(nn.Sequential(
                        nn.Conv2d(inc, outc, 3, 2, 1, bias=False),
                        nn.BatchNorm2d(outc),
                        nn.ReLU(inplace=True),
                    ))
                transition_layers.append(nn.Sequential(*conv3x3s))
        return nn.ModuleList(transition_layers)

    def _make_stage(self, layer_config, num_inchannels, multi_scale_output=True):
        num_modules = layer_config["NUM_MODULES"]
        num_branches = layer_config["NUM_BRANCHES"]
        num_blocks = layer_config["NUM_BLOCKS"]
        num_channels = layer_config["NUM_CHANNELS"]
        block = BasicBlock if layer_config["BLOCK"] == "BASIC" else Bottleneck
        fuse_method = layer_config.get("FUSE_METHOD", "SUM")
        modules = []
        for i in range(num_modules):
            reset = not (not multi_scale_output and i == num_modules - 1)
            modules.append(HighResolutionModule(
                num_branches, block, num_blocks, num_inchannels,
                num_channels, fuse_method, reset))
            num_inchannels = modules[-1].get_num_inchannels()
        return nn.Sequential(*modules), num_inchannels

    def forward(self, x):
        x = self.relu(self.bn1(self.conv1(x)))
        x = self.relu(self.bn2(self.conv2(x)))
        x = self.layer1(x)

        x_list = [t(x) if t is not None else x for t in self.transition1]
        y_list = self.stage2(x_list)

        x_list = [self.transition2[i](y_list[-1]) if self.transition2[i] is not None else y_list[i]
                  for i in range(len(self.transition2))]
        y_list = self.stage3(x_list)

        x_list = [self.transition3[i](y_list[-1]) if self.transition3[i] is not None else y_list[i]
                  for i in range(len(self.transition3))]
        y_list = self.stage4(x_list)

        x = self.dropout(y_list[0])
        return self.final_layer(x)


def build_model():
    """Return the HRNet model with the trained weights loaded, in eval mode."""
    model = HRNet(HRNET_CONFIG)

    weights_path = hf_hub_download(repo_id=HF_REPO, filename=HF_WEIGHTS_FILE)
    print(f"Downloaded weights: {weights_path}")
    checkpoint = torch.load(weights_path, map_location="cpu")

    # The training checkpoint stores the weights under 'model_state_dict';
    # tolerate the plain-state_dict and 'state_dict' variants too.
    if isinstance(checkpoint, dict):
        state = (checkpoint.get("model_state_dict")
                 or checkpoint.get("state_dict")
                 or checkpoint.get("model")
                 or checkpoint)
    else:
        state = checkpoint
    if any(k.startswith("module.") for k in state):
        state = {k[len("module."):]: v for k, v in state.items()}

    missing, unexpected = model.load_state_dict(state, strict=False)
    if missing:
        print(f"WARNING: {len(missing)} missing keys (first few): {missing[:5]}")
    if unexpected:
        print(f"WARNING: {len(unexpected)} unexpected keys (first few): {unexpected[:5]}")
    model.eval()
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="build/models/cephalometric.onnx")
    parser.add_argument("--opset", type=int, default=17)
    args = parser.parse_args()

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)

    model = build_model()

    # Sanity-check the output shape before export (expect [1, 19, 192, 192]).
    dummy = torch.randn(1, 3, INPUT_SIZE, INPUT_SIZE)
    with torch.no_grad():
        out = model(dummy)
    print(f"Forward output shape: {tuple(out.shape)}  (expected (1, {NUM_JOINTS}, "
          f"{INPUT_SIZE // 4}, {INPUT_SIZE // 4}))")

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
