// Refresh the UI of an already-built local preview without rebuilding its
// calibrated generators, environment identity or installed resource catalog.
import {copyFile,mkdir,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'dist'),target=path.join(root,'private-packs/rwg-local-preview');
await stat(path.join(target,'build-info.json'));
const files=['app.js','index.html','style.css','theme.css','theme-ui.js','preferences.js','biome-selection.js','map.js','gpu-biome-renderer.js','resource-icons.js','resource-view.js','resource-names.js','engine/resources.js','start-local.mjs','NOTICE.md'];
files.push('structure-filters.js','engine/catalog.js');
for(const name of await readdir(path.join(source,'assets/ui')))files.push('assets/ui/'+name);
for(const name of await readdir(path.join(source,'assets/resources')))files.push('assets/resources/'+name);
for(const name of await readdir(path.join(source,'i18n')))files.push('i18n/'+name);
for(const file of files){
  await mkdir(path.dirname(path.join(target,file)),{recursive:true});
  await copyFile(path.join(source,file),path.join(target,file));
}
console.log(`Updated ${files.length} UI files in the local calibrated preview.`);
