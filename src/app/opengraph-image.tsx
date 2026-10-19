import { ImageResponse } from "next/og";

// Site-wide share image (also used as the Recipe JSON-LD image). Text is
// Latin only because the built-in OG renderer ships no Korean font.
export const alt = "Oven Note: financiers on a cooling rack";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const bars = [
    { left: 250, top: 300, rotate: -6 },
    { left: 500, top: 270, rotate: 3 },
    { left: 750, top: 305, rotate: 8 },
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#fbf7f0",
          position: "relative",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", padding: "64px 80px" }}>
          <div style={{ fontSize: 34, color: "#a85d22", letterSpacing: 2 }}>OVEN NOTE</div>
          <div style={{ fontSize: 76, color: "#2b1d12", fontWeight: 700, marginTop: 12 }}>Financier</div>
          <div style={{ fontSize: 30, color: "#6e5a48", marginTop: 8 }}>brown butter · almond · 12 pieces</div>
        </div>
        {bars.map((b) => (
          <div
            key={b.left}
            style={{
              position: "absolute",
              left: b.left,
              top: b.top,
              width: 220,
              height: 120,
              display: "flex",
              flexDirection: "column",
              transform: `rotate(${b.rotate}deg)`,
            }}
          >
            <div
              style={{
                height: 50,
                borderTopLeftRadius: 110,
                borderTopRightRadius: 110,
                background: "linear-gradient(#e9b25c, #c47a2c)",
              }}
            />
            <div style={{ height: 70, background: "linear-gradient(#a65a1d, #7a3f12)", borderRadius: 6 }} />
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: 160,
            right: 160,
            top: 480,
            height: 70,
            border: "4px solid rgba(43,29,18,0.25)",
            borderRadius: 12,
          }}
        />
      </div>
    ),
    size,
  );
}
