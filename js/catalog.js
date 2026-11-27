/* Joins the shared flower library with one shop's stock and prices. Classic script, see js/order.js. */

const hasKey = (map, key) => Object.prototype.hasOwnProperty.call(map, key);

/* Library entries the shop prices, in library order, each with the shop's price attached. */
function pricedEntries(libraryMap, prices) {
  return Object.fromEntries(Object.entries(libraryMap)
    .filter(([key]) => hasKey(prices, key))
    .map(([key, item]) => [key, { ...item, price: prices[key] }]));
}

function presetIsAvailable(preset, catalog) {
  const allIn = (counts, map) => Object.keys(counts || {}).every(key => hasKey(map, key));
  return hasKey(catalog.wraps, preset.wrap) && hasKey(catalog.ribbons, preset.ribbon)
    && allIn(preset.items, catalog.kinds) && allIn(preset.gifts, catalog.gifts);
}

function applyShop(library, shop) {
  const ribbons = Object.fromEntries(Object.entries(library.ribbons)
    .filter(([key]) => (shop.ribbons || []).includes(key)));
  const catalog = {
    kinds: pricedEntries(library.flowers, shop.flowers || {}),
    wraps: pricedEntries(library.wraps, shop.wraps || {}),
    ribbons,
    gifts: pricedEntries(library.gifts, shop.gifts || {}),
  };
  return { ...catalog, presets: (shop.presets || []).filter(p => presetIsAvailable(p, catalog)) };
}

if (typeof module !== 'undefined') module.exports = { applyShop, hasKey };
