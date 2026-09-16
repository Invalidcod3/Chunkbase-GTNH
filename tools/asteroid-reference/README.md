# Desktop reference

`AsteroidOrePredictor.java` and `GtnhXstrRandom.java` are unchanged copies from
Amidst-GTNH commit `0800217de08a041f0a694ac258292151ab84ccda`,
`gtnh-worker/src/main/java/amidst/gtnh/worker/`, under GPL-3.0 (see root LICENSE).
`AsteroidReferenceBridge.java` adapts package-private methods for the capture helper.

The helper invokes the reference selector with the actual initialized GalacticGreg
stone and ore selectors. It captures no saved records, places no blocks, and does
not replace the game's Worker classes (the helper has an isolated class loader).
The capture receipt pins the exact Java files and game jars by SHA-256.

The supplied instance's Materials API exposes `getDefaultLocalName`, not the newer
desktop adapter's `getLocalizedName`. The capture supports both; this fallback
affects display labels only, never weights or random draws.
