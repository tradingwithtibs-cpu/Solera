import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 16,
          background: "linear-gradient(135deg, #7c3aed, #0d9488)",
          fontFamily: "sans-serif",
        }}
      >
        <span style={{ fontSize: 38, fontWeight: 700, color: "white" }}>S</span>
      </div>
    ),
    { ...size },
  );
}
