import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const [adm1Path, adm2Path] = process.argv.slice(2);

if (!adm1Path || !adm2Path) {
  throw new Error(
    "Usage: node scripts/prepare-maharashtra-boundaries.mjs <IND-ADM1.geojson> <IND-ADM2.geojson>",
  );
}

const [adm1, adm2] = await Promise.all([
  readJson(adm1Path),
  readJson(adm2Path),
]);

const maharashtra = adm1.features.find(
  (feature) => feature.properties?.shapeISO === "IN-MH",
);

if (!maharashtra) {
  throw new Error("Maharashtra was not found in the ADM1 dataset.");
}

const districtNameBySource = new Map([
  ["Ahmadnagar", "Ahilyanagar"],
  ["Akola", "Akola"],
  ["Amravati", "Amravati"],
  ["Bhandara", "Bhandara"],
  ["Bid", "Beed"],
  ["Buldana", "Buldhana"],
  ["Chandrapur", "Chandrapur"],
  ["Aurangabad", "Chhatrapati Sambhajinagar"],
  ["Osmanabad", "Dharashiv"],
  ["Dhule", "Dhule"],
  ["Gadchiroli", "Gadchiroli"],
  ["Gondiya", "Gondia"],
  ["Hingoli", "Hingoli"],
  ["Jalgaon", "Jalgaon"],
  ["Jalna", "Jalna"],
  ["Kolhapur", "Kolhapur"],
  ["Latur", "Latur"],
  ["Mumbai", "Mumbai City"],
  ["Mumbai Suburban", "Mumbai Suburban"],
  ["Nagpur", "Nagpur"],
  ["Nanded", "Nanded"],
  ["Nandurbar", "Nandurbar"],
  ["Nashik", "Nashik"],
  ["Palghar", "Palghar"],
  ["Parbhani", "Parbhani"],
  ["Pune", "Pune"],
  ["Raigarh", "Raigad"],
  ["Ratnagiri", "Ratnagiri"],
  ["Sangli", "Sangli"],
  ["Satara", "Satara"],
  ["Sindhudurg", "Sindhudurg"],
  ["Solapur", "Solapur"],
  ["Thane", "Thane"],
  ["Wardha", "Wardha"],
  ["Washim", "Washim"],
  ["Yavatmal", "Yavatmal"],
]);

const stateBounds = geometryBounds(maharashtra.geometry);

const districts = adm2.features
  .filter((feature) => {
    const sourceName = feature.properties.shapeName;
    return (
      districtNameBySource.has(sourceName) &&
      pointWithinBounds(geometryCenter(feature.geometry), stateBounds)
    );
  })
  .map((feature) => {
    const sourceName = feature.properties.shapeName;
    const name = districtNameBySource.get(sourceName);

    return {
      type: "Feature",
      properties: {
        districtId: slugify(name),
        name,
        sourceName,
        sourceId: feature.properties.shapeID,
      },
      geometry: feature.geometry,
    };
  })
  .sort((a, b) => a.properties.name.localeCompare(b.properties.name));

if (districts.length !== 36) {
  const names = districts.map((feature) => feature.properties.sourceName).join(", ");
  throw new Error(`Expected 36 Maharashtra districts, found ${districts.length}: ${names}`);
}

const duplicateIds = districts
  .map((feature) => feature.properties.districtId)
  .filter((id, index, ids) => ids.indexOf(id) !== index);

if (duplicateIds.length > 0) {
  throw new Error(`Duplicate district IDs: ${duplicateIds.join(", ")}`);
}

const outputDirectory = path.resolve("public/data/boundaries");
await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  writeJson(path.join(outputDirectory, "maharashtra.geojson"), {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Maharashtra",
          sourceId: maharashtra.properties.shapeID,
        },
        geometry: maharashtra.geometry,
      },
    ],
  }),
  writeJson(path.join(outputDirectory, "maharashtra-districts.geojson"), {
    type: "FeatureCollection",
    features: districts,
  }),
]);

console.log(`Stored Maharashtra and ${districts.length} districts in ${outputDirectory}`);
console.log(districts.map((feature) => feature.properties.name).join("\n"));

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function geometryCenter(geometry) {
  const [[west, south], [east, north]] = geometryBounds(geometry);

  return [(west + east) / 2, (south + north) / 2];
}

function geometryBounds(geometry) {
  const positions = geometry.coordinates.flat(geometry.type === "Polygon" ? 1 : 2);
  const longitudes = positions.map(([longitude]) => longitude);
  const latitudes = positions.map(([, latitude]) => latitude);

  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

function pointWithinBounds([longitude, latitude], [[west, south], [east, north]]) {
  return longitude >= west && longitude <= east && latitude >= south && latitude <= north;
}
