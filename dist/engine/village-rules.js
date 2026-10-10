// Profiles are tied to a generator/configuration snapshot, not just a mod's presence.
export const rwgVillageRules = Object.freeze({schemaVersion: 1, algorithm: 'rwg', distance: 24, separation: 8, originRadius: 0});

export function validateVillageRules(profile = rwgVillageRules) {
  if (profile.schemaVersion !== 1 || !['rwg', 'village-names-4'].includes(profile.algorithm))
    throw new Error('Unsupported village generator profile');
  const {distance, separation, originRadius} = profile;
  if (![distance, separation, originRadius].every(Number.isInteger) || separation < 1 || distance <= separation
      || distance > 2147483647 || originRadius < 0 || originRadius > 100000)
    throw new Error('Invalid village spacing or origin radius');
  if (profile.algorithm === 'village-names-4' && (!Array.isArray(profile.biomeNames) || profile.biomeNames.some(v => typeof v !== 'string')))
    throw new Error('Missing Village Names biome names');
  return profile;
}

export function outsideVillageOrigin(cx, cz, rules) {
  // VN 4.x uses signed Java int products and addition, even at distant coordinates.
  return rules.algorithm !== 'village-names-4'
    || ((Math.imul(cx, cx) + Math.imul(cz, cz)) | 0) >= Math.imul(rules.originRadius, rules.originRadius);
}
