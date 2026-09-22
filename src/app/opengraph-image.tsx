import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share card: the mark on the dark tile, the name, and the one-line pitch. */
export default async function OpengraphImage() {
  const png = await readFile(path.join(process.cwd(), "public/brand/solera-mark.png"));
  const mark = `data:image/png;base64,${png.toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          background: "#0b0d16",
          fontFamily: "sans-serif",
        }}
      >
        <img src={mark} width={300} height={300} alt="" style={{ borderRadius: 64 }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 700, letterSpacing: -3, color: "#ffffff" }}>Solera</div>
          <div style={{ display: "flex", marginTop: 8, fontSize: 34, color: "#b8b4cc", maxWidth: 620, lineHeight: 1.3 }}>
            Stocks on Solana, with the people who hold them.
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 28,
              height: 10,
              width: 560,
              borderRadius: 999,
              background: "linear-gradient(100deg, #d139fc 0%, #482efa 22%, #0191fd 50%, #01eaf4 78%, #05fbcf 100%)",
            }}
          />
        </div>
      </div>
    ),
    { ...size },
  );
}
