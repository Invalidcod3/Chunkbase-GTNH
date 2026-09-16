// Mirrors Amidst's BiomeSelection and BiomeColor.createHiddenRGB. Namespace
// keys avoid collisions between mod registries and synthetic display IDs.
export class BiomeSelection {
  constructor(saved) {
    this.enabled = saved?.enabled ?? false;
    this.defaultSelected = saved?.defaultSelected ?? false;
    this.exceptions = new Set(saved?.exceptions || []);
  }
  isSelected(key) { return this.exceptions.has(key) !== this.defaultSelected; }
  toggle(key) { this.exceptions.has(key) ? this.exceptions.delete(key) : this.exceptions.add(key); }
  selectAll(value) { this.defaultSelected = value; this.exceptions.clear(); }
  toJSON() { return {enabled:this.enabled,defaultSelected:this.defaultSelected,exceptions:[...this.exceptions]}; }
}

export function biomeRgb(biome, selection) {
  const rgb = parseInt((biome?.color || '#454545').slice(1),16);
  if (!selection?.enabled || selection.isSelected(biome?.key)) return rgb;
  const r=rgb>>16, g=(rgb>>8)&255, b=rgb&255, sum=r+g+b;
  return (Math.floor((r+sum)/30)<<16) | (Math.floor((g+sum)/30)<<8) | Math.floor((b+sum)/30);
}

export function dimensionBiomes(dimension, biomes) {
  const fixed=dimension?.uniformBiome || dimension?.biome;
  if (fixed) return biomes.filter(b=>b.key===fixed);
  const keys=dimension?.biomeKeys;
  return biomes.filter(b=>keys ? keys.includes(b.key) : b.legacy?.some(a=>a.dimension===dimension?.key));
}
