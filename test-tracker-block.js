'use strict';

const { shouldBlockUrl } = require('./tracker-block');

const BLOCK = {
  'Google AdSense': 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'Google AdMob': 'https://googleads.g.doubleclick.net/mads/gma',
  'Google Ads': 'https://www.googleadservices.com/pagead/conversion.js',
  'Meta Audience Network': 'https://an.facebook.com/v2/placement',
  'Amazon Publisher Services': 'https://c.amazon-adsystem.com/aax2/apstag.js',
  'Unity Ads': 'https://unityads.unity3d.com/webview/index.html',
  'AppLovin': 'https://ms.applovin.com/1.0/bid',
  'ironSource': 'https://init.supersonicads.com/sdk',
  'Taboola': 'https://cdn.taboola.com/libtrc/unip/123/tfa.js',
  'Outbrain': 'https://widgets.outbrain.com/outbrain.js',
  'PropellerAds': 'https://cdn.propellerads.com/tag.js',
  'Adsterra': 'https://www.adsterra.com/js/push.js',
  'Media.net': 'https://contextual.media.net/dmedianet.js',
  'InMobi': 'https://config.inmobi.com/config',
  'Liftoff': 'https://cdn.liftoff.io/js/creative.js',
  'Mintegral': 'https://cdn-adn.rayjump.com/cdn-adn/js.js',
  'Chartboost': 'https://live.chartboost.com/api/preload',
  'Microsoft Advertising': 'https://flex.msn.com/mstag/site/tag.js',
  'Criteo': 'https://static.criteo.net/js/ld/publishertag.js',
  'The Trade Desk': 'https://insight.adsrvr.org/track/conv.js',
  'PubMatic': 'https://ads.pubmatic.com/AdServer/js/showad.js',
  'Index Exchange': 'https://js-sec.indexww.com/ht/p/index.js',
  'Magnite': 'https://fastlane.rubiconproject.com/a/api/fastlane.json',
  'OpenX': 'https://us-u.openx.net/w/1.0/arj',
  'TripleLift': 'https://ib.3lift.com/ttj',
  'Sovrn': 'https://ap.lijit.com/header/auction',
  'RevenueHits': 'https://www.revenuehits.com/tag.js',
  'BuySellAds': 'https://s3.buysellads.com/ac/bsa.js',
  'Ezoic': 'https://www.ezojs.com/ezoic/sa.min.js',
  'Mediavine': 'https://scripts.mediavine.com/tags/site.js',
  'Raptive': 'https://ads.adthrive.com/sites/site/ads.min.js',
  'PopAds': 'https://cdn.popads.net/pop.js',
  'PopCash': 'https://cdn.popcash.net/pop.js',
  'ExoClick': 'https://ads.exoclick.com/ad.js',
  'JuicyAds': 'https://js.juicyads.com/show.js',
  'TrafficStars': 'https://cdn.tsyndicate.com/sdk.js',
  'PlugRush': 'https://www.plugrush.com/script.js',
  'Bidvertiser': 'https://bdv.bidvertiser.com/BidVertiser.dbm',
  'MGID': 'https://jsc.mgid.com/site.js',
  'RevContent': 'https://trends.revcontent.com/serve.js',
  'Undertone': 'https://cdn.undertone.com/js/u.js',
  'Teads': 'https://a.teads.tv/page/0/tag',
  'Showheroes': 'https://sdk.showheroes.com/shim.js',
  'SmartyAds': 'https://n.smartyads.com/tag.js',
  'Epom': 'https://www.epom.com/ad.js',
  'ClickAdu': 'https://s.clickadu.com/script.js',
  'HilltopAds': 'https://hilltopads.net/script.js',
  'RichAds': 'https://richads.com/tag.js',
  'RollerAds': 'https://rollerads.com/tag.js',
  'Coinzilla': 'https://coinzilla.com/tag.js',
  'CoinTraffic': 'https://app.cointraffic.io/js/script.js',
  'AdBlade': 'https://web.adblade.com/js/ads/async/show.js',
  'Yahoo Native': 'https://gemini.yahoo.com/sapi/native',
  'Skimlinks': 'https://s.skimresources.com/js/skimlinks.js',
  'ShareASale': 'https://www.shareasale.com/sale.cfm',
  'CJ Affiliate': 'https://www.emjcd.com/u',
  'Rakuten Advertising': 'https://click.linksynergy.com/fs-bin/click',
  'Awin': 'https://www.awin1.com/awclick.php',
  'Impact': 'https://example.evyy.net/c/click',
  'AdColony': 'https://ads30.adcolony.com/configure',
  'Digital Turbine': 'https://canvas.digitalturbine.com/tag.js',
  'Moloco': 'https://sdkapi.molocoads.com/v1/bid',
  'adult-trafficjunky': 'https://ads.trafficjunky.net/ad/banner.js',
  'Google first-party AdSense': 'https://www.google.com/pagead/ads',
  'Google Ads click': 'https://www.google.com/aclk?sa=l',
  'YouTube midroll': 'https://www.youtube.com/api/stats/ads',
  'YouTube pagead': 'https://www.youtube.com/pagead/adview',
  'Facebook pixel': 'https://www.facebook.com/tr',
  'Amazon sponsored': 'https://www.amazon.com/sspa/click',
  'Amazon pixel': 'https://fls-na.amazon.com/1/batch/1/OP',
  'Bing ads click': 'https://www.bing.com/aclick?ld=test',
  'Yahoo native path': 'https://s.yimg.com/rq/darla/modern.js',
  'Awin network': 'https://www.awin.com/publisher',
  'CJ network': 'https://www.cj.com/publisher',
};

const ALLOW = [
  'https://www.pornhub.com/view_video.php?viewkey=abc',
  'https://ei.phncdn.com/videos/202401/clip.mp4',
  'https://www.xvideos.com/video123/title',
  'https://www.xhamster.com/videos/example',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.google.com/search?q=test',
  'https://accounts.google.com/v3/signin/identifier',
  'https://www.google.com/recaptcha/api.js',
  'https://www.gstatic.com/recaptcha/releases/x/recaptcha__en.js',
  'https://www.google.com/sorry/index?continue=https://www.google.com/',
  'https://duckduckgo.com/?q=test',
  'https://github.com/oguzbayata/agent-browser',
  'https://www.amazon.com/dp/B000000000',
  'https://www.facebook.com/zuck',
  'https://www.bing.com/search?q=test',
  'https://www.microsoft.com/',
  'https://www.yahoo.com/',
  'https://www.rakuten.com/',
  'https://impact.com/',
  'https://unity.com/',
];

let failed = 0;
for (const [network, url] of Object.entries(BLOCK)) {
  if (!shouldBlockUrl(url)) {
    failed += 1;
    console.error(`expected block (${network}): ${url}`);
  }
}
for (const url of ALLOW) {
  if (shouldBlockUrl(url)) {
    failed += 1;
    console.error(`expected allow: ${url}`);
  }
}

const googlePage = 'https://www.google.com/search?q=test';
const googleHarbor = [
  'https://www.google.com/pagead/ads',
  'https://www.google.com/aclk?sa=l',
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://googleads.g.doubleclick.net/mads/gma',
  'https://www.googleadservices.com/pagead/conversion.js',
  'https://adservice.google.com/adsid/google/ui',
];
for (const url of googleHarbor) {
  if (shouldBlockUrl(url, { pageUrl: googlePage })) {
    failed += 1;
    console.error(`expected allow on Google page: ${url}`);
  }
}

if (failed) {
  console.error(`${failed} tracker-block checks failed`);
  process.exit(1);
}

console.log(`tracker-block ok · ${Object.keys(BLOCK).length} blocked · ${ALLOW.length} allowed`);
