"""Exercise the built constructor hook against controlled JVM fixtures, not GTNH."""
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class ProfileAgentTest(unittest.TestCase):
    def test_constructor_capture_preserves_execution_and_weighted_lists(self):
        with tempfile.TemporaryDirectory(dir=ROOT/'.test-work') as directory:
            work=Path(directory)
            source=work/'src';source.mkdir()
            noise=source/'PerlinNoise.java'
            noise.write_text('package rwg.util; public class PerlinNoise {}','utf-8')
            manager=source/'ChunkManagerRealistic.java'
            manager.write_text('''package rwg.world;
import java.util.*;
public class ChunkManagerRealistic {
  Object perlin;
  List<B> biomes_snow,biomes_cold,biomes_hot,biomes_wet,biomes_small;
  int biomes_snowLength,biomes_coldLength,biomes_hotLength,biomes_wetLength,biomes_smallLength;
  boolean wetEnabled,smallEnabled;
  static class Base { public int biomeID=31; public String biomeName="Quoted \\"Biome\\""; }
  static class B { public int biomeID; public Base baseBiome=new Base(),riverBiome=baseBiome; B(int id){biomeID=id;} }
  protected ChunkManagerRealistic() {}
  public ChunkManagerRealistic(int unused) {
    this();perlin=new rwg.util.PerlinNoise(); B a=new B(3),b=new B(7);
    biomes_snow=Arrays.asList(a,a,b);biomes_cold=Arrays.asList(b,a);biomes_hot=Arrays.asList(a);
    biomes_wet=new ArrayList<>();biomes_small=new ArrayList<>();
    biomes_snowLength=3;biomes_coldLength=2;biomes_hotLength=1;
  }
  public static void main(String[] args) { new ChunkManagerRealistic(1);new ChunkManagerRealistic(2);System.out.println("RESULT=42"); }
}''','utf-8')
            classes=work/'classes';classes.mkdir()
            subprocess.run(['javac','-encoding','UTF-8','-d',str(classes),str(noise),str(manager)],check=True)
            out=work/'profiles'
            result=subprocess.run(['java',f'-javaagent:{ROOT}/artifacts/profile-agent/amidst-rwg-profile.jar={out}','-cp',str(classes),'rwg.world.ChunkManagerRealistic'],check=True,text=True,capture_output=True)
            self.assertIn('RESULT=42',result.stdout)
            self.assertNotIn('Unable',result.stderr)
            files=list(out.glob('*.json'));self.assertEqual(len(files),1)
            profile=json.loads(files[0].read_text('utf-8'))
            self.assertEqual(profile['groups']['snow'],[3,3,7])
            self.assertEqual(profile['groups']['cold'],[7,3])
            self.assertEqual(profile['biomes'][0]['base']['name'],'Quoted "Biome"')
            self.assertFalse(profile['finalSurfaceReady'])
            self.assertEqual(profile['noise'],'perlin')
            self.assertEqual(profile['observedManagerSha256'],hashlib.sha256((classes/'rwg/world/ChunkManagerRealistic.class').read_bytes()).hexdigest())


if __name__=='__main__':unittest.main()
