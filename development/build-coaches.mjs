// Builds the commentator avatars in ../extension/coaches/ from the DiceBear
// "Avataaars" style (design by Pablo Stanley, free for personal and
// commercial use per avataaars.com; code MIT by Florian Körner).
// Faces and bodies come from the same drawing, so clothes always fit the head.
// Each avatar has a transparent background and a chess-piece pin.
// Run: node build-coaches.mjs   (dev only; the extension ships static SVGs)
import { createAvatar } from "@dicebear/core";
import { avataaars } from "@dicebear/collection";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../extension/coaches");
fs.mkdirSync(out, { recursive: true });

export const CHARACTERS = [
  { id: "nova", bg: "dbeafe", board: "bfdbfe", skin: "d08b5b", top: "bun", hair: "2c1b18",
    clothing: "blazerAndShirt", clothes: "25557c", pin: "wN" },                       // The Coach
  { id: "kai", bg: "dcfce7", board: "bbf7d0", skin: "edb98a", top: "shortFlat", hair: "2c1b18",
    clothing: "hoodie", clothes: "262e33", pin: "wQ" },                               // The Streamer
  { id: "theo", bg: "fef3c7", board: "fde68a", skin: "ffdbb4", top: "sides", hair: "e8e1e1",
    clothing: "blazerAndSweater", clothes: "3c4f5c", facialHair: "beardMedium", facialHairColor: "e8e1e1",
    accessories: "round", pin: "wK" },                                                // The Grandmaster
  { id: "ada", bg: "fce7f3", board: "fbcfe8", skin: "ae5d29", top: "curly", hair: "e8e1e1",
    clothing: "collarAndSweater", clothes: "ff488e", accessories: "prescription02", pin: "wB" }, // The Professor
  { id: "mika", bg: "e0e7ff", board: "c7d2fe", skin: "ffdbb4", top: "straight01", hair: "a55728",
    clothing: "collarAndSweater", clothes: "5199e4", accessories: "prescription01", pin: "wR" }, // The Analyst
];
export const MOODS = {
  idle: { eyes: "default", eyebrows: "defaultNatural", mouth: "smile" },
  delighted: { eyes: "happy", eyebrows: "raisedExcitedNatural", mouth: "twinkle" },
  happy: { eyes: "happy", eyebrows: "defaultNatural", mouth: "smile" },
  thinking: { eyes: "side", eyebrows: "upDownNatural", mouth: "serious" },
  worried: { eyes: "default", eyebrows: "sadConcernedNatural", mouth: "concerned" },
  shocked: { eyes: "surprised", eyebrows: "raisedExcitedNatural", mouth: "disbelief" },
};

function backdrop(p) {
  let cells = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
    if ((x + y) % 2) cells += `<rect x="${x * 25}" y="${y * 25}" width="25" height="25"/>`;
  return `<rect width="200" height="200" fill="#${p.bg}"/><g fill="#${p.board}" opacity="0.55">${cells}</g>` +
    `<radialGradient id="v-${p.id}" cx="50%" cy="45%" r="58%"><stop offset="50%" stop-color="#${p.bg}"/>` +
    `<stop offset="100%" stop-color="#${p.bg}" stop-opacity="0"/></radialGradient>` +
    `<rect width="200" height="200" fill="url(#v-${p.id})"/>`;
}

const pinSvg = (name) => fs.readFileSync(path.join(out, "../pieces", name + ".svg"), "utf8")
  .replace(/<\?xml[^>]*>/, "").replace(/<!DOCTYPE[^>]*>/, "").replace(/ (width|height)="45"/g, "");

for (const person of CHARACTERS) {
  for (const [mood, face] of Object.entries(MOODS)) {
    const figure = createAvatar(avataaars, {
      seed: person.id,
      top: [person.top],
      hairColor: [person.hair],
      skinColor: [person.skin],
      clothing: [person.clothing],
      clothesColor: [person.clothes],
      eyes: [face.eyes],
      eyebrows: [face.eyebrows],
      mouth: [face.mouth],
      facialHair: person.facialHair ? [person.facialHair] : undefined,
      facialHairColor: person.facialHairColor ? [person.facialHairColor] : undefined,
      facialHairProbability: person.facialHair ? 100 : 0,
      accessories: person.accessories ? [person.accessories] : undefined,
      accessoriesProbability: person.accessories ? 100 : 0,
}).toString().replace(/<metadata[\s\S]*?<\/metadata>/, "")
      .replace("<svg ", '<svg x="0" y="0" width="200" height="200" ');
    const pin = `<g transform="translate(150 158)"><circle cx="15" cy="15" r="16" fill="#fff" stroke="#e5e7eb" stroke-width="1.5"/>` +
      pinSvg(person.pin).replace("<svg ", '<svg x="3" y="3" width="24" height="24" ') + `</g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">` +
      `${figure}${pin}</svg>`;
    fs.writeFileSync(path.join(out, person.id + "-" + mood + ".svg"), svg);
  }
}
console.log("Wrote " + CHARACTERS.length * Object.keys(MOODS).length + " avatars to " + out);
