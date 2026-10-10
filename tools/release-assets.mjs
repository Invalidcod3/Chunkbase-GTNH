// Generate the hosted defaults without depending on local deployment directories.
import {writeFile} from 'node:fs/promises';
import path from 'node:path';

export async function writeReleaseAssets(directory) {
  await writeFile(path.join(directory, '_headers'), `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Cache-Control: public, max-age=0, must-revalidate
`);
  await writeFile(path.join(directory, '404.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>404 · Chunkbase NH</title>
<style>body{margin:0;min-height:100vh;display:grid;place-content:center;background:#181a1d;color:#edf0f5;font:16px/1.6 system-ui,sans-serif}a{color:#b9cbff}</style>
<main><h1>404</h1><p>未找到此页面 / Page not found</p><a href="/">返回地图 / Back to map</a></main></html>
`);
}
