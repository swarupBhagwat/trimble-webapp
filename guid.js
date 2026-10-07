const IFC_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";

function toIfcGuid(g) {
  const hex = String(g).replace(/[{}-]/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) return String(g);
  let n = BigInt("0x" + hex), out = "";
  for (let i = 0; i < 22; i++, n >>= 6n) out = IFC_CHARS[Number(n & 63n)] + out;
  return out;
}

function fromIfcGuid(s) {
  let n = 0n;
  for (const c of s) n = (n << 6n) | BigInt(IFC_CHARS.indexOf(c));
  const h = n.toString(16).padStart(32, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`.toUpperCase();
}

if (require.main === module) {
  const g = "5E258C98-C74E-43E6-9F8A-894F2F9A3E22";
  const ifc = toIfcGuid(g);
  console.assert(ifc.length === 22 && /^[0-3]/.test(ifc), "22 chars, first char 0-3");
  console.assert(fromIfcGuid(ifc) === g, "round trip");
  console.assert(toIfcGuid(ifc) === ifc, "22-char ids pass through");
  console.assert(toIfcGuid(g.toLowerCase()) === ifc, "case-insensitive");
  console.log("ok", g, "->", ifc);
}

module.exports = { toIfcGuid, fromIfcGuid };
