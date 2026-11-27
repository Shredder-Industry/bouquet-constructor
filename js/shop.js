/* One shop: what it sells and for how much. Keys come from js/library.js; a missing key means "not in stock".
   Prices below are placeholders until the pilot shop sends its price list. Classic script, see js/order.js. */

const SHOP = {
  id: 'demo', // part of the localStorage key
  name: 'Букетная мастерская',
  tagline: 'Соберите букет — мы привезём его таким же',
  whatsapp: '', // any format: +7 701 123-45-67, 8 701 1234567, 77011234567
  currency: '₸',
  flowers: {
    rose_red: 1100, rose_cream: 1000, rose_powder: 1000,
    peony_pink: 2250, peony_white: 2250,
    tulip_yellow: 600, tulip_lilac: 650,
    sunflower: 1250, daisy: 450,
    lavender: 350, eucalyptus: 750, gypsophila: 550,
  },
  wraps: { kraft: 1250, white: 1500, powder: 1500, graphite: 1750, none: 0 },
  ribbons: ['satin', 'wine', 'sage', 'jute'],
  gifts: {
    bear_small: 4950, bear_big: 9450, bunny: 5950, cat: 5450,
    choco_box: 4450, macarons: 3450, berries: 6450, choco_bar: 2250,
  },
  cardPrice: 500,
  presets: [
    {name:'Нежный',    desc:'Пудровые розы, белые пионы, гипсофила', wrap:'white', ribbon:'sage', items:{rose_powder:5, peony_white:2, gypsophila:3, eucalyptus:3}},
    {name:'Солнечный', desc:'Подсолнухи, ромашки, лаванда', wrap:'kraft', ribbon:'jute', items:{sunflower:3, daisy:6, lavender:4}},
    {name:'Классика',  desc:'11 красных роз с эвкалиптом', wrap:'graphite', ribbon:'wine', items:{rose_red:11, eucalyptus:4}},
    {name:'Весенний',  desc:'Жёлтые и сиреневые тюльпаны', wrap:'powder', ribbon:'satin', items:{tulip_yellow:4, tulip_lilac:3, gypsophila:2}},
    {name:'Мишка и пионы', desc:'5 пионов, эвкалипт и мишка 25 см', wrap:'powder', ribbon:'satin', items:{peony_pink:3, peony_white:2, eucalyptus:3}, gifts:{bear_small:1}},
    {name:'Сладкое утро', desc:'9 тюльпанов и коробка макарон', wrap:'white', ribbon:'sage', items:{tulip_yellow:5, tulip_lilac:4, gypsophila:2}, gifts:{macarons:1}},
    {name:'Для мамы',  desc:'9 кремовых и пудровых роз, конфеты', wrap:'kraft', ribbon:'wine', items:{rose_cream:7, rose_powder:2, eucalyptus:3}, gifts:{choco_box:1}},
    {name:'Детский праздник', desc:'Ромашки, тюльпаны, зайка и шоколад', wrap:'kraft', ribbon:'jute', items:{daisy:7, tulip_yellow:2, lavender:3}, gifts:{bunny:1, choco_bar:1}},
    {name:'Признание', desc:'15 красных роз, большой мишка, клубника', wrap:'graphite', ribbon:'wine', items:{rose_red:15, gypsophila:3}, gifts:{bear_big:1, berries:1}},
  ],
};

if (typeof module !== 'undefined') module.exports = { SHOP };
