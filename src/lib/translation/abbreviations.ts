const WORDS: Record<string, string> = { chkn: "Chicken", chk: "Chicken", chx: "Chicken", ckn: "Chicken", veg: "Vegetable", veggie: "Vegetable", veggies: "Vegetables", spr: "Spring", ndl: "Noodle", ndls: "Noodles", mush: "Mushroom", shrmp: "Shrimp", shrp: "Shrimp", choc: "Chocolate", bev: "Beverage", btl: "Bottle", rst: "Roast", grl: "Grilled", grld: "Grilled", swt: "Sweet", lg: "Large", sm: "Small", md: "Medium", med: "Medium", reg: "Regular", xtra: "Extra", pc: "Piece", pcs: "Pieces", sand: "Sandwich", sndw: "Sandwich", sandw: "Sandwich", chz: "Cheese", chs: "Cheese", brgr: "Burger", sld: "Salad", spcl: "Special", onn: "Onion", garl: "Garlic", avo: "Avocado", bcn: "Bacon", saus: "Sausage", pnut: "Peanut", pnuts: "Peanuts", tmto: "Tomato", "w/o": "without", "w/": "with" };
const FOOD_AFTER_BEEF = /^(ndl|ndls|noodle|noodles|soup|stew|rice|taco|tacos|burrito|bowl|curry|pho|steak|brisket|jerky|patty|chow|lo)$/i;
export function expandAbbreviations(text: string): { text: string; expanded: boolean } {
  const tokens = text.split(" "); let expanded = false;
  const out = tokens.map((token, i) => {
    const lower = token.toLowerCase(); const next = tokens[i + 1]?.toLowerCase() ?? "";
    if (lower === "fr") { expanded = true; return next === "fries" ? "French" : "Fried"; }
    if (lower === "bf" && FOOD_AFTER_BEEF.test(next)) { expanded = true; return "Beef"; }
    if (lower.startsWith("w/") && lower.length > 2 && lower !== "w/o") { expanded = true; return "with " + token.slice(2); }
    if (Object.hasOwn(WORDS, lower)) { expanded = true; return WORDS[lower]; }
    return token;
  });
  return { text: out.join(" "), expanded };
}
