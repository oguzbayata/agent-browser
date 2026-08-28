'use strict';

const { shouldBlockUrl } = require('./tracker-block');

const BLOCK = [
  'https://ads.trafficjunky.net/ad/banner.js',
  'https://media.trafficjunky.net/media/vast.xml',
  'https://static.trafficjunky.com/js/mp.min.js',
  'https://syndication.exoclick.com/splash.php',
  'https://ads.exoclick.com/ad.js',
  'https://s.magsrv.com/tag.js',
  'https://js.juicyads.com/show.js',
  'https://poweredby.jads.co/js/jads.js',
  'https://delivery.trafficfactory.biz/ads',
  'https://ads.doublepimp.com/ad',
  'https://ads2.contentabc.com/ads',
  'https://www.adtng.com/vast',
  'https://cdn.tsyndicate.com/sdk.js',
  'https://alaska.xhamster.com/vast',
  'https://www.pornhub.com/_xa/ads',
  'https://www.xvideos.com/zoneload/foo',
  'https://www.doubleclick.net/gampad/ads',
];

const ALLOW = [
  'https://www.pornhub.com/view_video.php?viewkey=abc',
  'https://ei.phncdn.com/videos/202401/clip.mp4',
  'https://www.xvideos.com/video123/title',
  'https://www.xhamster.com/videos/example',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://duckduckgo.com/?q=test',
  'https://github.com/oguzbayata/agent-browser',
];

let failed = 0;
for (const url of BLOCK) {
  if (!shouldBlockUrl(url)) {
    failed += 1;
    console.error(`expected block: ${url}`);
  }
}
for (const url of ALLOW) {
  if (shouldBlockUrl(url)) {
    failed += 1;
    console.error(`expected allow: ${url}`);
  }
}

if (failed) {
  console.error(`${failed} tracker-block checks failed`);
  process.exit(1);
}

console.log(`tracker-block ok · ${BLOCK.length} blocked · ${ALLOW.length} allowed`);
