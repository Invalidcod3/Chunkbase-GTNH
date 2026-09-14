// Execute unchanged Worker sources. Stubs provide configuration, never decisions.
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url)),work=path.join(root,".test-work/mod-oracle"),files=[];
async function source(name,text){const p=path.join(work,"src",name);await mkdir(path.dirname(p),{recursive:true});await writeFile(p,text);files.push(p);}
const worker=path.join(root,"reference/Amidst-GTNH/gtnh-worker/src/main/java/amidst/gtnh/worker");
for(const name of ["ModStructurePredictor","Ae2MeteoritePredictor"]) await source(`amidst/gtnh/worker/${name}.java`,await readFile(path.join(worker,name+".java"),"utf8"));
function extract(text,signature){const start=text.indexOf(signature);if(start<0)throw Error(signature);let end=text.indexOf("{",start),depth=1;while(depth&&++end<text.length){if(text[end]==="{")depth++;if(text[end]==="}")depth--;}return text.slice(start,end+1);}
const forge=extract(await readFile(path.join(worker,"RoguelikeDungeonPredictor.java"),"utf8"),"static Random forgeChunkRandom");
await source("amidst/gtnh/worker/RoguelikeDungeonPredictor.java",`package amidst.gtnh.worker;import java.util.Random;class RoguelikeDungeonPredictor{${forge} static class StructureDescriptor{final String kind,subtype,certainty;final int x,z;StructureDescriptor(String k,String s,int x,int z,String c){kind=k;subtype=s;this.x=x;this.z=z;certainty=c;}}}`);
await source("ru/timeconqueror/lootgames/common/config/LGConfigs.java",`package ru.timeconqueror.lootgames.common.config;public class LGConfigs{public static General GENERAL=new General();public static class General{public WorldGen worldGen=new WorldGen();}public static class WorldGen{public boolean disableDungeonGen=false;public int size=20;public boolean isDimensionEnabledForWG(int d){return d==0;}public int getWorldGenRhombusSize(int d){return size;}}}`);
await source("tconstruct/util/config/DimensionBlacklist.java",`package tconstruct.util.config;public class DimensionBlacklist{public static boolean nether=false;public static boolean isDimInBlacklist(int d){return d==0 || (nether && d==-1);}}`);
await source("tconstruct/util/config/PHConstruct.java",`package tconstruct.util.config;public class PHConstruct{public static int islandRarity=8000;}`);
await source("tuhljin/automagy/lib/AutomagyConfig.java",`package tuhljin.automagy.lib;public class AutomagyConfig{public static int netherSpireChance=140;}`);
await source("appeng/core/features/AEFeature.java",`package appeng.core.features;public enum AEFeature{MeteoriteWorldGen}`);
await source("appeng/core/AEConfig.java",`package appeng.core;import appeng.core.features.AEFeature;public class AEConfig{public static AEConfig instance=new AEConfig();public String[] minMeteoriteDistance={"0=707"},meteoriteSpawnChance={"0=0.3"},meteoriteDimensionWhitelist={"0, DEFAULT"};public boolean isFeatureEnabled(AEFeature feature){return true;}}`);
await source("amidst/util/FastRand.java",await readFile(path.join(root,"reference/Amidst-GTNH/src/main/java/amidst/util/FastRand.java"),"utf8"));
await source("amidst/documentation/NotThreadSafe.java","package amidst.documentation;public @interface NotThreadSafe{}");
const fortress=await readFile(path.join(root,"reference/Amidst-GTNH/src/main/java/amidst/gtnh/structure/GtnhNetherFortressProducer.java"),"utf8");
const body=fortress.slice(fortress.indexOf("\t\tint regionX ="),fortress.indexOf("\t\tCoordinatesInWorld coordinates ="));
if(!body.includes("selectedChunkZ"))throw Error("Fortress reference extraction failed");
await source("amidst/gtnh/worker/FortressReference.java",`package amidst.gtnh.worker;import java.util.*;import amidst.util.FastRand;class FortressReference{static void add(long seed,int chunkX,int chunkZ,int minX,int minZ,int maxX,int maxZ,List<RoguelikeDungeonPredictor.StructureDescriptor> out){${body}int x=selectedChunkX*16+11,z=selectedChunkZ*16+11;if(x>=minX&&x<maxX&&z>=minZ&&z<maxZ)out.add(new RoguelikeDungeonPredictor.StructureDescriptor("NETHER_FORTRESS","",x,z,"EXPECTED"));}}`);
await source("amidst/gtnh/worker/ModOracle.java",`package amidst.gtnh.worker;import java.util.*;public class ModOracle{
static String q(String s){return "\\\""+s+"\\\"";}
public static void main(String[] args){List<String> cases=new ArrayList<>();
for(int profile=0;profile<2;profile++){
int rarity=profile==0?8000:37,distance=profile==0?707:129,rhombus=profile==0?20:5,chance=profile==0?140:19;
ru.timeconqueror.lootgames.common.config.LGConfigs.GENERAL.worldGen.size=rhombus;tconstruct.util.config.PHConstruct.islandRarity=rarity;tconstruct.util.config.DimensionBlacklist.nether=profile==1;tuhljin.automagy.lib.AutomagyConfig.netherSpireChance=chance;appeng.core.AEConfig.instance.minMeteoriteDistance=new String[]{"0="+distance};
for(long seed:new long[]{0L,1L,-1L,9007199254740993L,Long.MIN_VALUE,Long.MAX_VALUE})
for(int[] b:new int[][]{{-1300,-1700,2600,3400},{-17,-8,38,63},{29997000,-29999000,2200,1800}})
for(int dim:new int[]{0,-1}){
int x=b[0],z=b[1],w=b[2],h=b[3];var marks=new ModStructurePredictor().predict(seed,dim,x,z,w,h);
if(dim==-1)for(int rz=Math.floorDiv(z,256);rz<=Math.floorDiv(z+h-1,256);rz++)for(int rx=Math.floorDiv(x,256);rx<=Math.floorDiv(x+w-1,256);rx++)FortressReference.add(seed,rx*16,rz*16,x,z,x+w,z+h,marks);
List<String> values=new ArrayList<>();for(var m:marks)values.add(q(m.kind+"|"+m.subtype+"|"+m.x+"|"+m.z+"|"+m.certainty));Collections.sort(values);
cases.add("{\\\"seed\\\":"+q(""+seed)+",\\\"dimension\\\":"+q(dim==0?"overworld":"nether")+",\\\"bounds\\\":{\\\"minX\\\":"+x+",\\\"minZ\\\":"+z+",\\\"maxX\\\":"+(x+w)+",\\\"maxZ\\\":"+(z+h)+"},\\\"profile\\\":"+profile+",\\\"values\\\":["+String.join(",",values)+"]}");
}}System.out.println("["+String.join(",",cases)+"]");}}
`);
const classes=path.join(work,"classes");await mkdir(classes,{recursive:true});
for(const [cmd,args] of [["javac",["-encoding","UTF-8","-d",classes,...files]],["java",["-cp",classes,"amidst.gtnh.worker.ModOracle"]]]){
  const r=spawnSync(cmd,args,{encoding:"utf8",maxBuffer:16*1024*1024});if(r.status!==0)throw Error(r.stderr||r.error);
  if(cmd==="java"){
    const fixtures=JSON.parse(r.stdout),target=path.join(root,"tests/fixtures/mod-structures.json");
    if(process.argv.includes("--record"))await writeFile(target,JSON.stringify(fixtures));
    else if(JSON.stringify(JSON.parse(await readFile(target,"utf8")))!==JSON.stringify(fixtures))throw Error("Mod reference changed");
    console.log(`Original Java verified: ${fixtures.length} mod/fortress cases`);
  }
}
