import * as THREE from "three";
import { buildingVisualDefinitions, modelGeometryContracts } from "../src/asset-manifest";
import { regions } from "../src/data";
import { makeCore, makeMarket, makeWorkshop } from "../src/models";

const mockLibrary = {
  hasModel: () => true,
  fittedModel: (_name: string, size: [number, number, number]) => {
    const root = new THREE.Group();
    const object = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial());
    object.position.y = size[1] * 0.5;
    root.add(object);
    return root;
  },
  model: () => {
    const root = new THREE.Group();
    const object = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial());
    object.position.y = 1;
    root.add(object);
    return root;
  }
} as never;

const fixtures = {
  market: makeMarket(regions[0]!, mockLibrary),
  workshop: makeWorkshop(regions[0]!, mockLibrary),
  core: makeCore(regions[0]!.accent, regions[0]!.id, mockLibrary)
};

for (const [id, object] of Object.entries(fixtures)) {
  object.updateMatrixWorld(true);
  const contract = buildingVisualDefinitions[id]!;
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const names = new Set<string>();
  object.traverse((child) => { if (child.name) names.add(child.name); });
  for (const required of contract.requiredParts) if (!names.has(required)) throw new Error(`${id}: missing structural part ${required}`);
  if (size.x < contract.footprint[0] * 0.82 || size.z < contract.footprint[1] * 0.82) throw new Error(`${id}: footprint collapsed to ${size.toArray().join(" x ")}`);
  if (size.y < contract.heightRange[0] || size.y > contract.heightRange[1]) throw new Error(`${id}: height ${size.y.toFixed(2)} outside contract`);
  if (bounds.min.y < -0.04) throw new Error(`${id}: model sinks below ground (${bounds.min.y.toFixed(2)})`);
}

for (const contract of Object.values(modelGeometryContracts)) {
  if (contract.mobileSizeTolerance > 0.05) throw new Error(`${contract.id}: mobile size tolerance is too loose`);
  if (contract.fitMode === "axis-fit" && contract.targetBounds.some((value) => value <= 0)) throw new Error(`${contract.id}: invalid target bounds`);
}

console.log(`Geometry contract passed: ${Object.keys(fixtures).length} complete buildings and ${Object.keys(modelGeometryContracts).length} authored modules.`);
