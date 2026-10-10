// A schematic explanation only: this does not call or simulate world generation.
export function createNoticeDiagram(root, getLanguage) {
  const directions = [
    {key: 'nw', x: 0, z: 0, arrow: '↘', result: 'B'},
    {key: 'ne', x: 4, z: 0, arrow: '↙', result: 'A'},
    {key: 'sw', x: 0, z: 4, arrow: '↗', result: 'A'},
    {key: 'se', x: 4, z: 4, arrow: '↖', result: '∅'},
  ];
  const text = {
    zh: {
      controls: '区块生成示意阶段',
      phases: ['未加载', '开始加载', '推进至中心', '加载完成'],
      directions: {nw: '西北进入', ne: '东北进入', sw: '西南进入', se: '东南进入'},
      compass: '上北 −Z · 下南 +Z · 左西 / 右东',
      scale: '5 × 5 区块 · 每格 16 × 16 方块',
      order: '数字 1 → 9 表示对角推进示意顺序；实际次序由游戏调度决定。',
      states: {unloaded: '未加载', loading: '加载中', mismatch: '中心不一致', loaded: '已加载／中心一致', affected: '受地物顺序影响'},
      pending: '中心区块尚未加载',
      loading: '中心区块加载中',
      results: {A: 'A 通过 → 缓存 A', B: 'A 失败 → B 通过 → 缓存 B', '∅': '候选均失败 → 重试耗尽 → 空'},
      example: '候选结果示例：',
    },
    en: {
      controls: 'Chunk generation illustration stage',
      phases: ['Unloaded', 'Start loading', 'Reach centre', 'Fully loaded'],
      directions: {nw: 'From northwest', ne: 'From northeast', sw: 'From southwest', se: 'From southeast'},
      compass: 'N −Z ↑ · S +Z ↓ · W left / E right',
      scale: '5 × 5 chunks · Each cell: 16 × 16 blocks',
      order: 'Numbers 1 → 9 illustrate diagonal progression; the game schedules the actual order.',
      states: {unloaded: 'Unloaded', loading: 'Loading', mismatch: 'Centre differs', loaded: 'Loaded / centre matches', affected: 'Affected by decoration order'},
      pending: 'Centre chunk not yet loaded',
      loading: 'Centre chunk loading',
      results: {A: 'A passes → cache A', B: 'A fails → B passes → cache B', '∅': 'All fail → retries exhausted → empty'},
      example: 'Example candidate outcome: ',
    },
  };
  let phase = 1;
  const element = (tag, className, parent) => {
    const node = document.createElement(tag);
    node.className = className;
    parent.append(node);
    return node;
  };
  const scale = element('div', 'notice-diagram-scale', root);
  const order = element('div', 'notice-diagram-scale', root);
  const key = element('div', 'notice-diagram-key', root);
  const swatches = ['unloaded', 'loading', 'mismatch', 'loaded', 'affected'].map(state => {
    const label = element('span', '', key);
    const swatch = element('span', 'notice-diagram-swatch', label);
    swatch.dataset.state = state;
    swatch.setAttribute('aria-hidden', 'true');
    const caption = element('span', '', label);
    return {state, caption};
  });
  const compass = element('div', 'notice-diagram-compass', root);
  const controls = element('div', 'notice-diagram-controls', root);
  controls.setAttribute('role', 'group');
  const buttons = Array.from({length: 4}, (_, index) => {
    const button = element('button', '', controls);
    button.type = 'button';
    button.addEventListener('click', () => { phase = index; refresh(); });
    return button;
  });
  const maps = element('div', 'notice-diagram-maps', root);
  const panels = directions.map(direction => {
    const panel = element('div', 'notice-diagram-panel', maps);
    const title = element('h4', '', panel);
    const grid = element('div', 'notice-chunk-grid', panel);
    grid.setAttribute('role', 'img');
    const cells = Array.from({length: 25}, () => {
      const cell = element('div', 'notice-chunk', grid);
      cell.setAttribute('aria-hidden', 'true');
      return cell;
    });
    const result = element('div', 'notice-diagram-result', panel);
    return {direction, title, grid, cells, result};
  });
  const status = element('div', 'sr-only', root);
  status.setAttribute('aria-live', 'polite');
  function refresh() {
    const t = text[getLanguage()] || text.zh;
    scale.textContent = t.scale;
    order.textContent = t.order;
    swatches.forEach(({state, caption}) => { caption.textContent = t.states[state]; });
    controls.setAttribute('aria-label', t.controls);
    buttons.forEach((button, index) => {
      button.textContent = `${index + 1}. ${t.phases[index]}`;
      button.setAttribute('aria-pressed', String(index === phase));
    });
    for (const {direction: d, title, grid, cells, result} of panels) {
      title.textContent = `${t.directions[d.key]} ${d.arrow}`;
      const outcome = phase === 3 ? t.example + t.results[d.result] : phase === 2 ? t.loading : t.pending;
      grid.setAttribute('aria-label', `${t.directions[d.key]}: ${t.phases[phase]}. ${outcome}`);
      cells.forEach((cell, index) => {
        const x = index % 5, z = Math.floor(index / 5);
        const distance = Math.abs(x - d.x) + Math.abs(z - d.z);
        const frontier = phase === 0 ? -1 : phase === 1 ? 0 : phase === 2 ? 4 : 9;
        const generated = distance <= frontier;
        const first = x === d.x && z === d.z, center = x === 2 && z === 2;
        // Illustrative overlap footprint, not terrain data or a Minecraft scheduler:
        // later decoration touches previously loaded neighbours of the centre.
        const affected = Math.abs(x - 2) + Math.abs(z - 2) === 1 && distance < 4;
        let state = !generated ? 'unloaded' : distance === frontier ? 'loading' : 'loaded';
        if (phase >= 2 && affected) state = 'affected';
        if (phase === 3 && center && d.result !== 'A') state = 'mismatch';
        cell.dataset.state = state;
        cell.dataset.step = generated ? String(distance + 1) : '';
        cell.classList.toggle('first', first && phase > 0);
        cell.classList.toggle('center', center);
        cell.textContent = generated ? String(distance + 1) : '';
        if (center) {
          cell.textContent = '';
          const step = element('span', 'notice-chunk-step', cell);
          step.textContent = generated ? String(distance + 1) : '';
          const marker = element('span', 'notice-chunk-marker', cell);
          marker.textContent = phase === 3 ? (d.result === 'A' ? '✓' : '×') : '◎';
        }
      });
      result.textContent = outcome;
    }
    compass.textContent = t.compass;
    status.textContent = t.phases[phase];
  }
  refresh();
  return {refresh};
}
