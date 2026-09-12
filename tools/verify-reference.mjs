// Compile the unchanged reference predictors against small environment stubs.
// The stubs supply config only; expected coordinates come from the Java source.
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const work = path.join(root, ".test-work/java"),
  src = path.join(work, "src"),
  classes = path.join(work, "classes");
const files = [];
async function source(name, content) {
  const target = path.join(src, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  files.push(target);
}
for (const name of [
  "EndStructurePredictor",
  "MoonStructurePredictor",
  "RwgStructurePredictor",
])
  await source(
    `amidst/gtnh/worker/${name}.java`,
    await readFile(
      path.join(
        root,
        `reference/Amidst-GTNH/gtnh-worker/src/main/java/amidst/gtnh/worker/${name}.java`,
      ),
      "utf8",
    ),
  );
await source(
  "amidst/gtnh/worker/RoguelikeDungeonPredictor.java",
  `package amidst.gtnh.worker; class RoguelikeDungeonPredictor {static class StructureDescriptor {final String kind,subtype,certainty;final int x,z;StructureDescriptor(String k,String s,int x,int z,String c){kind=k;subtype=s;this.x=x;this.z=z;certainty=c;}}}`,
);
await source(
  "amidst/gtnh/worker/SurfaceBiomeSampler.java",
  `package amidst.gtnh.worker; interface SurfaceBiomeSampler {boolean isVillageLocationViable(int x,int z);}`,
);
await source(
  "amidst/gtnh/worker/AmidstGtnhWorkerLog.java",
  `package amidst.gtnh.worker; class AmidstGtnhWorkerLog {static final Log LOG=new Log();static class Log {void warn(String message){throw new AssertionError(message);}}}`,
);
await source(
  "rwg/config/ConfigRWG.java",
  `package rwg.config; public class ConfigRWG {public static boolean generateVillages=false,generateMineshafts=true;}`,
);
await source(
  "com/brandon3055/draconicevolution/common/handler/ConfigHandler.java",
  `package com.brandon3055.draconicevolution.common.handler; public class ConfigHandler {public static boolean generateChaosIslands=true;public static int chaosIslandSeparation=10000;}`,
);
await source(
  "com/brandon3055/draconicevolution/common/world/DraconicWorldGenerator.java",
  `package com.brandon3055.draconicevolution.common.world; public class DraconicWorldGenerator {public static boolean chaosIslandsEnabled=true;}`,
);
const spaceSource = await readFile(
  path.join(
    root,
    "reference/Amidst-GTNH/gtnh-worker/src/main/java/amidst/gtnh/worker/SpaceStructurePredictor.java",
  ),
  "utf8",
);
function extract(signature) {
  const start = spaceSource.indexOf(signature);
  if (start < 0) throw new Error("Missing reference method " + signature);
  let end = spaceSource.indexOf("{", start),
    depth = 1;
  while (depth && ++end < spaceSource.length) {
    if (spaceSource[end] === "{") depth++;
    if (spaceSource[end] === "}") depth--;
  }
  return spaceSource.slice(start, end + 1);
}
const spaceMethods = [
  "private static void addDungeons",
  "private static void addCaverns",
  "private static RegionBounds markerRegionBounds",
  "private static int markerChunk",
  "private static int blockChunk",
  "private static int checkedInt",
  "private static long ceilingDiv",
  "private static void validateCount",
  "private static void addChunkCenterIfInside",
  "private static void addIfInside",
  "private static final class RegionBounds",
]
  .map(extract)
  .join("\n");
await source(
  "amidst/gtnh/worker/SpaceReference.java",
  `package amidst.gtnh.worker;import java.util.*;class SpaceReference{
static final int BLOCKS_PER_CHUNK=16,CHUNK_CENTER=8,DUNGEON_SPACING=44,MAX_CANDIDATES=4194304;
static final long X_SEED_MULTIPLIER=341873128712L,Z_SEED_MULTIPLIER=132897987541L,GALACTICRAFT_DUNGEON_SALT=4291754L,GALAXYSPACE_DUNGEON_SALT=4291726L;
static List<RoguelikeDungeonPredictor.StructureDescriptor> predict(long seed,String key,int id,int x,int z,int w,int h){List<RoguelikeDungeonPredictor.StructureDescriptor> r=new ArrayList<>();if(key.equals("mars"))addCaverns(seed,x,z,(long)x+w,(long)z+h,r);addDungeons(seed,id,key.toUpperCase()+"_DUNGEON",key.equals("ceres")||key.equals("io"),x,z,(long)x+w,(long)z+h,r);return r;}
${spaceMethods}}`,
);
await source(
  "amidst/gtnh/worker/Oracle.java",
  `package amidst.gtnh.worker;
import java.util.*;import java.security.*;import java.nio.*;
public class Oracle {
static String quote(String s){return "\\\""+s+"\\\"";}
static String structures(List<RoguelikeDungeonPredictor.StructureDescriptor> list){List<String> lines=new ArrayList<>();for(var m:list)lines.add(m.kind+"|"+(m.subtype==null?"":m.subtype)+"|"+m.x+"|"+m.z+"|"+m.certainty);Collections.sort(lines);return "["+String.join(",",lines.stream().map(Oracle::quote).toList())+"]";}
public static void main(String[] args)throws Exception{
long[] seeds={0L,1L,-1L,Long.MIN_VALUE,Long.MAX_VALUE,9007199254740993L,-4172144997902289642L};
List<String> cases=new ArrayList<>();
for(long seed:seeds){
Random r=new Random(seed);List<String> random=new ArrayList<>();for(int i=0;i<10;i++){random.add(quote(r.nextLong()+"|"+r.nextInt(1073741825)+"|"+r.nextInt(1)+"|"+r.nextDouble()));}
cases.add("{\\\"type\\\":\\\"random\\\",\\\"seed\\\":"+quote(""+seed)+",\\\"values\\\":["+String.join(",",random)+"]}");
for(int[] bounds:new int[][]{{-2500,-2200,5000,4400},{-18000,-10400,4000,1600},{-1,-1,770,770}}){
int x=bounds[0],z=bounds[1],w=bounds[2],h=bounds[3];
String base="\\\"seed\\\":"+quote(""+seed)+",\\\"bounds\\\":{\\\"minX\\\":"+x+",\\\"minZ\\\":"+z+",\\\"maxX\\\":"+(x+w)+",\\\"maxZ\\\":"+(z+h)+"}";
cases.add("{\\\"type\\\":\\\"end\\\","+base+",\\\"values\\\":"+structures(new EndStructurePredictor().predict(seed,x,z,w,h))+"}");
cases.add("{\\\"type\\\":\\\"moon\\\","+base+",\\\"values\\\":"+structures(new MoonStructurePredictor().predict(seed,-28,x,z,w,h,true))+"}");
cases.add("{\\\"type\\\":\\\"moon\\\","+base+",\\\"dimensionId\\\":28,\\\"values\\\":"+structures(new MoonStructurePredictor().predict(seed,28,x,z,w,h,true))+"}");
String[] spaceKeys={"mars","ceres","io","enceladus","proteus","pluto"};int[] spaceIds={29,42,36,41,47,49};
for(int k=0;k<spaceKeys.length;k++)cases.add("{\\\"type\\\":"+quote(spaceKeys[k])+","+base+",\\\"dimensionId\\\":"+spaceIds[k]+",\\\"values\\\":"+structures(SpaceReference.predict(seed,spaceKeys[k],spaceIds[k],x,z,w,h))+"}");
cases.add("{\\\"type\\\":\\\"overworld\\\","+base+",\\\"values\\\":"+structures(new RwgStructurePredictor().predict(seed,x,z,w,h,(a,b)->false))+"}");
}
for(int[] tile:new int[][]{{-128,-128,4},{1800,-1900,4},{-4100,3700,8},{10000,-10000,16}}){
int[] pixels=new EndStructurePredictor().sampleBiomes(seed,tile[0],tile[1],128,128,tile[2]);ByteBuffer bytes=ByteBuffer.allocate(pixels.length*2);for(int id:pixels)bytes.putShort((short)id);String hash=HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes.array()));
cases.add("{\\\"type\\\":\\\"biomes\\\",\\\"seed\\\":"+quote(""+seed)+",\\\"x\\\":"+tile[0]+",\\\"z\\\":"+tile[1]+",\\\"step\\\":"+tile[2]+",\\\"hash\\\":"+quote(hash)+"}");
}}
System.out.println("["+String.join(",",cases)+"]");}}
`,
);
await mkdir(classes, { recursive: true });
let result = spawnSync(
  "javac",
  ["-encoding", "UTF-8", "-d", classes, ...files],
  { encoding: "utf8" },
);
if (result.status !== 0) throw new Error(result.stderr || result.error);
result = spawnSync("java", ["-cp", classes, "amidst.gtnh.worker.Oracle"], {
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});
if (result.status !== 0) throw new Error(result.stderr || result.error);
const fixtures = JSON.parse(result.stdout);
await mkdir(path.join(root, "tests/fixtures"), { recursive: true });
const generated = path.join(work, "reference.json");
await writeFile(generated, JSON.stringify(fixtures));
if (process.argv.includes("--record"))
  await copyFile(generated, path.join(root, "tests/fixtures/reference.json"));
else {
  const previous = JSON.parse(
    await readFile(path.join(root, "tests/fixtures/reference.json")),
  );
  if (JSON.stringify(previous) !== JSON.stringify(fixtures))
    throw new Error("Reference fixture mismatch");
}
console.log("Java reference verified: " + fixtures.length + " cases");
