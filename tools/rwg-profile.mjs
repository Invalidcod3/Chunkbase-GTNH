// Maintenance contract: selection identities are not final Minecraft biome IDs.
export function validateSelectionProfile(profile, expectedManagerSha256) {
  if (
    profile?.schemaVersion !== 1 ||
    profile.kind !== "rwg-runtime-selection-profile" ||
    profile.managerClass !== "rwg.world.ChunkManagerRealistic" ||
    profile.finalSurfaceReady !== false
  )
    throw new Error("Unsupported RWG selection profile");
  if (
    !/^[a-f0-9]{64}$/.test(expectedManagerSha256 || "") ||
    profile.observedManagerSha256 !== expectedManagerSha256
  )
    throw new Error(
      "Runtime manager bytecode differs from the compiled adapter; extract and validate that version first",
    );
  if (
    ![
      "perlin",
      "open-simplex",
      "wrapped-perlin",
      "wrapped-open-simplex",
    ].includes(profile.noise)
  )
    throw new Error("Unsupported noise implementation");
  if (!Array.isArray(profile.biomes) || profile.biomes.length > 256)
    throw new Error("Invalid biome catalog");
  const ids = new Set();
  for (const biome of profile.biomes) {
    if (
      !Number.isInteger(biome.id) ||
      biome.id < 0 ||
      biome.id > 255 ||
      ids.has(biome.id) ||
      typeof biome.class !== "string"
    )
      throw new Error("Invalid or duplicate realistic biome ID");
    ids.add(biome.id);
    for (const value of [biome.base, biome.river]) {
      if (
        !Number.isInteger(value?.legacyId) ||
        value.legacyId < 0 ||
        typeof value.name !== "string" ||
        typeof value.class !== "string"
      )
        throw new Error("Missing base/river biome provenance");
    }
  }
  const groups = ["snow", "cold", "hot", "wet", "small"].map((name, index) => {
    const values = profile.groups?.[name];
    if (
      !Array.isArray(values) ||
      values.length > 4096 ||
      (index < 3 && !values.length) ||
      !values.every((id) => ids.has(id))
    )
      throw new Error("Invalid climate group: " + name);
    return Int32Array.from(values); // Repetitions and ordering encode sampling weights.
  });
  if (
    profile.wetEnabled !== groups[3].length > 0 ||
    profile.smallEnabled !== groups[4].length > 0
  )
    throw new Error(
      "Climate switches differ from the supported initialization adapter",
    );
  return { noise: profile.noise, groups };
}

export function configureSelection(
  engine,
  profile,
  expectedManagerSha256,
  seed,
) {
  const { noise, groups } = validateSelectionProfile(
    profile,
    expectedManagerSha256,
  );
  if (
    typeof seed !== "string" ||
    !/^-?\d+$/.test(seed) ||
    BigInt(seed) < -(1n << 63n) ||
    BigInt(seed) >= 1n << 63n
  )
    throw new Error("Invalid 64-bit seed");
  engine.configure(seed, noise, ...groups);
}
