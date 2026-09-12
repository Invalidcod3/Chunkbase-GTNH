"""Validate one-shot attachment and tick-thread scheduling without a game process."""
import json
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
ROOT=Path(__file__).resolve().parents[1]


class LiveCaptureTest(unittest.TestCase):
    def test_attach_reads_existing_worker_without_rewriting_classes(self):
        self.capture('amidst-rwg-profile.jar')

    def test_jvm_observation_fallback(self):
        self.capture('amidst-rwg-observed.jar')

    def test_isolated_versioned_helper(self):
        self.capture('amidst-capture-entry.jar')

    def test_incomplete_profile_is_reported_as_failure(self):
        self.capture('amidst-capture-entry.jar', broken=True)

    def capture(self, agent_name, broken=False):
        sources={
            'PerlinNoise.java':'package rwg.util; public class PerlinNoise {}',
            'ChunkManagerRealistic.java':'''package rwg.world; import java.util.*;
public class ChunkManagerRealistic {
 Object perlin=new rwg.util.PerlinNoise();
 static class Base {int biomeID=1;String biomeName="Fixture";}
 static class B {int biomeID=3;Base baseBiome=new Base(),riverBiome=baseBiome;}
 List<B> biomes_snow=Arrays.asList(new B()),biomes_cold=biomes_snow,biomes_hot=biomes_snow,biomes_wet=Collections.emptyList(),biomes_small=biomes_wet;
 int biomes_snowLength=1,biomes_coldLength=1,biomes_hotLength=1,biomes_wetLength=0,biomes_smallLength=0;
 boolean wetEnabled=false,smallEnabled=false;
}''',
            'RwgRuntimeClasses.java':'''package amidst.gtnh.worker; import java.util.*;
public class RwgRuntimeClasses {static Map<String,byte[]> CLASSES=new HashMap<>();}''',
            'WorkerTickHooks.java':'''package amidst.gtnh.worker;
import java.util.*;import java.util.concurrent.*;import java.nio.file.*;
public class WorkerTickHooks {
 static class Sampler {Object manager=new rwg.world.ChunkManagerRealistic();}
 static class Server {Map<Long,Object> arbitrarySeedSamplers=new HashMap<>();BlockingQueue<Runnable> serverThreadQueries=new LinkedBlockingQueue<>();}
 static Server worker=new Server();
 public static void main(String[] args)throws Exception{
 worker.arbitrarySeedSamplers.put(0L,new Sampler());
 RwgRuntimeClasses.CLASSES.put("rwg.world.ChunkManagerRealistic",Files.readAllBytes(Paths.get(args[0],"rwg/world/ChunkManagerRealistic.class")));
 Files.write(Paths.get(args[1],"ready"),new byte[0]);
 while(!Files.exists(Paths.get(args[1],"stop"))){Runnable task=worker.serverThreadQueries.poll(100,TimeUnit.MILLISECONDS);if(task!=null)task.run();}
 System.out.println("EXIT_OK");
 }
}'''}
        if broken:
            sources['ChunkManagerRealistic.java']=sources['ChunkManagerRealistic.java'].replace('Object perlin=new rwg.util.PerlinNoise();','Object perlin=null;')
        with tempfile.TemporaryDirectory(dir=ROOT/'.test-work') as directory:
            work=Path(directory);classes=work/'classes';classes.mkdir()
            for name,text in sources.items():(work/name).write_text(text,'utf-8')
            subprocess.run(['javac','-d',str(classes),*[str(work/name) for name in sources]],check=True)
            process=subprocess.Popen(['java','-cp',str(classes),'amidst.gtnh.worker.WorkerTickHooks',str(classes),str(work)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            try:
                for _ in range(100):
                    if (work/'ready').exists():break
                    time.sleep(.05)
                self.assertTrue((work/'ready').exists())
                out=work/'capture'
                argument=out
                if agent_name=='amidst-capture-entry.jar':
                    properties=(ROOT/'private-packs/live-capture.properties').read_text('utf-8')
                    helper=next(line for line in properties.splitlines() if line.startswith('helper='))
                    argument=work/'capture.properties';argument.write_text(helper+'\noutput='+out.as_posix()+'\nmode=observed\n','utf-8')
                attached=subprocess.run(['java','--add-modules','jdk.attach','-cp',str(ROOT/'artifacts/profile-agent'),'AttachCapture',str(process.pid),str(ROOT/'artifacts/profile-agent'/agent_name),str(argument)],check=not broken,timeout=40,capture_output=True,text=True)
                if broken:
                    self.assertNotEqual(attached.returncode,0)
                    self.assertFalse((out/'capture-result.json').exists())
                    self.assertIn('not fully initialized',(out/'capture-error.txt').read_text('utf-8'))
                else:
                    result=json.loads((out/'capture-result.json').read_text('utf-8'))
                    self.assertTrue(result['ok']);self.assertGreaterEqual(result['classes'],1)
                    profiles=list((out/'profiles').glob('*.json'));self.assertEqual(len(profiles),1)
                    self.assertEqual(json.loads(profiles[0].read_text('utf-8'))['groups']['snow'],[3])
                    self.assertGreater(len(json.loads(profiles[0].read_text('utf-8'))['objects']),0)
            finally:
                (work/'stop').touch()
                stdout,stderr=process.communicate(timeout=5)
            self.assertIn('EXIT_OK',stdout)


if __name__=='__main__':unittest.main()
