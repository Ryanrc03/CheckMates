import { encode } from "uqr";

/** Renders a QR code as plain SVG squares; the link never leaves the browser to be drawn. */
export function ShareQr({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: "L", border: 2 });
  const path = data.flatMap((row, y) => row.map((dark, x) => dark ? `M${x} ${y}h1v1h-1z` : "")).join("");
  return <svg className="share-qr" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
    <rect width={size} height={size} fill="#fff"/>
    <path d={path} fill="#2b2118"/>
  </svg>;
}
