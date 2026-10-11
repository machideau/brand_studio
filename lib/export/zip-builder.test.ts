import { describe, expect, it } from "vitest";
import { buildZipArchive, generateReadmeText, type ZipItem } from "./zip-builder";

describe("ZIP Builder and README generator", () => {
  const dummyItems: ZipItem[] = [
    {
      zipPath: "logo/original/logo.png",
      buffer: Buffer.from("fake-logo"),
      dimensions: "500x500 px",
      usage: "original",
    },
    {
      zipPath: "assets/avatar.png",
      buffer: Buffer.from("fake-avatar"),
      dimensions: "500x500 px",
      usage: "digital",
    },
    {
      zipPath: "assets/carte_de_visite.png",
      buffer: Buffer.from("fake-card"),
      dimensions: "1050x600 px",
      usage: "print",
    },
    {
      zipPath: "brandbook/brandbook_acme.pdf",
      buffer: Buffer.from("fake-pdf"),
      usage: "digital",
    },
  ];

  it("generates a comprehensive README with all files listed", () => {
    const readme = generateReadmeText("Acme", dummyItems);

    expect(readme).toContain("PACK IDENTITÉ DE MARQUE - ACME");
    expect(readme).toContain("assets/avatar.png");
    expect(readme).toContain("assets/carte_de_visite.png");
    expect(readme).toContain("brandbook/brandbook_acme.pdf");
    expect(readme).toContain("[Usage: print]");
    expect(readme).toContain("Prêts pour l'impression");
  });

  it("builds a valid ZIP archive buffer containing all files and README", async () => {
    const zipBuffer = await buildZipArchive({
      brandName: "Acme",
      items: dummyItems,
    });

    expect(zipBuffer).toBeInstanceOf(Buffer);
    expect(zipBuffer.length).toBeGreaterThan(0);
    // Standard ZIP magic bytes: PK (0x50, 0x4B)
    expect(zipBuffer[0]).toBe(0x50);
    expect(zipBuffer[1]).toBe(0x4b);
  });
});
