import test from "node:test";
import assert from "node:assert/strict";
import { WorkerClient } from "../dist/engine/worker-client.js";
import { biomeRegistry } from "../dist/engine/catalog.js";
function fixture() {
  const worker = {
    messages: [],
    postMessage(message) {
      this.messages.push(message);
    },
    terminate() {
      this.terminated = true;
    },
  };
  let creations = 0;
  const client = new WorkerClient(() => {
    creations++;
    return worker;
  });
  return { worker, client, creations: () => creations };
}
test("switching worlds keeps one worker and discards delayed responses", async () => {
  const { client, worker, creations } = fixture();
  const old = client.request("predictStructures", { dimension: "moon" });
  const rejected = assert.rejects(old, /CANCELLED/);
  const previous = worker.messages.at(-1);
  client.reset();
  await rejected;
  const current = client.request("predictStructures", { dimension: "end" });
  const message = worker.messages.at(-1);
  worker.onmessage({
    data: { id: previous.id, epoch: previous.epoch, result: ["old"] },
  });
  worker.onmessage({
    data: { id: message.id, epoch: message.epoch, result: ["new"] },
  });
  assert.deepEqual(await current, ["new"]);
  for (let i = 0; i < 20; i++) client.reset();
  assert.equal(creations(), 1);
  assert.equal(worker.terminated, undefined);
});
test("reordered worker palette is mapped by namespace, not numeric position", async () => {
  const { client, worker } = fixture();
  const result = client.request("sampleBiomes", {});
  const message = worker.messages.at(-1);
  const palette = [
    "amidst:hee_enchanted_island",
    "amidst:central_end",
    "amidst:end_void",
  ];
  worker.onmessage({
    data: { ...message, result: new Uint16Array([0, 2, 1, 0]), palette },
  });
  assert.deepEqual(
    [...(await result)].map((index) => biomeRegistry.at(index).key),
    [palette[0], palette[2], palette[1], palette[0]],
  );
});
test("incompatible palette fails explicitly instead of producing a blank tile", async () => {
  const { client, worker } = fixture();
  for (const payload of [
    { result: new Uint16Array([0]) },
    { result: new Uint16Array([0]), palette: ["unknown:biome"] },
    { result: new Uint16Array([5]), palette: ["amidst:end_void"] },
  ]) {
    const response = client.request("sampleBiomes", {});
    const check = assert.rejects(response, /刷新|未声明/);
    worker.onmessage({ data: { ...worker.messages.at(-1), ...payload } });
    await check;
  }
});
test("unsupported maps return null and a worker failure rejects pending and new work", async () => {
  const { client, worker } = fixture();
  const missing = client.request("sampleBiomes", {});
  worker.onmessage({ data: { ...worker.messages.at(-1), result: null } });
  assert.equal(await missing, null);
  const pending = client.request("predictStructures", {});
  const rejected = assert.rejects(pending, /刷新/);
  worker.onerror();
  await rejected;
  await assert.rejects(client.request("predictStructures", {}), /刷新/);
});
