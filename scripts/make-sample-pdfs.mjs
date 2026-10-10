// Generates small searchable sample PDFs (plus one image-only PDF) for testing NoteBridge.
// No dependencies: writes minimal valid PDF 1.4 files by hand.
// Usage: node scripts/make-sample-pdfs.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = join(process.cwd(), "samples");
mkdirSync(outDir, { recursive: true });

function esc(s) {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** pages: array of { lines: string[] } or { image: true } */
function buildPdf(pages) {
  const objects = []; // index i -> object number i+1
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogNum = add(null); // placeholder
  const pagesNum = add(null);
  const fontNum = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageNums = [];
  for (const p of pages) {
    let stream;
    if (p.image) {
      // Only vector graphics, no text operators -> simulates a scanned/image-only page
      stream = "0.6 g 72 400 450 300 re f 0.2 g 100 450 300 20 re f 100 500 250 20 re f";
    } else {
      const parts = ["BT", "/F1 12 Tf", "14 TL", "72 740 Td"];
      p.lines.forEach((line, i) => {
        if (i === 0) parts.push("/F1 18 Tf", `(${esc(line)}) Tj`, "/F1 12 Tf", "T*", "T*");
        else parts.push(`(${esc(line)}) Tj`, "T*");
      });
      parts.push("ET");
      stream = parts.join("\n");
    }
    const contentNum = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageNum = add(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontNum} 0 R >> >> /Contents ${contentNum} 0 R >>`
    );
    pageNums.push(pageNum);
  }
  objects[catalogNum - 1] = `<< /Type /Catalog /Pages ${pagesNum} 0 R >>`;
  objects[pagesNum - 1] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`;

  let out = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogNum} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const lecture = [
  {
    lines: [
      "Simple Harmonic Motion",
      "- Restoring force proportional to displacement",
      "- Hooke's law: F = -kx for an ideal spring",
      "- Angular frequency of a mass-spring system: omega = sqrt(k/m)",
      "- Period of oscillation T = 2 pi sqrt(m/k)",
      "Definition: amplitude is the maximum displacement from equilibrium.",
    ],
  },
  {
    lines: [
      "Energy in Simple Harmonic Motion",
      "- Kinetic and potential energy exchange during each oscillation",
      "- Total mechanical energy E = 1/2 k A^2 remains constant",
      "Derivation: total energy from Hooke's law and energy conservation",
      "Example: simple pendulum period for small angles T = 2 pi sqrt(L/g)",
    ],
  },
  {
    lines: [
      "Damped Oscillations",
      "- Damping force proportional to velocity reduces amplitude",
      "- Underdamped, critically damped and overdamped motion",
      "Example: calibrating a quartz crystal oscillator in a wristwatch circuit",
      "Example: seismometer magnetic braking with eddy current coils",
    ],
  },
];

const textbook = [
  { lines: ["Chapter 14 Oscillations", "This chapter studies periodic motion of objects such as springs and pendulums.", "Oscillations appear throughout physics and engineering."] },
  {
    lines: [
      "14.1 Simple Harmonic Motion",
      "When a mass is attached to an ideal spring, the spring exerts a restoring force.",
      "Hooke's law states that the restoring force is proportional to displacement, F = -kx.",
      "The resulting motion is called simple harmonic motion.",
      "The angular frequency of the mass-spring system is omega = sqrt(k/m).",
      "The period of oscillation is T = 2 pi sqrt(m/k) and does not depend on amplitude.",
      "The amplitude is the maximum displacement from the equilibrium position.",
      "Determine the angular frequency of a mass-spring system if k = 200 N/m.",
    ],
  },
  {
    lines: [
      "14.2 Energy in Simple Harmonic Motion",
      "In simple harmonic motion kinetic energy and potential energy continuously exchange.",
      "The total mechanical energy of the oscillator is E = 1/2 k A^2.",
      "Because there is no friction, the total energy remains constant.",
    ],
  },
  {
    lines: [
      "14.3 The Simple Pendulum",
      "A simple pendulum consists of a point mass suspended from a light string of length L.",
      "For small angles the motion is approximately simple harmonic.",
      "The period of a simple pendulum for small angles is T = 2 pi sqrt(L/g).",
    ],
  },
  {
    lines: [
      "14.4 Damped Oscillations",
      "Real oscillators lose energy because of friction or air resistance.",
      "A damping force proportional to velocity causes the amplitude to decrease over time.",
      "Motion can be underdamped, critically damped or overdamped depending on the damping.",
    ],
  },
  { lines: ["Chapter 15 Mechanical Waves", "A wave is a disturbance that travels through a medium.", "Transverse and longitudinal waves differ in the direction of displacement."] },
];

writeFileSync(join(outDir, "lecture.pdf"), buildPdf(lecture));
writeFileSync(join(outDir, "textbook.pdf"), buildPdf(textbook));
writeFileSync(join(outDir, "scanned.pdf"), buildPdf([{ image: true }, { image: true }]));
writeFileSync(join(outDir, "not-a-pdf.pdf"), "This is plain text pretending to be a PDF.\n");
// Mixed lecture: searchable page 1, image-only page 2 (needs OCR), searchable page 3.
writeFileSync(join(outDir, "mixed.pdf"), buildPdf([lecture[0], { image: true }, lecture[2]]));
console.log("Wrote samples/lecture.pdf, samples/textbook.pdf, samples/scanned.pdf, samples/not-a-pdf.pdf, samples/mixed.pdf");
