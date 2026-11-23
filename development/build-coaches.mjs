// Builds the commentator avatars in ../extension/coaches/ from the DiceBear
// "Lorelei" style (design CC0 1.0 by Lisa Wischofsky, code MIT by Florian Körner).
// Run: node build-coaches.mjs   (dev only; the extension ships static SVGs)
import { createAvatar } from "@dicebear/core";
import * as lorelei from "@dicebear/lorelei";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../extension/coaches");
fs.mkdirSync(out, { recursive: true });

// Each commentator: Lorelei face + original chess-player styling (outfit,
// checkerboard backdrop and a chess-piece pin from extension/pieces).
export const CHARACTERS = [
  { id: "nova", bg: "dbeafe", board: "bfdbfe", skin: "c68a63", hair: "2b1d16", hairStyle: "variant46",
    outfit: "blazer", cloth: "1e3a8a", shirt: "ffffff", pin: "wN" },
  { id: "kai", bg: "bbf7d0", board: "86efac", skin: "e0a979", hair: "1f2937", hairStyle: "variant18",
    outfit: "hoodie", cloth: "16a34a", shirt: "14532d", pin: "wQ" },
  { id: "theo", bg: "fde68a", board: "fcd34d", skin: "f2c9a5", hair: "8f969e", hairStyle: "variant03",
    glasses: "variant05", beard: "variant02", outfit: "suit", cloth: "1f2937", shirt: "ffffff", tie: "b91c1c", pin: "wK" },
  { id: "ada", bg: "fbcfe8", board: "f9a8d4", skin: "8d5a3b", hair: "d9d9d9", hairStyle: "variant30",
    glasses: "variant04", outfit: "cardigan", cloth: "7c3aed", shirt: "f5f3ff", pin: "wB" },
  { id: "mika", bg: "e0e7ff", board: "c7d2fe", skin: "f5d6c0", hair: "b45309", hairStyle: "variant33",
    glasses: "variant01", outfit: "turtleneck", cloth: "334155", shirt: "334155", pin: "wR" },
];
export const MOODS = {
  idle: { eyes: "variant21", mouth: "happy01", eyebrows: "variant01" },
  delighted: { eyes: "variant21", mouth: "happy05", eyebrows: "variant04", blush: true },
  happy: { eyes: "variant21", mouth: "happy03", eyebrows: "variant01", blush: true },
  thinking: { eyes: "variant03", mouth: "sad05", eyebrows: "variant08" },
  worried: { eyes: "variant24", mouth: "sad02", eyebrows: "variant12" },
  shocked: { eyes: "variant09", mouth: "sad01", eyebrows: "variant10" },
};

function outfit(p) {
  const c = "#" + p.cloth, s = "#" + p.shirt;
  // Shoulders span the bottom of a 200x200 canvas; the neck ends near y=168.
  const body = `<path d="M14 200 C16 176 40 160 70 154 C80 152 86 151 90 151 L110 151 C114 151 120 152 130 154 C160 160 184 176 186 200 Z" fill="${c}"/>`;
  switch (p.outfit) {
    case "blazer":
      return body + `<path d="M88 151 L100 182 L112 151 Z" fill="${s}"/>` +
        `<path d="M78 153 L100 200 L90 200 L68 157 Z M122 153 L100 200 L110 200 L132 157 Z" fill="#172554"/>`;
    case "suit":
      return body + `<path d="M88 151 L100 186 L112 151 Z" fill="${s}"/>` +
        `<path d="M97 156 L103 156 L106 186 L100 196 L94 186 Z" fill="#${p.tie}"/>` +
        `<path d="M78 153 L100 200 L90 200 L68 157 Z M122 153 L100 200 L110 200 L132 157 Z" fill="#111827"/>`;
    case "hoodie":
      return body + `<path d="M70 156 C80 146 120 146 130 156 C122 166 78 166 70 156 Z" fill="${s}"/>` +
        `<path d="M92 164 L94 186 M108 164 L106 186" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`;
    case "cardigan":
      return body + `<path d="M88 151 C92 168 108 168 112 151 Z" fill="${s}"/>` +
        `<path d="M100 167 L100 200" stroke="#5b21b6" stroke-width="3"/>` +
        `<circle cx="104" cy="186" r="2" fill="#f5f3ff"/><circle cx="104" cy="196" r="2" fill="#f5f3ff"/>`;
    default: // turtleneck
      return body + `<rect x="84" y="140" width="32" height="18" rx="7" fill="${c}"/>` +
        `<path d="M86 146 H114 M86 151 H114" stroke="#475569" stroke-width="1.5"/>`;
  }
}

function checker(p) {
  let cells = "";
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
    if ((x + y) % 2) cells += `<rect x="${x * 25}" y="${y * 25}" width="25" height="25"/>`;
  return `<rect width="200" height="200" fill="#${p.bg}"/><g fill="#${p.board}" opacity="0.45">${cells}</g>` +
    `<radialGradient id="v-${p.id}" cx="50%" cy="42%" r="60%"><stop offset="55%" stop-color="#${p.bg}"/><stop offset="100%" stop-color="#${p.bg}" stop-opacity="0"/></radialGradient>` +
    `<rect width="200" height="200" fill="url(#v-${p.id})" opacity="0.85"/>`;
}

const pinSvg = (name) => fs.readFileSync(path.join(out, "../pieces", name + ".svg"), "utf8")
  .replace(/<\?xml[^>]*>/, "").replace(/<!DOCTYPE[^>]*>/, "").replace(/ (width|height)="45"/g, "");

for (const person of CHARACTERS) {
  for (const [mood, face] of Object.entries(MOODS)) {
    const head = createAvatar(lorelei, {
      seed: person.id,
      skinColor: [person.skin],
      hairColor: [person.hair],
      hair: [person.hairStyle],
      eyes: [face.eyes],
      mouth: [face.mouth],
      eyebrows: [face.eyebrows],
      glasses: person.glasses ? [person.glasses] : undefined,
      glassesProbability: person.glasses ? 100 : 0,
      beard: person.beard ? [person.beard] : undefined,
      beardProbability: person.beard ? 100 : 0,
      earringsProbability: 0,
      frecklesProbability: 0,
      hairAccessoriesProbability: 0,
    }).toString().replace(/<metadata[\s\S]*?<\/metadata>/, "")
      .replace("<svg ", '<svg x="22" y="6" width="156" height="156" ');
    const blush = face.blush
      ? `<g fill="#f472b6" opacity="0.35"><ellipse cx="80" cy="102" rx="8" ry="4.5"/><ellipse cx="118" cy="103" rx="7" ry="4"/></g>`
      : "";
    const pin = `<g transform="translate(134 166)"><circle cx="13" cy="13" r="14" fill="#fff" stroke="#e5e7eb" stroke-width="1.5"/>` +
      pinSvg(person.pin).replace("<svg ", '<svg x="2" y="2" width="22" height="22" ') + `</g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">` +
      `<clipPath id="c-${person.id}"><circle cx="100" cy="100" r="100"/></clipPath>` +
      `<g clip-path="url(#c-${person.id})">${checker(person)}${head}${blush}${outfit(person)}</g>${pin}</svg>`;
    fs.writeFileSync(path.join(out, person.id + "-" + mood + ".svg"), svg);
  }
}
console.log("Wrote " + CHARACTERS.length * Object.keys(MOODS).length + " avatars to " + out);
