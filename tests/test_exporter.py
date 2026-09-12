import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('exporter',ROOT/'tools/export-runtime.py')
exporter=importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)


class ExporterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (ROOT/'.test-work').mkdir(exist_ok=True)
        cls.temp=tempfile.TemporaryDirectory(dir=ROOT/'.test-work')
        cls.work=Path(cls.temp.name).resolve()
        assert cls.work.is_relative_to((ROOT/'.test-work').resolve())
        cls.src=cls.work/'src/example'
        cls.src.mkdir(parents=True)
        (cls.src/'Entry.java').write_text('''package example;
public class Entry {
  public static long query(long seed,int x){return Helper.mix(seed,x);}
  public static int dense(int x){switch(x){case 0:return 8;case 1:return 5;case 2:return 4;default:return 9;}}
  public static int sparse(int x){switch(x){case 0:return 8;case 1900:return 4;default:return 9;}}
  public static Class<?> reflective(String name)throws Exception{return Class.forName(name);}
  public static Runnable dynamic(){return ()->System.out.println("λ 中文 🗺");}
  public static void main(String[] a){System.out.println(query(42,7));}
}''','utf-8')
        (cls.src/'Helper.java').write_text('package example; public class Helper {public static long mix(long s,int x){return s^(x*341873128712L);}}','utf-8')
        cls.classes=cls.work/'classes';cls.classes.mkdir()
        subprocess.run(['javac','-encoding','UTF-8','-d',str(cls.classes),*map(str,cls.src.glob('*.java'))],check=True,capture_output=True)
        cls.instance=cls.work/'instance';(cls.instance/'mods').mkdir(parents=True)
        with zipfile.ZipFile(cls.instance/'mods/example.jar','w') as jar:
            for p in cls.classes.rglob('*.class'):jar.write(p,p.relative_to(cls.classes).as_posix())

    @classmethod
    def tearDownClass(cls):cls.temp.cleanup()

    def test_closure_graph_and_explicit_browser_boundary(self):
        output=self.work/'package.zip'
        report=exporter.export(self.instance,['example.Entry#query'],output)
        self.assertEqual(report['classes'],2)
        self.assertFalse(report['browserExecutable'])
        self.assertEqual(report['missingClasses'],[])
        self.assertTrue(report['reflection'])
        self.assertTrue(report['dynamicFeatures'])
        with zipfile.ZipFile(output) as archive:
            graph=json.loads(archive.read('graph.json'))
            query=next(m for m in graph['example/Entry']['methods'] if m['name']=='query')
            self.assertEqual(query['calls'][0]['owner'],'example/Helper')
            self.assertIsNone(archive.testzip())
        with self.assertRaises(FileExistsError):exporter.export(self.instance,['example.Entry'],output)

    def test_missing_entry_is_explicit(self):
        report=exporter.export(self.instance,['missing.Class'],self.work/'missing.zip')
        self.assertEqual(report['missingClasses'],['missing/Class'])
        self.assertEqual(report['invalidEntries'],['missing/Class'])

    def test_invalid_class_and_duplicate_definitions(self):
        with self.assertRaises(ValueError):exporter.parse_class(b'bad data')
        duplicate=self.instance/'mods/duplicate.jar'
        duplicate.write_bytes((self.instance/'mods/example.jar').read_bytes())
        report=exporter.export(self.instance,['example.Entry'],self.work/'duplicate.zip')
        self.assertIn('example/Entry',report['ambiguousClasses'])

    def test_capture_agent_observes_classes_without_modifying_result(self):
        capture=self.work/'capture';props=self.work/'capture.properties'
        props.write_text('output='+capture.as_posix()+'\nprefixes=example/\n','utf-8')
        agent=ROOT/'artifacts/capture-agent/amidst-runtime-capture.jar'
        run=subprocess.run(['java',f'-javaagent:{agent}={props}','-cp',str(self.classes),'example.Entry'],capture_output=True,text=True,check=True)
        self.assertIn(str(42^(7*341873128712)),run.stdout)
        self.assertEqual(len(list(capture.rglob('*.class'))),2)
        report=exporter.export(self.instance,['example.Entry'],self.work/'captured.zip',capture)
        self.assertEqual(report['capturedClasses'],2)
        self.assertEqual(report['ambiguousClasses'],{})


if __name__=='__main__':unittest.main()
