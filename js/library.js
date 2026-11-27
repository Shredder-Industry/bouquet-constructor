/* Shared library: how each item looks. Shops choose from it and set prices in js/shop.js. Classic script, see js/order.js.
   photo: transparent side-view PNG; cx/cy/w = head centre and head width as a share of the image,
   size = head width in scene units. Items without a photo fall back to the drawn SVG head. */

const LIBRARY = {
  flowers: {
    rose_red:    {name:'Роза красная',      type:'rose',     pal:{base:'#B3122E',light:'#D23047',dark:'#6C0A1B'}, photo:{src:'assets/flowers/rose_red.png', cx:.53, cy:.34, w:.56, size:72}},
    rose_cream:  {name:'Роза кремовая',     type:'rose',     pal:{base:'#F1E2C6',light:'#FBF3E3',dark:'#BFA77C'}},
    rose_powder: {name:'Роза пудровая',     type:'rose',     pal:{base:'#E4A3AE',light:'#F1C4CB',dark:'#B26A78'}, photo:{src:'assets/flowers/rose_powder.png', cx:.51, cy:.29, w:.58, size:72}},
    peony_pink:  {name:'Пион розовый',      type:'peony',    pal:{base:'#E57CA1',light:'#F2A8C2',dark:'#B04B74'}, scale:1.15, photo:{src:'assets/flowers/peony_pink.png', cx:.50, cy:.34, w:.59, size:80}},
    peony_white: {name:'Пион белый',        type:'peony',    pal:{base:'#F2EAEC',light:'#FFFFFF',dark:'#C7B8BE'}, scale:1.15},
    tulip_yellow:{name:'Тюльпан жёлтый',    type:'tulip',    pal:{base:'#F0BE2C',light:'#F8D96A',dark:'#B9880B'}, photo:{src:'assets/flowers/tulip_yellow.png', cx:.49, cy:.27, w:.29, size:38}},
    tulip_lilac: {name:'Тюльпан сиреневый', type:'tulip',    pal:{base:'#A57AC8',light:'#C3A1DE',dark:'#6F4B92'}},
    sunflower:   {name:'Подсолнух',         type:'sunflower', scale:1.1},
    daisy:       {name:'Ромашка',           type:'daisy',     scale:.85, tier:1},
    lavender:    {name:'Лаванда',           type:'lavender',  tier:2, filler:true},
    eucalyptus:  {name:'Эвкалипт',          type:'eucalyptus',scale:1.1, tier:2, filler:true, photo:{src:'assets/flowers/eucalyptus.png', cx:.50, cy:.40, w:.40, size:56}},
    gypsophila:  {name:'Гипсофила',         type:'gypsophila',tier:2, filler:true},
  },
  wraps: {
    kraft:   {name:'Крафт',         front:'#C8A276', side:'#B08856', back:'#A07A4B'},
    white:   {name:'Белый матовый', front:'#F5F3EF', side:'#E1DCD3', back:'#D3CDC2'},
    powder:  {name:'Пудровый фетр', front:'#EBC9C7', side:'#D9ACA9', back:'#C99896'},
    graphite:{name:'Графит',        front:'#43484E', side:'#33373C', back:'#282B2F'},
    none:    {name:'Без упаковки'},
  },
  ribbons: {
    satin: {name:'Атлас белый', color:'#F7F4EE', dark:'#D8D1C4'},
    wine:  {name:'Бордо',       color:'#7A1F33', dark:'#561221'},
    sage:  {name:'Шалфей',      color:'#8DA58F', dark:'#667F69'},
    jute:  {name:'Джут',        color:'#B99868', dark:'#8E7145'},
  },
  gifts: {
    bear_small:{name:'Мишка, 25 см',             group:'toy',   draw:'bear',  pal:{base:'#A8724A',light:'#DDB98F',dark:'#4A2F1B'}},
    bear_big:  {name:'Мишка, 40 см',             group:'toy',   draw:'bear',  pal:{base:'#C9A27A',light:'#EED8BC',dark:'#5A3D25'}, scale:1.3},
    bunny:     {name:'Зайка, 30 см',             group:'toy',   draw:'bunny', pal:{base:'#E8E1DC',light:'#F8F4F1',dark:'#6E6560'}},
    cat:       {name:'Котик, 25 см',             group:'toy',   draw:'cat',   pal:{base:'#9D9B98',light:'#DAD8D4',dark:'#3E3C3A'}},
    choco_box: {name:'Конфеты в коробке-сердце', group:'sweet', draw:'heartBox'},
    macarons:  {name:'Макарон, 6 шт',            group:'sweet', draw:'macarons'},
    berries:   {name:'Клубника в шоколаде, 9 шт',group:'sweet', draw:'berries'},
    choco_bar: {name:'Шоколад ручной работы',    group:'sweet', draw:'bar'},
  },
};

if (typeof module !== 'undefined') module.exports = { LIBRARY };
