# Auto-plot model — handoff

Status as of this branch (`claude/progress-update-zwpgqp`): the real-model path
is **fully coded and verified**; only the model binary is missing because
`huggingface.co` is blocked from the sandbox this work was done in. This note is
the pick-up list for an environment whose network policy **allows
huggingface.co** (and pypi.org).

## What is already done (committed)

- `tools/convert_hrnet_to_onnx.py` — self-contained converter. Vendors the exact
  HRNet-W32 architecture from the model's own repo, downloads `best_model.pth`
  from Hugging Face, loads `model_state_dict`, checks the forward shape, exports
  ONNX. Verified locally: 29.3M params, output `(1, 19, 192, 192)`, valid ONNX
  with input `[b, 3, 768, 768]`.
- `src/predictors/onnx.ts` — matches the model's real pipeline: 768 letterbox
  input, ImageNet normalisation, soft-argmax over 192×192 heatmaps, inverse
  letterbox back to image coordinates. Type-checks clean.
- `webpack.config.js` — CopyPlugin copies `src/assets/models/` → `/models/` at
  build (with `noErrorOnMissing`), the URL the predictor fetches.
- `src/assets/models/.gitkeep` — drop the `.onnx` here. `*.onnx` is gitignored
  (the file is ~115 MB; see "Hosting the model" below).

## Do this in the network-open environment

```sh
# 1. Generate the model (huggingface.co + pypi must be reachable)
pip install torch onnx huggingface_hub
python tools/convert_hrnet_to_onnx.py --out src/assets/models/cephalometric.onnx

# 2. Turn the backend on
#    src/predictors/index.ts:  const USE_ONNX = true;

# 3. Build / run and verify auto-plot uses real predictions
npm install
npm start            # then exercise Auto-plot on a lateral ceph image
```

Expected: landmarks land on real anatomy (Sella, Nasion, …), not the demo's
scattered grid. The 19 model landmarks cover the WebCeph points in
`LANDMARK_ORDER`; others are skipped.

### Quick numeric check (optional, no browser)

Run the converter, then confirm onnxruntime agrees with the Python pipeline on
one image. A mismatch means preprocessing/decoding drifted from the model repo
(`src/dataset.py` letterbox, `src/heatmaps.py` soft-argmax) — those are the
parts mirrored in `onnx.ts`.

## Hosting the model (decide before shipping)

The `.onnx` is ~115 MB, so it is **not** committed to git. Pick one:

1. **Git LFS** — `git lfs track "src/assets/models/*.onnx"`, remove the ignore
   line, commit. Simplest for self-hosting; needs LFS on the host/CDN.
2. **CI regenerates it** — run the converter as a build step (the CI runner
   needs huggingface.co access) so the binary is produced into the build, never
   stored in git.
3. **External URL / CDN** — host the file anywhere and set `MODEL_URL` in
   `src/predictors/onnx.ts` to that absolute URL (CORS must allow it).

Default `MODEL_URL` is `/models/cephalometric.onnx`, served from the build root.

## Pointers

- Model card / weights: https://huggingface.co/cwlachap/hrnet-cephalometric-landmark-detection (`best_model.pth`)
- Architecture / preprocessing source: https://github.com/cwlachap/hrnet-cephalometric-landmark-detection (`src/model_hrnet.py`, `src/dataset.py`, `src/heatmaps.py`, `configs/hrnet_w32_768x768.yaml`)
- Contract summary + enable steps: `docs/auto-plot-model.md`

## Definition of done

The pick-up is complete when all of these hold:

- [ ] `src/assets/models/cephalometric.onnx` exists (converter ran clean:
      29.3M params, forward shape `(1, 19, 192, 192)`, ONNX checker passed).
- [ ] `USE_ONNX = true` in `src/predictors/index.ts`.
- [ ] `npx tsc --noEmit` is green (strict tsc is the project's bar — see commit
      `64f9219`).
- [ ] `npm start` boots and `/models/cephalometric.onnx` returns `200` (check
      the Network tab; a `404` here is the most common failure — see below).
- [ ] Auto-plot on a real lateral ceph lands points on anatomy (Sella inside the
      sella turcica, Nasion at the frontonasal suture, …), not the demo grid.
- [ ] Model hosting decided and applied (Git LFS, CI-regenerate, or external
      URL — see "Hosting the model" above). Don't leave the `.onnx` only on a
      local disk.

## Troubleshooting

**Converter side (`tools/convert_hrnet_to_onnx.py`)**

- *Download fails / hangs* — `huggingface.co` is blocked. This whole handoff
  exists for that reason; you must run the converter where egress is open.
- *`state_dict` key mismatch on load* — the vendored architecture has drifted
  from the model repo's `src/model_hrnet.py`. Re-vendor it; the `.pth` is loaded
  strictly so any layer-name diff throws.
- *Forward-shape assertion fails* — `INPUT_SIZE`/`NUM_JOINTS` or the stage config
  in the script no longer match the weights. These must also stay in lockstep
  with `SIZE`/`HEATMAP`/`LANDMARK_ORDER` in `onnx.ts`.

**App side (`src/predictors/onnx.ts`)**

- *`404` for the model* — it isn't at `MODEL_URL`. Confirm `webpack.config.js`
  CopyPlugin copied `src/assets/models/` → `/models/`, or point `MODEL_URL` at
  the real (CORS-allowed) URL.
- *`InferenceSession.create` throws* — corrupt/partial `.onnx`, or onnxruntime-web
  can't fetch its WASM. The runtime and session are loaded lazily on first
  Auto-plot, so failures surface then, not at page load.
- *Points cluster on one side / mirrored / scaled wrong* — the letterbox inverse
  drifted from training. The forward letterbox (`letterboxOf` + `preprocess`)
  and its inverse (the `(xInput - padLeft) / scale` math in `predict`) must
  mirror `src/dataset.py`; the soft-argmax (`softArgmax`) must mirror
  `src/heatmaps.py`. The optional numeric check above isolates this without a
  browser.
- *Some expected landmarks never appear* — by design. Only 11 of the model's 19
  channels map to WebCeph symbols (`S, N, Or, Po, A, B, Pog, Gn, Ls, Li, Sn`);
  the other 8 are `''` in `LANDMARK_ORDER` and skipped, and the middleware
  further filters to the symbols the active analysis needs.

## Reverting / shipping demo-only

Auto-plot ships working without a model: leave `USE_ONNX = false` and the demo
predictor runs end-to-end (placeholder points, not real detection). Nothing
about enabling ONNX is destructive — flipping the flag back off fully restores
the demo path, and no large asset ships while the flag is off.
