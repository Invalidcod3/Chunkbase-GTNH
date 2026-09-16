import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {rwgSpawn,SPAWN_PROVIDERS,acceptsSpawnSurface} from '../dist/engine/navigation.js';
const root=new URL('../',import.meta.url),work=new URL('.test-work/spawn-sync/oracle/',root);
await mkdir(work,{recursive:true});
const sources={
 'Block.java':'package net.minecraft.block; public class Block {}',
 'Blocks.java':'package net.minecraft.init; import net.minecraft.block.Block; public class Blocks {public static final Block grass=new Block(),stone=new Block(),sand=new Block(),snow_layer=new Block();}',
 'BiomeGenBase.java':'package net.minecraft.world.biome; public class BiomeGenBase {}',
 'ChunkPosition.java':'package net.minecraft.world; public class ChunkPosition {public int chunkPosX,chunkPosZ;public ChunkPosition(int x,int y,int z){chunkPosX=x;chunkPosZ=z;}}',
 'SpawnOracle.java':`package amidst.gtnh.worker;
import java.util.Random;import net.minecraft.init.Blocks;import net.minecraft.world.ChunkPosition;
public class SpawnOracle {
 public static void main(String[] args){boolean first=true;System.out.print("[");
  for(String seed:new String[]{"0","-8138049151491905853","9223372036854775807","-9223372036854775808"})for(String provider:new String[]{SpawnSearch.VANILLA,SpawnSearch.BOP})for(int accept:new int[]{0,1,17,999,1000}){
   final int[] calls={0};final int threshold=accept;
   SpawnSearch.Job job=new SpawnSearch.Job(Long.parseLong(seed),provider,new SpawnSearch.Terrain(){
    public ChunkPosition initial(Random random){random.nextInt(117);return new ChunkPosition(-300,0,500);}
    public SpawnSearch.Surface surface(int x,int z){boolean good=calls[0]++==threshold;return new SpawnSearch.Surface(good?(provider.equals(SpawnSearch.VANILLA)?Blocks.grass:Blocks.stone):null,null,70,false);}
   });
   while(!job.advance(0)){}
   if(!first)System.out.print(",");first=false;
   System.out.print("{\\"seed\\":\\""+seed+"\\",\\"provider\\":\\""+provider+"\\",\\"accept\\":"+accept+",\\"x\\":"+job.x+",\\"z\\":"+job.z+",\\"moves\\":"+job.moves+",\\"calls\\":"+calls[0]+"}");
  }System.out.println("]");
 }
}`,
};
for(const [name,source] of Object.entries(sources))await writeFile(new URL(name,work),source);
function run(command,args){const result=spawnSync(command,args,{encoding:'utf8'});if(result.error||result.status!==0)throw result.error||Error(result.stderr);return result.stdout;}
run('javac',['-encoding','UTF-8','-d',fileURLToPath(work),fileURLToPath(new URL('tools/spawn-reference/SpawnSearch.java',root)),...Object.keys(sources).map(name=>fileURLToPath(new URL(name,work)))]);
const reference=JSON.parse(run('java',['-cp',fileURLToPath(work),'amidst.gtnh.worker.SpawnOracle']));
for(const item of reference){let calls=0;const actual=await rwgSpawn(item.seed,()=>({block:calls++===item.accept?(item.provider===SPAWN_PROVIDERS.vanilla?'minecraft:grass':'minecraft:stone'):null}),item.provider,{initial:r=>{r.nextInt(117);return {x:-300,z:500};}});
 assert.deepEqual([actual.x,actual.z,actual.attempts,calls],[item.x,item.z,item.moves,item.calls]);
}
const hashes={};for(const name of ['SpawnSearch','RwgSpawnCaves','RwgChunkBiomeReplay','SavedWorldSpawn'])hashes[name+'.java']=createHash('sha256').update(await readFile(new URL('tools/spawn-reference/'+name+'.java',root))).digest('hex');
const report={scope:'Copied desktop SpawnSearch executed on JVM against detached block identities; search/RNG equivalence only, no generated terrain or save accuracy claim',cases:reference.length,hashes,reference};
await writeFile(new URL('tools/spawn-reference/validation.json',root),JSON.stringify(report,null,2));
console.log(JSON.stringify({desktopSearchCases:reference.length,mismatches:0}));
