"""Prepare reviewed bytecode and report dependencies for the extra biome/space library."""
from pathlib import Path
import os,subprocess
ROOT=Path(__file__).resolve().parents[1]
work=ROOT/'.test-work/space-compiler';work.mkdir(parents=True,exist_ok=True)
cache=ROOT/'.test-work/noise-compiler'
cp=os.pathsep.join(str(cache/f'repository/org/ow2/asm/{n}/9.8/{n}-9.8.jar') for n in ['asm','asm-tree','asm-commons'])
subprocess.run(['javac','-cp',cp,'-d',str(work),str(ROOT/'tools/space-compiler/SpaceSlice.java')],check=True)
with (work/'dependencies.txt').open('w') as log:subprocess.run(['java','-cp',str(work)+os.pathsep+cp,'SpaceSlice',str(ROOT/'private-packs/space-input/input.jar'),str(work/'selection-input.jar')],check=True,stdout=log)
print('Prepared separate space generation slice.')
