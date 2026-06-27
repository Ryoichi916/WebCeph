# Automatic landmark plotting (Auto-plot)

WebCeph can place cephalometric landmarks automatically. The pipeline is:

```
image → decode to ImageData → predictor (in a Web Worker) → landmark points
      → injected as a single (undoable) batch → analysis recomputes
```

The predictor is **pluggable** (`src/predictors/`). Two backends exist:

| Backend | When | What it does |
|---|---|---|
| `demo` (default) | always available | Deterministic placeholder — spreads one point per landmark; **not real detection**. Lets the feature run end-to-end without a model. |
| `onnx` (opt-in) | when a model is supplied | Runs a trained model with onnxruntime-web (WASM) in the Web Worker. |

The active backend is chosen in `src/predictors/index.ts` (`USE_ONNX`). It stays
`demo` until you supply a model, so no large assets ship by default.

## Enabling a real model

A suitable, openly-licensed model is the **MIT-licensed HRNet cephalometric
model** [`cwlachap/hrnet-cephalometric-landmark-detection`](https://huggingface.co/cwlachap/hrnet-cephalometric-landmark-detection)
(19 lateral landmarks, heatmap regression). MIT is compatible with WebCeph's
GPL-3 license.

Steps:

1. **Convert to ONNX** (outside WebCeph, needs Python + PyTorch — no GPU
   required for export):

   ```sh
   pip install torch onnx huggingface_hub
   python tools/convert_hrnet_to_onnx.py --out build/models/cephalometric.onnx
   ```

   The script downloads the weights; you plug in the HRNet architecture from the
   model's source repo (the `.pth` is weights-only). See the script's docstring.

2. **Place the model** at `MODEL_URL` (default `/models/cephalometric.onnx`,
   served from the build/public root).

3. **Match the config** in `src/predictors/onnx.ts` to the model:
   - `SIZE`, `INPUT_CHANNELS`, `MEAN`/`STD` = the model's training preprocessing.
   - `OUTPUT_IS_HEATMAP` = true for HRNet (peak of each heatmap), false for a
     model that outputs coordinates directly.
   - `LANDMARK_ORDER` = the model's output channel order mapped to WebCeph
     symbols (`''` for landmarks WebCeph has no point for — they're skipped). The
     defaults follow the standard ISBI-2015 19-landmark order.

4. **Switch the backend**: set `USE_ONNX = true` in `src/predictors/index.ts`.

Only landmarks the active analysis actually needs are placed (the middleware
filters by the analysis' manual steps), so partial coverage of the 19 model
landmarks is fine.

## Notes

- **Offline / privacy**: inference runs locally (WASM in a Web Worker); the
  image never leaves the device. The model file is runtime-cached by the
  service worker after first load.
- **Performance**: HRNet-W32 in WASM takes on the order of seconds per image and
  the model is tens of MB — acceptable for an explicit "Auto-plot" action.
- **Licensing vs. clinical use**: an open-source license permits use, but real
  diagnostic use is a separate matter requiring validation/regulatory care.
