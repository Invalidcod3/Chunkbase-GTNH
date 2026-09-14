import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

ROOT=Path(__file__).resolve().parents[1]


def module(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'tools'/f'{name}.py')
    result=importlib.util.module_from_spec(spec);spec.loader.exec_module(result)
    return result


class RuntimeToolsTest(unittest.TestCase):
    def test_query_preserves_dimension_full_seed_and_read_only_boundary(self):
        client=module('worker-query')
        with tempfile.TemporaryDirectory(dir=ROOT/'.test-work') as directory:
            config=Path(directory)/'config';config.mkdir()
            (config/'amidstgtnhworker.cfg').write_text('S:token=test-secret\n','utf-8')
            connection=MagicMock();connection.__enter__.return_value=connection
            connection.makefile.return_value=io.BytesIO(b'{"ok":true,"token":"test-secret","nested":{"token":"test-secret"}}\n')
            with patch.object(client.socket,'create_connection',return_value=connection):
                result=client.query(directory,'prospecting',9007199254740993,dimension=-1,marker_mode='FLUID',width=512,height=512)
            request=json.loads(connection.sendall.call_args.args[0])
            self.assertEqual((request['dimension'],request['seed'],request['markerMode']),(-1,9007199254740993,'FLUID'))
            self.assertNotIn('test-secret',json.dumps(result))
            for command in ['import_waypoints','delete','']:
                with self.assertRaises(ValueError):client.query(directory,command)
            with self.assertRaises(ValueError):client.query(directory,'prospecting',width=513)

    def test_calibration_rejects_save_records_and_keeps_completed_cases(self):
        collector=module('collect-calibration')
        with tempfile.TemporaryDirectory(dir=ROOT/'.test-work') as directory:
            output=Path(directory)/'result.json'
            cases=[{'id':'catalog','command':'prospecting_catalog'},{'id':'fluid','command':'prospecting','seed':'9007199254740993'}]
            replies=[{'ok':True},{'ok':True,'prospecting':{'deposits':[{'source':'CURRENT/INITIAL','currentAmounts':[True]}]}}]
            with patch.object(collector.client,'query',side_effect=replies):
                with self.assertRaisesRegex(ValueError,'Save records'):collector.collect('unused',{'schemaVersion':1,'cases':cases},output)
            result=json.loads(output.read_text('utf-8'))
            self.assertFalse(result['complete']);self.assertEqual(result['failedCase'],'fluid');self.assertEqual(len(result['cases']),1)
            with patch.object(collector.client,'query',return_value={'ok':True}) as request:
                result=collector.collect('unused',{'schemaVersion':1,'cases':cases},output)
                self.assertTrue(result['complete']);self.assertEqual(request.call_args.kwargs['seed'],9007199254740993)
            with self.assertRaises(ValueError):collector.collect('unused',{'schemaVersion':1,'cases':[{'id':'bad','command':'import_waypoints'}]},output)

    def test_probe_requires_successful_protocol_response(self):
        inspector=module('inspect-environment')
        with tempfile.TemporaryDirectory(dir=ROOT/'.test-work') as directory:
            config=Path(directory)/'config';config.mkdir()
            (config/'amidstgtnhworker.cfg').write_text('S:token=test-secret\n','utf-8')
            connection=MagicMock();connection.__enter__.return_value=connection
            connection.makefile.return_value=io.BytesIO(b'{"ok":false,"error":"unsupported protocol"}\n')
            with patch.object(inspector.socket,'create_connection',return_value=connection):
                result=inspector.collect(directory,True)
            self.assertFalse(result['worker']['available'])
            request=json.loads(connection.sendall.call_args.args[0])
            self.assertEqual(request['protocol'],21)
            self.assertNotIn('test-secret',json.dumps(result))

    def test_restore_accepts_qt_quoting_and_preserves_unrelated_settings(self):
        helper=module('prepare-runtime-capture')
        with tempfile.TemporaryDirectory(dir=ROOT/'.test-work') as directory:
            helper.ROOT=Path(directory)
            folder=helper.ROOT/'private-packs/runtime-session';folder.mkdir(parents=True)
            instance=helper.ROOT/'instance';instance.mkdir()
            cfg=instance/'instance.cfg'
            cfg.write_text('[General]\nOverrideJavaArgs=true\nJvmArgs="-javaagent:test.jar=out"\nMemory=6144\n','utf-8')
            state={'instance':str(instance),'original':{'OverrideJavaArgs':'false','JvmArgs':''},'temporary':{'OverrideJavaArgs':'true','JvmArgs':'-javaagent:test.jar=out'}}
            (folder/'launcher-restore.json').write_text(json.dumps(state),'utf-8')
            helper.restore()
            restored=cfg.read_text('utf-8')
            self.assertIn('OverrideJavaArgs=false\nJvmArgs=\n',restored)
            self.assertIn('Memory=6144',restored)


if __name__=='__main__':unittest.main()
