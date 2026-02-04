// Server pricing configuration for GTA 5 RP
// Prices are per 1 MILLION virts
const getServerBannerLocal = (id) => `/server-banners/${String(id).padStart(2, '0')}.png`;
const getServerBannerRemote = (id) => `https://gta5rp.com/sidback/${String(id).padStart(2, '0')}.png`;

const SERVERS = [
  { id: 1, name: "Downtown", emoji: "�️", banner: getServerBannerLocal(1), bannerRemote: getServerBannerRemote(1), sellPrice: 690, buyPrice: 320 },
  { id: 2, name: "StrawBerry", emoji: "🍓", banner: getServerBannerLocal(2), bannerRemote: getServerBannerRemote(2), sellPrice: 690, buyPrice: 320 },
  { id: 3, name: "VineWood", emoji: "�", banner: getServerBannerLocal(3), bannerRemote: getServerBannerRemote(3), sellPrice: 690, buyPrice: 320 },
  { id: 4, name: "BlackBerry", emoji: "🍇", banner: getServerBannerLocal(4), bannerRemote: getServerBannerRemote(4), sellPrice: 720, buyPrice: 334 },
  { id: 5, name: "Insquad", emoji: "🎭", banner: getServerBannerLocal(5), bannerRemote: getServerBannerRemote(5), sellPrice: 700, buyPrice: 325 },
  { id: 6, name: "Sunrise", emoji: "🌅", banner: getServerBannerLocal(6), bannerRemote: getServerBannerRemote(6), sellPrice: 800, buyPrice: 372 },
  { id: 7, name: "Rainbow", emoji: "🌈", banner: getServerBannerLocal(7), bannerRemote: getServerBannerRemote(7), sellPrice: 820, buyPrice: 381 },
  { id: 8, name: "Richman", emoji: "🤵", banner: getServerBannerLocal(8), bannerRemote: getServerBannerRemote(8), sellPrice: 790, buyPrice: 367 },
  { id: 9, name: "Eclipse", emoji: "🌑", banner: getServerBannerLocal(9), bannerRemote: getServerBannerRemote(9), sellPrice: 420, buyPrice: 195 },
  { id: 10, name: "LaMesa", emoji: "�", banner: getServerBannerLocal(10), bannerRemote: getServerBannerRemote(10), sellPrice: 740, buyPrice: 344 },
  { id: 11, name: "Burton", emoji: "�️", banner: getServerBannerLocal(11), bannerRemote: getServerBannerRemote(11), sellPrice: 700, buyPrice: 325 },
  { id: 12, name: "Rockford", emoji: "�", banner: getServerBannerLocal(12), bannerRemote: getServerBannerRemote(12), sellPrice: 860, buyPrice: 399 },
  { id: 13, name: "Alta", emoji: "☘️", banner: getServerBannerLocal(13), bannerRemote: getServerBannerRemote(13), sellPrice: 840, buyPrice: 390 },
  { id: 14, name: "Del Perro", emoji: "⚙️", banner: getServerBannerLocal(14), bannerRemote: getServerBannerRemote(14), sellPrice: 750, buyPrice: 348 },
  { id: 15, name: "Davis", emoji: "🏀", banner: getServerBannerLocal(15), bannerRemote: getServerBannerRemote(15), sellPrice: 790, buyPrice: 367 },
  { id: 16, name: "Harmony", emoji: "�", banner: getServerBannerLocal(16), bannerRemote: getServerBannerRemote(16), sellPrice: 650, buyPrice: 302 },
  { id: 17, name: "Redwood", emoji: "🌲", banner: getServerBannerLocal(17), bannerRemote: getServerBannerRemote(17), sellPrice: 550, buyPrice: 255 },
  { id: 18, name: "Hawick", emoji: "💵", banner: getServerBannerLocal(18), bannerRemote: getServerBannerRemote(18), sellPrice: 750, buyPrice: 348 },
  { id: 19, name: "Grapeseed", emoji: "�", banner: getServerBannerLocal(19), bannerRemote: getServerBannerRemote(19), sellPrice: 740, buyPrice: 344 },
  { id: 20, name: "Murrieta", emoji: "�", banner: getServerBannerLocal(20), bannerRemote: getServerBannerRemote(20), sellPrice: 580, buyPrice: 269 },
  { id: 21, name: "Vespucci", emoji: "🛥️", banner: getServerBannerLocal(21), bannerRemote: getServerBannerRemote(21), sellPrice: 460, buyPrice: 213 },
  { id: 22, name: "Milton", emoji: "�", banner: getServerBannerLocal(22), bannerRemote: getServerBannerRemote(22), sellPrice: 700, buyPrice: 325 },
  { id: 23, name: "La Puerta", emoji: "🎉", banner: getServerBannerLocal(23), bannerRemote: getServerBannerRemote(23), sellPrice: 820, buyPrice: 381 }
];

export default SERVERS;
