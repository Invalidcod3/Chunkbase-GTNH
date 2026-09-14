package amidst.web.profile;
import static amidst.web.profile.ResourceCapture.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Fixed configuration fields only; no call to Rogue SpawnCriteria.isValid (it mutates a list). */
final class SurfaceStructureCapture {
    static Object mcField(Object owner,String named,String srg)throws Exception {
        try{return field(owner,named);}catch(NoSuchFieldException e){return field(owner,srg);}
    }
    static String tower(Object settings)throws Exception {
        String name=String.valueOf(invoke(invoke(settings,"getTower"),"getTower"));
        String[] raw={"PYRAMID","HOUSE","BUNKER","JUNGLE","ETHO","ENIKO","ROGUE","WITCH"};
        String[] web={"DESERT","FOREST","ICE","JUNGLE","MESA","MOUNTAIN","PLAINS","SWAMP"};
        for(int i=0;i<raw.length;i++)if(raw[i].equals(name))return web[i];return name;
    }
    static Map<String,Object> setting(Object raw,Object resolved)throws Exception {
        Object criteria=field(raw,"criteria");
        if(criteria==null)return map("weight",0,"names",null,"tags",null,"whitelist",null,"tower","UNKNOWN","disabled",true);
        if(!criteria.getClass().getName().equals("greymerk.roguelike.dungeon.settings.SpawnCriteria"))throw new IllegalStateException("Unsupported Rogue criteria implementation");
        List<Object> tags=new ArrayList<>();Object types=field(criteria,"biomeTypes");
        if(types!=null)for(Object type:(List<?>)types)tags.add(String.valueOf(type));
        return map("weight",field(criteria,"weight"),"names",field(criteria,"biomes"),"tags",types==null?null:tags,
            "whitelist",field(criteria,"dimensionWhiteList"),"tower",tower(resolved));
    }
    static void capture(ClassLoader loader,Path out)throws Exception {
        Class<?> config=loader.loadClass("thaumcraft.common.config.Config"),generator=loader.loadClass("thaumcraft.common.lib.world.ThaumcraftWorldGenerator"),handler=loader.loadClass("thaumcraft.common.lib.world.biomes.BiomeHandler");
        Map<String,Object> tc=new LinkedHashMap<>();
        for(String name:new String[]{"genAura","genStructure","genTrees","genCinnibar","genAmber","genInfusedStone","nodeRarity"})tc.put(name,field(config,name));
        tc.put("dimensionBlacklist",invoke(generator,"getDimBlacklist",0));
        Object magical=field(generator,"biomeMagicalForest"),taint=field(generator,"biomeTaint");
        Class<?> base=loader.loadClass("net.minecraft.world.biome.BiomeGenBase"),dictionary=loader.loadClass("net.minecraftforge.common.BiomeDictionary");
        Object array;
        try{array=invoke(base,"getBiomeGenArray");}catch(NoSuchMethodException e){array=invoke(base,"func_150565_n");}
        Object sand=mcField(loader.loadClass("net.minecraft.init.Blocks"),"sand","field_150354_m");
        Map<String,Object> biomes=new LinkedHashMap<>();
        for(int i=0;i<Array.getLength(array);i++) {
            Object b=Array.get(array,i);if(b==null)continue;
            int id=((Number)mcField(b,"biomeID","field_76756_M")).intValue();
            List<String> tags=new ArrayList<>();Object types=invoke(dictionary,"getTypesForBiome",b);
            for(int j=0;j<Array.getLength(types);j++)tags.add(String.valueOf(Array.get(types,j)));
            biomes.put(Integer.toString(id),map("name",mcField(b,"biomeName","field_76791_y"),"tags",tags,
                "blacklist",invoke(generator,"getBiomeBlacklist",id),"greatwood",invoke(handler,"getBiomeSupportsGreatwood",id),
                "silverwood",b!=magical&&b!=taint&&(tags.contains("MAGICAL")||b==mcField(base,"forestHills","field_76785_t")||b==mcField(base,"birchForestHills","field_150582_Q")),
                "hotSand",mcField(b,"topBlock","field_76752_A")==sand&&((Number)mcField(b,"temperature","field_76750_F")).floatValue()>1f,
                "temple",b==mcField(base,"jungle","field_76782_w")||b==mcField(base,"jungleHills","field_76792_x")?"JUNGLE":b==mcField(base,"swampland","field_76780_h")?"SWAMP":b==mcField(base,"desert","field_76769_d")||b==mcField(base,"desertHills","field_76786_s")?"DESERT":null));
        }
        Class<?> rogue=loader.loadClass("greymerk.roguelike.config.RogueConfig");
        Object resolver=field(loader.loadClass("greymerk.roguelike.dungeon.Dungeon"),"settingsResolver"),defaultSettings=field(resolver,"base");
        Map<String,Object> r=map("natural",invoke(rogue,"getBoolean",field(rogue,"DONATURALSPAWN")),"novelty",invoke(rogue,"getBoolean",field(rogue,"DONOVELTYSPAWN")),
            "frequency",invoke(rogue,"getInt",field(rogue,"SPAWNFREQUENCY")),"blacklist",invoke(rogue,"getIntList",field(rogue,"DIMENSIONBL")),"whitelist",invoke(rogue,"getIntList",field(rogue,"DIMENSIONWL")),"base",setting(defaultSettings,defaultSettings));
        List<Object> builtin=new ArrayList<>(),custom=new ArrayList<>();r.put("builtin",builtin);r.put("custom",custom);
        Class<?> settings=loader.loadClass("greymerk.roguelike.dungeon.settings.DungeonSettings");
        for(Object s:(List<?>)field(resolver,"builtin"))builtin.add(setting(s,settings.getConstructor(settings,settings).newInstance(defaultSettings,s)));
        for(Map.Entry<?,?> e:((Map<?,?>)field(resolver,"settings")).entrySet())custom.add(setting(e.getValue(),invoke(resolver,"getWithDefault",e.getKey())));
        Files.write(out.resolve("surface-structure-profile.json"),RuntimeProfileAgent.json(map("schemaVersion",1,"thaumcraft",tc,"roguelike",r,"biomes",biomes)).getBytes(StandardCharsets.UTF_8));
    }
}
