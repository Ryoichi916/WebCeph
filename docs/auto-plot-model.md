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

The model contract is already wired into `src/predictors/onnx.ts` — input/output
sizes, ImageNet normalisation, the **letterbox** preprocessing, **soft-argmax**
heatmap decode, and the ISBI-2015 landmark order all mirror the model's own
pipeline (`src/dataset.py` / `src/heatmaps.py` in its repo). You only need to
produce the `.onnx` and flip the switch.

> Picking this up in a fresh environment? See **`docs/auto-plot-handoff.md`** for
> the exact pick-up list and model-hosting options.

Steps:

1. **Convert to ONNX** (outside WebCeph, needs Python + PyTorch — no GPU
   required for export). `huggingface.co` must be reachable; WebCeph's hosted/CI
   sandboxes may block it, so run this on a machine with open egress:

   ```sh
   pip install torch onnx huggingface_hub
   python tools/convert_hrnet_to_onnx.py --out src/assets/models/cephalometric.onnx
   ```

   The script is **self-contained**: it vendors the exact HRNet-W32 architecture
   from the model's source repo, downloads `best_model.pth` from Hugging Face,
   loads the weights, sanity-checks the forward shape (`[1, 19, 192, 192]`), and
   exports the ONNX file.

2. **Place the model** at `MODEL_URL` (default `/models/cephalometric.onnx`,
   served from the build/public root).

3. **Switch the backend**: set `USE_ONNX = true` in `src/predictors/index.ts`.

That's it — no config edits are needed for this model. (If you swap in a
*different* model, revisit `SIZE`, `HEATMAP`, `MEAN`/`STD`, and `LANDMARK_ORDER`
in `onnx.ts`, and the preprocessing/decode if it isn't a letterbox + heatmap
model.)

Only landmarks the active analysis actually needs are placed (the middleware
filters by the analysis' manual steps), so partial coverage of the 19 model
landmarks is fine.

### Model contract (for reference)

| Property | Value |
|---|---|
| Input | `[1, 3, 768, 768]` float32, RGB |
| Preprocessing | letterbox (aspect-preserving resize + centred black pad) → `/255` → ImageNet `MEAN`/`STD` |
| Output | `[1, 19, 192, 192]` float32 heatmaps |
| Decode | per-channel **soft-argmax** (softmax-weighted centroid) → ×4 to input space → invert letterbox to image space |
| Landmarks | standard ISBI-2015 19-point order |

## Notes

- **Offline / privacy**: inference runs locally (WASM in a Web Worker); the
  image never leaves the device. The model file is runtime-cached by the
  service worker after first load.
- **Performance**: HRNet-W32 in WASM takes on the order of seconds per image and
  the model is tens of MB — acceptable for an explicit "Auto-plot" action.
- **Licensing vs. clinical use**: an open-source license permits use, but real
  diagnostic use is a separate matter requiring validation/regulatory care.
