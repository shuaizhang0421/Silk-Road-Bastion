import { regionAssetBundles, regionEnvironmentClusters, regionMaterialSets } from "../src/asset-manifest";
import { regionVisualProfiles, regions } from "../src/data";

const failures: string[] = [];

for (const region of regions) {
  const profile = regionVisualProfiles[region.id];
  const bundle = regionAssetBundles[region.id];
  if (!profile) failures.push(`${region.id}: missing RegionVisualProfile`);
  if (!bundle) failures.push(`${region.id}: missing RegionAssetBundle`);
  if (!profile || !bundle) continue;
  if (bundle.regionId !== region.id) failures.push(`${region.id}: bundle region mismatch`);
  if (!bundle.desktopPaths.length || !bundle.mobilePaths.length) failures.push(`${region.id}: missing desktop/mobile paths`);
  for (const assetPath of new Set([...bundle.desktopPaths, ...bundle.mobilePaths])) if (!assetPath.startsWith("assets/")) failures.push(`${region.id}: invalid local path ${assetPath}`);
  const clusterIds = regionEnvironmentClusters.filter((cluster) => cluster.regionId === region.id).map((cluster) => cluster.id);
  if (clusterIds.length < 2) failures.push(`${region.id}: needs at least two environment clusters`);
  for (const clusterId of profile.ecologyClusterIds) {
    if (!clusterIds.includes(clusterId)) failures.push(`${region.id}: profile references unknown cluster ${clusterId}`);
  }
  if (!profile.groundTexture.includes(region.id)) failures.push(`${region.id}: ground texture key is not regional`);
}

for (const material of Object.values(regionMaterialSets)) for (const assetPath of [material.colorPath, material.normalPath, material.roughnessPath, material.metalnessPath].filter(Boolean) as string[]) if (!assetPath.startsWith("assets/")) failures.push(`${material.id}: invalid local path ${assetPath}`);

if (failures.length) {
  throw new Error(failures.join("\n"));
}

console.log(`Region bundle contract passed: ${regions.length} regions, ${regionEnvironmentClusters.length} clusters, ${Object.keys(regionMaterialSets).length} material sets.`);
