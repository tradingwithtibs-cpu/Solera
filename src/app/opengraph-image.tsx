import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #ede9fe, #ffffff 55%, #ccfbf1)",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 120,
            height: 120,
            borderRadius: 28,
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #7c3aed, #0d9488)",
            marginBottom: 36,
          }}
        >
          <span style={{ fontSize: 68, fontWeight: 700, color: "white" }}>S</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            letterSpacing: -2,
            background: "linear-gradient(135deg, #7c3aed, #0d9488)",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          Stocklana
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 32, color: "#525252" }}>
          Follow real investors. Copy with one tap.
        </div>
      </div>
    ),
    { ...size },
  );
}
