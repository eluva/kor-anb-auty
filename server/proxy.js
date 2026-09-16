'use strict';
/**
 * Режим доверия прокси «cloudflare» — для Render и других платформ за Cloudflare.
 *
 * Путь запроса на Render: покупательница → Cloudflare → балансировщик Render → магазин.
 * Каждый прокси дописывает в X-Forwarded-For адрес того, кто к нему подключился,
 * и ничего не стирает — значит, начало заголовка покупательница может подделать.
 *
 * Считать «сколько прокси впереди» ненадёжно: ошибка на единицу — и все
 * покупательницы выглядят как один адрес Cloudflare, а лимит «5 заказов
 * за 10 минут» начинает отклонять настоящие заказы.
 *
 * Поэтому доверяем по адресу, а не по счёту: Express идёт по цепочке справа
 * налево, пропускает внутреннюю сеть и узлы Cloudflare и останавливается
 * на первом внешнем адресе. Это и есть покупательница. Всё, что левее, —
 * то, что она могла дописать сама, и оно не читается.
 */
const net = require('node:net');

/* Внутренние сети: балансировщики хостинга, localhost */
const PRIVATE = [
  ['127.0.0.0', 8, 'ipv4'], ['10.0.0.0', 8, 'ipv4'], ['172.16.0.0', 12, 'ipv4'],
  ['192.168.0.0', 16, 'ipv4'], ['169.254.0.0', 16, 'ipv4'], ['100.64.0.0', 10, 'ipv4'],
  ['::1', 128, 'ipv6'], ['fc00::', 7, 'ipv6'], ['fe80::', 10, 'ipv6'],
];

/* Узлы Cloudflare: https://www.cloudflare.com/ips/ (сверено в сентябре 2026) */
const CLOUDFLARE = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32',
  '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32',
];

const privateNets = new net.BlockList();
for (const [addr, prefix, type] of PRIVATE) privateNets.addSubnet(addr, prefix, type);

const cloudflareNets = new net.BlockList();
for (const cidr of CLOUDFLARE) {
  const [addr, prefix] = cidr.split('/');
  cloudflareNets.addSubnet(addr, Number(prefix), net.isIPv6(addr) ? 'ipv6' : 'ipv4');
}

/* «::ffff:10.0.0.5» — IPv4, записанный как IPv6: так Node часто отдаёт адрес сокета */
function normalize(addr) {
  const s = String(addr || '').trim();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(s);
  return mapped ? mapped[1] : s;
}

function inList(list, addr) {
  const a = normalize(addr);
  const type = net.isIPv4(a) ? 'ipv4' : net.isIPv6(a) ? 'ipv6' : null;
  return type ? list.check(a, type) : false;
}

const isPrivate = (addr) => inList(privateNets, addr);
const isCloudflare = (addr) => inList(cloudflareNets, addr);

/** Функция для app.set('trust proxy', …): верим внутренней сети и Cloudflare */
function trustCloudflare(addr) {
  return isPrivate(addr) || isCloudflare(addr);
}

module.exports = { trustCloudflare, isPrivate, isCloudflare, normalize, CLOUDFLARE };
