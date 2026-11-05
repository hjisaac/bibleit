import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const baseCache = process.env.HF_HOME
  ? (process.env.HF_HOME.endsWith('transformers')
      ? process.env.HF_HOME
      : path.join(process.env.HF_HOME, 'transformers'))
  : path.resolve(process.cwd(), '.cache/huggingface/transformers');

const modelDir = path.join(baseCache, 'nomic-ai', 'nomic-embed-text-v1.5');
fs.mkdirSync(modelDir, { recursive: true });

const files = [
  {
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/raw/main/config.json',
    dest: path.join(modelDir, 'config.json'),
  },
  {
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/raw/main/tokenizer_config.json',
    dest: path.join(modelDir, 'tokenizer_config.json'),
  },
  {
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/raw/main/tokenizer.json',
    dest: path.join(modelDir, 'tokenizer.json'),
  },
  {
    url: 'https://huggingface.co/nomic-ai/nomic-embed-text-v1.5/resolve/main/onnx/model_quantized.onnx',
    dest: path.join(modelDir, 'onnx', 'model_quantized.onnx'),
  },
];

function downloadFile(url, dest, retries = 3) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    console.log(`[Cache Hit] Already present: ${path.basename(dest)}`);
    return Promise.resolve();
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(downloadFile(res.headers.location, dest, retries));
      }
      if (res.statusCode !== 200) {
        if (retries > 0) {
          console.warn(`Retrying ${url} (${res.statusCode})...`);
          return setTimeout(() => resolve(downloadFile(url, dest, retries - 1)), 2000);
        }
        return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`));
      }
      const stream = fs.createWriteStream(dest);
      res.pipe(stream);
      stream.on('finish', () => stream.close(resolve));
      stream.on('error', reject);
    }).on('error', (err) => {
      if (retries > 0) {
        console.warn(`Retrying ${url} (${err.message})...`);
        return setTimeout(() => resolve(downloadFile(url, dest, retries - 1)), 2000);
      }
      reject(err);
    });
  });
}

console.log(`Downloading nomic-embed-text-v1.5 assets to ${modelDir}...`);
for (const item of files) {
  console.log(`Downloading ${path.basename(item.dest)}...`);
  await downloadFile(item.url, item.dest);
}
console.log('Model assets ready.');
