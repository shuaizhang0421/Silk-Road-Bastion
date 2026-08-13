import * as THREE from "three";
import { buildingVisualDefinitions, modelGeometryContracts } from "../src/asset-manifest";
import { regions } from "../src/data";
import { makeBarricade, makeBuildModel, makeCore, makeFortWallSegment, makeGatehouse, makeMarket, makeWorkshop } from "../src/models";
import type { BuildingType } from "../src/types";

const mockLibrary = {
  hasModel: () => true,
  fittedModel: (_name: string, size: [number, number, number]) => {
    const root = new THREE.Group();
    const object = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial());
    object.position.y = size[1] * 0.5;
    root.add(object);
    return root;
  },
  model: (name: string) => {
    const root = new THREE.Group();
    const dimensions: [number, number, number] = name === "silk-road-ballista" ? [3.45, 1.85, 2.55] : [2, 2, 2];
    const object = new THREE.Mesh(new THREE.BoxGeometry(...dimensions), new THREE.MeshStandardMaterial());
    object.position.y = dimensions[1] * 0.5;
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
  if (id === "workshop") {
    const roof = object.getObjectByName("roof");
    if (!(roof instanceof THREE.Group)) throw new Error("workshop: roof must be a structural group");
    const rearSlope = roof.getObjectByName("gable-slope-rear");
    const frontSlope = roof.getObjectByName("gable-slope-front");
    if (!(rearSlope instanceof THREE.Mesh) || !(frontSlope instanceof THREE.Mesh) || !roof.getObjectByName("gable-ridge")) {
      throw new Error("workshop: roof must have two symmetric slopes and one ridge");
    }
    if (Math.abs(rearSlope.rotation.x + frontSlope.rotation.x) > 0.0001 || Math.abs(rearSlope.position.y - frontSlope.position.y) > 0.0001) {
      throw new Error("workshop: roof slopes are not symmetric");
    }
    if (!roof.getObjectByName("gable-fascia-rear") || !roof.getObjectByName("gable-fascia-front")) {
      throw new Error("workshop: roof must have grounded front and rear fascia");
    }
    if (roof.scale.x !== 1 || roof.scale.y !== 1 || roof.scale.z !== 1) throw new Error("workshop: roof cannot use non-uniform object scaling");
  }
  if (size.x < contract.footprint[0] * 0.82 || size.z < contract.footprint[1] * 0.82) throw new Error(`${id}: footprint collapsed to ${size.toArray().join(" x ")}`);
  if (size.y < contract.heightRange[0] || size.y > contract.heightRange[1]) throw new Error(`${id}: height ${size.y.toFixed(2)} outside contract`);
  if (bounds.min.y < -0.04) throw new Error(`${id}: model sinks below ground (${bounds.min.y.toFixed(2)})`);
}

for (const contract of Object.values(modelGeometryContracts)) {
  if (contract.mobileSizeTolerance > 0.05) throw new Error(`${contract.id}: mobile size tolerance is too loose`);
  if (contract.fitMode === "axis-fit" && contract.targetBounds.some((value) => value <= 0)) throw new Error(`${contract.id}: invalid target bounds`);
}

const worldFixtures: Array<{
  id: string;
  object: THREE.Object3D;
  min: [number, number, number];
  max: [number, number, number];
  minGround?: number;
}> = [
  ...(["ballista", "fire", "market", "workshop", "antiair", "trebuchet"] as BuildingType[]).map((type) => ({
    id: `build-${type}`,
    object: makeBuildModel(type, mockLibrary, regions[0]!),
    min: (type === "fire" ? [1.7, 3.5, 1.7]
      : type === "ballista" ? [3.2, 1.8, 2.4]
      : type === "market" || type === "workshop" ? [4.2, 2.7, 3.4]
      : type === "antiair" ? [2.8, 2.5, 2.6]
      : [2.8, 2.6, 2.8]) as [number, number, number],
    max: (type === "workshop" ? [10, 5.5, 10]
      : type === "trebuchet" ? [6.3, 5.5, 6.3]
      : [7.2, 6.4, 7.2]) as [number, number, number]
  })),
  { id: "fort-wall", object: makeFortWallSegment(18, 0x987654, mockLibrary), min: [17.2, 3.8, 1.7], max: [20, 6, 3.2] },
  { id: "gatehouse", object: makeGatehouse(mockLibrary, 0xb88d55), min: [11, 4.5, 2.5], max: [16, 7, 5] },
  { id: "barricade", object: makeBarricade(), min: [4.2, 1.7, 1.2], max: [6.4, 3, 2.6], minGround: -0.12 }
];

for (const fixture of worldFixtures) {
  fixture.object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(fixture.object);
  const size = bounds.getSize(new THREE.Vector3());
  const dimensions = size.toArray();
  dimensions.forEach((value, axis) => {
    if (value < fixture.min[axis]! || value > fixture.max[axis]!) {
      throw new Error(`${fixture.id}: axis ${axis} size ${value.toFixed(2)} outside ${fixture.min[axis]}-${fixture.max[axis]}`);
    }
  });
  if (bounds.min.y < (fixture.minGround ?? -0.04)) throw new Error(`${fixture.id}: sinks below ground (${bounds.min.y.toFixed(2)})`);
}

console.log(`Geometry contract passed: ${Object.keys(fixtures).length} complete buildings, ${worldFixtures.length} gameplay structures and ${Object.keys(modelGeometryContracts).length} authored modules.`);
