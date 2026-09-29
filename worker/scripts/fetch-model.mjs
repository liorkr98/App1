// Bakes the depth model into the image at build time (Dockerfile), so the
// depth_map job never downloads anything at run time. Apache-2.0.
import { env, pipeline } from '@huggingface/transformers';

env.cacheDir = process.env.MODEL_CACHE_DIR ?? '/app/.cache/models';
await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'q8' });
console.log('depth model cached in', env.cacheDir);
