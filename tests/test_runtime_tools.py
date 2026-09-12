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
