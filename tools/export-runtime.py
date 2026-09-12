"""Read-only GTNH class dependency extraction. Python 3 standard library only.

Produces an intermediate JVM archive, NOT an executable browser function pack.
Class-level closure is deliberately conservative. Dynamic dispatch, reflection,
resources and initialized state remain explicit adapter work in report.json.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import zipfile


class Reader:
    def __init__(self, data):
        self.data, self.pos = data, 0

    def take(self, size):
        if size < 0 or self.pos + size > len(self.data):
            raise ValueError('Truncated class file')
        value = self.data[self.pos:self.pos + size]
        self.pos += size
        return value

    def u1(self): return self.take(1)[0]
    def u2(self): return struct.unpack('>H', self.take(2))[0]
    def u4(self): return struct.unpack('>I', self.take(4))[0]


def decode_modified_utf8(data):
    # JVM's modified UTF-8 encodes NUL and UTF-16 surrogate pairs specially.
    text = data.replace(b'\xc0\x80', b'\x00').decode('utf-8', 'surrogatepass')
    return text.encode('utf-16', 'surrogatepass').decode('utf-16', 'replace')


def instruction_refs(code):
    """Return CP indexes of field accesses and invocation instructions."""
    pos, refs = 0, []
    one = {16, 18, 21, 22, 23, 24, 25, 54, 55, 56, 57, 58, 169, 188}
    two = {17, 19, 20, 132, *range(153, 169), *range(178, 185), 187, 189, 192, 193, 198, 199}
    while pos < len(code):
        start, op = pos, code[pos]
        pos += 1
        if 178 <= op <= 186:
            if pos + 2 > len(code): raise ValueError('Truncated invoke')
            refs.append((op, int.from_bytes(code[pos:pos + 2], 'big')))
        if op in one: pos += 1
        elif op in two: pos += 2
        elif op in (185, 186, 200, 201): pos += 4
        elif op == 197: pos += 3
        elif op == 196:
            if pos >= len(code): raise ValueError('Truncated wide')
            pos += 5 if code[pos] == 132 else 3
        elif op in (170, 171):
            pos += (-pos) % 4
            if pos + 8 > len(code): raise ValueError('Truncated switch')
            if op == 170:
                if pos + 12 > len(code): raise ValueError('Truncated tableswitch')
                low, high = struct.unpack('>ii', code[pos + 4:pos + 12])
                if high < low: raise ValueError('Invalid tableswitch')
                pos += 12 + 4 * (high - low + 1)
            else:
                count = int.from_bytes(code[pos + 4:pos + 8], 'big', signed=True)
                if count < 0: raise ValueError('Invalid lookupswitch')
                pos += 8 + 8 * count
        elif op > 201:
            raise ValueError('Unsupported JVM opcode ' + str(op))
        if pos > len(code): raise ValueError('Truncated instruction at ' + str(start))
    return refs


def parse_class(data):
    r = Reader(data)
    if r.u4() != 0xcafebabe: raise ValueError('Not a class file')
    minor, major, count = r.u2(), r.u2(), r.u2()
    cp, i = [None] * count, 1
    while i < count:
        tag = r.u1()
        if tag == 1: cp[i] = (tag, decode_modified_utf8(r.take(r.u2())))
        elif tag in (3, 4): cp[i] = (tag, r.take(4))
        elif tag in (5, 6): cp[i] = (tag, r.take(8)); i += 1
        elif tag in (7, 8, 16, 19, 20): cp[i] = (tag, r.u2())
        elif tag in (9, 10, 11, 12, 17, 18): cp[i] = (tag, r.u2(), r.u2())
        elif tag == 15: cp[i] = (tag, r.u1(), r.u2())
        else: raise ValueError('Unsupported constant pool tag ' + str(tag))
        i += 1

    def utf(index): return cp[index][1]
    def cls(index): return utf(cp[index][1]) if index else None
    access, this, superclass = r.u2(), r.u2(), r.u2()
    interfaces = [cls(r.u2()) for _ in range(r.u2())]
    dependencies, dynamic, members, methods = set(), [], [], []
    for item in cp:
        if not item: continue
        if item[0] == 7:
            name = utf(item[1])
            dependencies.update(re.findall(r'L([^;]+);', name) if name.startswith('[') else [name])
        elif item[0] == 1:
            dependencies.update(re.findall(r'L([\w$/]+);', item[1]))
        elif item[0] in (17, 18): dynamic.append('constant-dynamic' if item[0] == 17 else 'invoke-dynamic')
    for section in ('fields', 'methods'):
        for _ in range(r.u2()):
            flags, name, descriptor = r.u2(), utf(r.u2()), utf(r.u2())
            calls, fields = [], []
            for _ in range(r.u2()):
                attr_name, size = utf(r.u2()), r.u4()
                raw = r.take(size)
                if section == 'methods' and attr_name == 'Code':
                    body = Reader(raw)
                    body.u2(); body.u2()
                    for opcode, index in instruction_refs(body.take(body.u4())):
                        entry = cp[index]
                        if entry[0] in (9, 10, 11):
                            nt = cp[entry[2]]
                            ref = {'owner': cls(entry[1]), 'name': utf(nt[1]), 'descriptor': utf(nt[2]), 'opcode': opcode}
                            (fields if opcode <= 181 else calls).append(ref)
                        else:
                            calls.append({'dynamic': True, 'constantPoolIndex': index})
            if section == 'methods':
                methods.append({'name': name, 'descriptor': descriptor, 'access': flags, 'calls': calls, 'fields': fields})
                if flags & 0x100: dynamic.append('native-method:' + name)
            else:
                members.append({'name': name, 'descriptor': descriptor, 'access': flags})
    for _ in range(r.u2()): r.u2(); r.take(r.u4())
    if r.pos != len(data): raise ValueError('Trailing class bytes')
    dependencies.discard(cls(this))
    return {'name': cls(this), 'superclass': cls(superclass), 'interfaces': interfaces, 'major': major,
            'dependencies': sorted(dependencies), 'methods': methods, 'fields': members, 'dynamic': sorted(set(dynamic))}


PLATFORM = ('java/', 'javax/', 'sun/', 'com/sun/', 'jdk/')


def export(instance, entries, output, capture=None, profile=None):
    instance, output = Path(instance).resolve(), Path(output).resolve()
    if not instance.is_dir(): raise ValueError('Instance directory does not exist')
    index, duplicates, jars, errors = {}, {}, {}, []
    roots = [instance / name for name in ('mods', 'libraries', 'versions', '.minecraft/mods', '.minecraft/libraries', '.minecraft/versions') if (instance / name).is_dir()]
    if not roots: roots = [instance]
    paths = sorted(set(p for root in roots for p in root.rglob('*.jar')))
    for jar in paths:
        if jar == output: continue
        try:
            with zipfile.ZipFile(jar) as archive:
                rel = jar.relative_to(instance).as_posix()
                jars[rel] = {'sha256': hashlib.sha256(jar.read_bytes()).hexdigest(), 'licenses': [n for n in archive.namelist() if re.search(r'(^|/)(license|copying|notice)', n, re.I)]}
                for name in archive.namelist():
                    if not name.endswith('.class') or name.startswith('META-INF/versions/'): continue
                    logical = name[:-6]
                    if logical in index: duplicates.setdefault(logical, [str(index[logical][0].relative_to(instance))]).append(rel)
                    else: index[logical] = (jar, name, False)
        except (OSError, zipfile.BadZipFile) as error:
            errors.append({'jar': jar.name, 'error': str(error)})
    captured = set()
    if capture:
        for file in sorted(Path(capture).resolve().rglob('*.class')):
            data = file.read_bytes()
            name = parse_class(data)['name']
            if name in captured and index[name][0].read_bytes() != data:
                raise ValueError('Multiple captured definitions for ' + name + '; select a single runtime capture')
            index[name] = (file, None, True)
            captured.add(name)
            duplicates.pop(name, None)
    profile_data = json.loads(Path(profile).read_text('utf-8')) if profile else {}
    entry_specs = [value.replace('.', '/').split('#', 1) for value in entries]
    queue = [parts[0] for parts in entry_specs]
    selected, graph, missing, platform, ambiguous = {}, {}, set(), set(), {}
    while queue:
        name = queue.pop()
        if name in graph or name in missing or name in platform: continue
        if name.startswith(PLATFORM): platform.add(name); continue
        if name not in index: missing.add(name); continue
        file, member, is_capture = index[name]
        if name in duplicates: ambiguous[name] = duplicates[name]
        if is_capture: data = file.read_bytes()
        else:
            with zipfile.ZipFile(file) as archive:
                if archive.getinfo(member).file_size > 16 * 1024 * 1024: raise ValueError('Class exceeds 16 MB')
                data = archive.read(member)
        info = parse_class(data)
        if info['name'] != name: raise ValueError('Class identity mismatch: ' + name)
        if name.startswith('/') or any(part in ('', '.', '..') for part in name.split('/')):
            raise ValueError('Unsafe class name: ' + name)
        info['origin'] = 'captured' if is_capture else file.relative_to(instance).as_posix()
        info['sha256'] = hashlib.sha256(data).hexdigest()
        graph[name], selected[name] = info, data
        queue.extend(info['dependencies'])
    invalid_entries = []
    for parts in entry_specs:
        if parts[0] not in graph or len(parts) == 2 and not any(m['name'] == parts[1] for m in graph[parts[0]]['methods']): invalid_entries.append('#'.join(parts))
    dynamic = [{'class': name, 'reasons': info['dynamic']} for name, info in graph.items() if info['dynamic']]
    reflection = [{'class': name, 'method': m['name'], 'call': call} for name, info in graph.items() for m in info['methods'] for call in m['calls'] if call.get('owner', '').startswith(('java/lang/reflect/', 'java/lang/invoke/')) or call.get('owner') == 'java/lang/Class' and call.get('name') in ('forName', 'newInstance', 'getMethod', 'getDeclaredMethod', 'getField', 'getDeclaredField')]
    report = {'schemaVersion': 1, 'stage': 'jvm-intermediate', 'browserExecutable': False, 'closure': 'conservative-class-references',
              'entries': entries, 'classes': len(graph), 'capturedClasses': len(captured & graph.keys()),
              'missingClasses': sorted(missing), 'invalidEntries': invalid_entries, 'ambiguousClasses': ambiguous,
              'platformAdaptersNeeded': sorted(platform), 'dynamicFeatures': dynamic, 'reflection': reflection, 'archiveErrors': errors,
              'remainingWork': ['Resolve virtual dispatch and reflective targets', 'Capture required registries and initialized state', 'Declare resources', 'Compile or adapt to browser runtime', 'Compare against original Worker', 'Review distribution permissions for selected content']}
    manifest = {'schemaVersion': 1, 'kind': 'gtnh-jvm-extraction', 'browserExecutable': False, 'entries': entries,
                'profile': profile_data, 'sources': jars, 'classHashes': {name: info['sha256'] for name, info in graph.items()}}
    output.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation prevents accidental overwrite of an existing export.
    with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(selected.items()): archive.writestr('classes/' + name + '.class', data)
        for name, value in [('manifest.json', manifest), ('graph.json', graph), ('report.json', report)]: archive.writestr(name, json.dumps(value, indent=2, ensure_ascii=True))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--instance', required=True, help='GTNH .minecraft / instance directory (read only)')
    parser.add_argument('--entry', action='append', required=True, help='Class name, optionally #method; repeatable')
    parser.add_argument('--capture', help='Directory captured by the JVM agent; overrides raw jar classes')
    parser.add_argument('--profile', help='Explicit environment profile JSON')
    parser.add_argument('--output', required=True, help='New private output ZIP, outside dist/')
    args = parser.parse_args()
    try:
        report = export(args.instance, args.entry, args.output, args.capture, args.profile)
        print(json.dumps({key: report[key] for key in ('stage', 'browserExecutable', 'classes', 'capturedClasses', 'missingClasses', 'invalidEntries', 'ambiguousClasses')}, indent=2))
        return 2 if report['missingClasses'] or report['invalidEntries'] or report['ambiguousClasses'] or report['archiveErrors'] else 0
    except (ValueError, OSError, zipfile.BadZipFile) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    raise SystemExit(main())
