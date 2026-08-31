'use strict';

const TRACKER_HOST_SUFFIXES = Object.freeze([
  'google-analytics.com',
  'googletagmanager.com',
  'googlesyndication.com',
  'googleadservices.com',
  'doubleclick.net',
  '2mdn.net',
  'connect.facebook.net',
  'facebook.net',
  'pixel.facebook.com',
  'ads-twitter.com',
  'analytics.twitter.com',
  'static.ads-twitter.com',
  'hotjar.com',
  'hotjar.io',
  'scorecardresearch.com',
  'quantserve.com',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
  'amazon-adsystem.com',
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'casalemedia.com',
  'moatads.com',
  'adsrvr.org',
  'advertising.com',
  'clarity.ms',
  'bat.bing.com',
  'ads.linkedin.com',
  'snap.licdn.com',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'amplitude.com',
  'ads.twitter.com',
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'adservice.google.com.tr',
  'partner.googleadservices.com',
  'adtrafficquality.google',
  'fundingchoicesmessages.google.com',
  'analytics.google.com',
  'securepubads.g.doubleclick.net',
  'tpc.googlesyndication.com',
  'ad.doubleclick.net',
  'cm.g.doubleclick.net',
  'pagead.l.doubleclick.net',
  'stats.g.doubleclick.net',
  's0.2mdn.net',
  'sc-static.net',
  'tr.snapchat.com',
  'ads.yahoo.com',
  'advertising.yahoo.com',
  'ads.pinterest.com',
  'log.pinterest.com',
  'ads.reddit.com',
  'alb.reddit.com',
  'adform.net',
  'adsafeprotected.com',
  'openx.net',
  'openx.com',
  'smartadserver.com',
  'indexww.com',
  'contextweb.com',
  'bidswitch.net',
  'rlcdn.com',
  'bluekai.com',
  'krxd.net',
  'exelator.com',
  'mathtag.com',
  'media.net',
  'yieldmo.com',
  'sharethrough.com',
  '3lift.com',
  'googletagservices.com',
  'ads.youtube.com',
  'ad.youtube.com',
  'serving-sys.com',
  'creativecdn.com',
  'liadm.com',
  'adsymptotic.com',
  'branch.io',
  'app-measurement.com',
  'trafficjunky.net',
  'trafficjunky.com',
  'hubtraffic.com',
  'adtng.com',
  'contentabc.com',
  'exoclick.com',
  'exosrv.com',
  'exdynsrv.com',
  'magsrv.com',
  'wpadmngr.com',
  'juicyads.com',
  'juicyads.net',
  'jads.co',
  'trafficfactory.biz',
  'trafficfactory.com',
  'doublepimp.com',
  'doublepimpssl.com',
  'dpinteractive.com',
  'twinrdsrv.com',
  'plugrush.com',
  'eroadvertising.com',
  'exoticads.com',
  'hilltopads.com',
  'hilltopads.net',
  'clickadu.com',
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'tsyndicate.com',
  'adsterra.com',
  'adsterra.net',
  'freakads.com',
  'tubeadnetwork.com',
  'tubeadv.com',
  'sexad.net',
  'awempire.com',
  'mtree.com',
  'alaska.xhamster.com',
  'brick.xhamster.com',
  'marine.xhamster.com',
  'port7.xhamster.com',
  'rambo.xhamster.com',
  'rockpoint.xhamster.com',
  'adsensecustomsearchads.com',
  'admob.com',
  'imasdk.googleapis.com',
  'an.facebook.com',
  'atlassolutions.com',
  'unityads.unity3d.com',
  'applovin.com',
  'applvn.com',
  'ironsrc.com',
  'ironsource.net',
  'supersonicads.com',
  'isappcore.com',
  'ironsrc.mobi',
  'propellerclick.com',
  'inmobi.com',
  'inmobicdn.net',
  'liftoff.io',
  'liftoff-creatives.io',
  'mintegral.com',
  'mintegral.net',
  'rayjump.com',
  'chartboost.com',
  'chartboosts.com',
  'flex.msn.com',
  'ads1.msn.com',
  'ads.msn.com',
  'rad.msn.com',
  'msads.net',
  'bingads.microsoft.com',
  'advertising.microsoft.com',
  'criteo.net',
  'indexexchange.com',
  'magnite.com',
  'telaria.com',
  'tremorhub.com',
  'triplelift.com',
  'sovrn.com',
  'lijit.com',
  'revenuehits.com',
  'clkmon.com',
  'buysellads.com',
  'buysellads.net',
  'servedby-buysellads.com',
  'carbonads.com',
  'carbonads.net',
  'ezoic.com',
  'ezoic.net',
  'ezodn.com',
  'ezojs.com',
  'mediavine.com',
  'grow.me',
  'raptive.com',
  'adthrive.com',
  'trafficstars.com',
  'bidvertiser.com',
  'mgid.com',
  'dt00.net',
  'dt07.net',
  'revcontent.com',
  'undertone.com',
  'teads.tv',
  'teads.com',
  'showheroes.com',
  'showheroes-registry.net',
  'smartyads.com',
  'epom.com',
  'richads.com',
  'rollerads.com',
  'coinzilla.com',
  'coinzilla.io',
  'cointraffic.io',
  'adblade.com',
  'gemini.yahoo.com',
  'adtechus.com',
  'adtech.de',
  'skimresources.com',
  'skimlinks.com',
  'shareasale.com',
  'emjcd.com',
  'ftjcfx.com',
  'tqlkg.com',
  'dpbolvw.net',
  'anrdoezrs.net',
  'jdoqocy.com',
  'tkqlhce.com',
  'qksrv.net',
  'rakutenadvertising.com',
  'linksynergy.com',
  'awin1.com',
  'zanox.com',
  'evyy.net',
  'ojrq.net',
  '7eer.net',
  'sjv.io',
  'pxf.io',
  'adcolony.com',
  'digitalturbine.com',
  'fyber.com',
  'inner-active.mobi',
  'molocoads.com',
  'moloco.com',
  'awin.com',
  'cj.com',
  'impactradius.net',
  'nmo4.com',
  'inneractive.mobi',
  'vungle.com',
  'vungle.io',
  'ads.unity3d.com',
]);

const TRACKER_PATH_RULES = Object.freeze([
  {
    hostSuffix: 'facebook.com',
    pathTest: (pathname) =>
      pathname === '/tr' || pathname.startsWith('/tr/') || pathname.startsWith('/an/'),
  },
  { hostSuffix: 'pornhub.com', pathTest: (pathname) => pathname.includes('/_xa/ads') },
  { hostSuffix: 'pornhub.org', pathTest: (pathname) => pathname.includes('/_xa/ads') },
  { hostSuffix: 'pornhubpremium.com', pathTest: (pathname) => pathname.includes('/_xa/ads') },
  { hostSuffix: 'redtube.com', pathTest: (pathname) => pathname.includes('/_xa/ads') },
  { hostSuffix: 'youporn.com', pathTest: (pathname) => pathname.includes('/_xa/ads') },
  { hostSuffix: 'tube8.com', pathTest: (pathname) => pathname.includes('/_xa/ads') },
  { hostSuffix: 'xvideos.com', pathTest: (pathname) => pathname.includes('/zoneload/') },
  { hostSuffix: 'xnxx.com', pathTest: (pathname) => pathname.includes('/zoneload/') },
  { hostSuffix: 'xnxx.tv', pathTest: (pathname) => pathname.includes('/zoneload/') },
  {
    hostSuffix: 'xhamster.com',
    pathTest: (pathname, search) => pathname.includes('/vast') || String(search || '').includes('vast'),
  },
  {
    hostSuffix: 'xhamster2.com',
    pathTest: (pathname, search) => pathname.includes('/vast') || String(search || '').includes('vast'),
  },
  {
    hostSuffix: 'xhamster3.com',
    pathTest: (pathname, search) => pathname.includes('/vast') || String(search || '').includes('vast'),
  },
]);

function stripWww(hostname) {
  return String(hostname || '').replace(/^www\./i, '').toLowerCase();
}

function isGoogleSearchHost(hostname) {
  const host = stripWww(hostname);
  return host === 'google.com' || host.endsWith('.google.com') || /^google\.[a-z]{2,8}(?:\.[a-z]{2})?$/.test(host);
}

function isYoutubeHost(hostname) {
  const host = stripWww(hostname);
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host === 'youtube-nocookie.com';
}

function isAmazonHost(hostname) {
  const host = stripWww(hostname);
  return host === 'amazon.com' || /^amazon\.[a-z]{2,8}(?:\.[a-z]{2})?$/.test(host) || host.endsWith('.amazon.com');
}

function isFacebookHost(hostname) {
  const host = stripWww(hostname);
  return (
    host === 'facebook.com' ||
    host.endsWith('.facebook.com') ||
    host === 'fb.com' ||
    host === 'instagram.com' ||
    host.endsWith('.instagram.com')
  );
}

function isFirstPartyAdRequest(hostname, pathname, search) {
  const host = stripWww(hostname);
  const path = String(pathname || '').toLowerCase();
  const query = String(search || '').toLowerCase();

  if (isGoogleSearchHost(hostname)) {
    return (
      path.includes('/pagead') ||
      path.startsWith('/aclk') ||
      path.startsWith('/ads/') ||
      path.startsWith('/adsense') ||
      path.includes('/afs/ads')
    );
  }

  if (isYoutubeHost(hostname)) {
    return (
      path.includes('/pagead') ||
      path.includes('/ptracking') ||
      path.includes('/get_midroll') ||
      path.includes('/api/stats/ads') ||
      path.includes('/ad_data') ||
      path.includes('/player/ad') ||
      path.includes('/youtubei/v1/player/ad')
    );
  }

  if (isAmazonHost(hostname)) {
    if (/^(fls-|unagi|aax\.|aan\.)/.test(host) || host.startsWith('unagi-') || host.startsWith('fls-')) {
      return true;
    }
    return (
      path.includes('/sspa') ||
      path.includes('/aan/') ||
      path.includes('/gp/sponsored') ||
      path.includes('/gp/overlay') ||
      path.includes('/gp/uedata') ||
      path.includes('/gp/product/handlers/render-sponsored')
    );
  }

  if (isFacebookHost(hostname)) {
    return (
      path === '/tr' ||
      path.startsWith('/tr/') ||
      path.startsWith('/an/') ||
      path.startsWith('/ajax/bz') ||
      path.includes('/ads/pixel') ||
      path.includes('/ad_nile') ||
      path.includes('/brandlift')
    );
  }

  if (host === 'bing.com' || host.endsWith('.bing.com')) {
    return path.includes('/aclick') || path.startsWith('/ads/') || path.includes('/fd/ls/lsp.aspx');
  }

  if (host === 'yahoo.com' || host.endsWith('.yahoo.com') || host === 'yimg.com' || host.endsWith('.yimg.com')) {
    return (
      path.includes('/gemini') ||
      path.includes('/rq/darla') ||
      path.startsWith('/ads/') ||
      path.includes('/adsserv')
    );
  }

  if (host === 'gstatic.com' || host.endsWith('.gstatic.com')) {
    return path.includes('/pagead') || path.includes('/adsense') || path.includes('/afs/');
  }

  if (host === 'microsoft.com' || host.endsWith('.microsoft.com')) {
    return path.includes('/advertising') || path.startsWith('/ads/');
  }

  if (host === 'unity.com' || host.endsWith('.unity.com') || host.endsWith('.unity3d.com')) {
    return path.includes('/unityads') || host.startsWith('ads.') || host.includes('unityads');
  }

  void query;
  return false;
}

const AD_HIDE_CSS =
  'iframe[src*="exoclick"],iframe[src*="exosrv"],iframe[src*="trafficjunky"],iframe[src*="juicyads"],' +
  'iframe[src*="jads.co"],iframe[src*="trafficfactory"],iframe[src*="doublepimp"],iframe[src*="adtng"],' +
  'iframe[src*="contentabc"],iframe[src*="hubtraffic"],iframe[src*="tsyndicate"],iframe[src*="plugrush"],' +
  'iframe[src*="eroadvertising"],iframe[src*="hilltopads"],iframe[src*="clickadu"],iframe[src*="magsrv"],' +
  'iframe[src*="popads"],iframe[src*="popcash"],iframe[src*="adsterra"],iframe[src*="doubleclick"],' +
  'iframe[src*="googlesyndication"],iframe[src*="amazon-adsystem"],iframe[src*="taboola"],' +
  'iframe[src*="outbrain"],iframe[src*="criteo"],iframe[src*="mgid"],iframe[src*="revcontent"],' +
  'iframe[src*="propellerads"],iframe[src*="media.net"],iframe[src*="teads"],iframe[src*="ezoic"],' +
  'iframe[src*="carbonads"],iframe[src*="buysellads"],iframe[src*="mediavine"],iframe[src*="adthrive"],' +
  'iframe[id^="google_ads"],iframe[src*="pagead"],iframe[src*="adservice.google"],' +
  'ins.adsbygoogle,.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],[id^="ezoic-pub-ad"],' +
  '.trc_rbox,#taboola-below-article-thumbnails,[id*="taboola"],.OUTBRAIN,[class*="outbrain-"],' +
  'ytd-ad-slot-renderer,ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,' +
  'ytd-in-feed-ad-layout-renderer,ytd-promoted-video-renderer,.ytp-ad-module,.video-ads,' +
  '.ytp-ad-player-overlay,.ytp-ad-overlay-container,[class*="adthrive"],.mv-ad,.ez-ad,' +
  '#carbonads,.carbon-ads,[data-ad-slot],[data-google-query-id],' +
  '.adsbytrafficjunky,[class*="adsbytrafficjunky"],.removeAdsHeader,.remove-ads-header,' +
  '.mgp_ad,.mgp_preroll,.mgp_overlayAd,.mgp_promo,.mgp_seekAd,' +
  '#player-ads,#ad-right,#ad-left,.adRight,.adLeft,' +
  'a[href*="trafficjunky"],a[href*="adtng.com"],a[href*="exoclick"],a[href*="juicyads"]' +
  '{display:none!important;visibility:hidden!important;pointer-events:none!important;' +
  'width:0!important;height:0!important;max-height:0!important;overflow:hidden!important}';

function hostnameMatchesSuffix(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

function isGooglePropertyUrl(rawUrl) {
  try {
    const host = stripWww(new URL(rawUrl).hostname);
    return (
      host === 'google.com' ||
      host.endsWith('.google.com') ||
      host === 'youtube.com' ||
      host.endsWith('.youtube.com') ||
      host === 'youtu.be' ||
      host === 'youtube-nocookie.com' ||
      host === 'gstatic.com' ||
      host.endsWith('.gstatic.com') ||
      host === 'googleapis.com' ||
      host.endsWith('.googleapis.com') ||
      host === 'googleusercontent.com' ||
      host.endsWith('.googleusercontent.com') ||
      host === 'ggpht.com' ||
      host.endsWith('.ggpht.com') ||
      /^google\.[a-z]{2,8}(?:\.[a-z]{2})?$/.test(host)
    );
  } catch {
    return false;
  }
}

function isGoogleSignInOrCaptcha(hostname, pathname) {
  const host = stripWww(hostname);
  const path = String(pathname || '').toLowerCase();
  if (path.includes('/recaptcha') || path.includes('/rotatecaptcha') || path.startsWith('/sorry')) {
    return true;
  }
  return host === 'accounts.google.com' || host === 'accounts.youtube.com';
}

function pageUrlFromContext(context) {
  if (typeof context === 'string') {
    return context;
  }
  if (context && typeof context === 'object') {
    return String(context.pageUrl || '');
  }
  return '';
}

function shouldBlockUrl(rawUrl, context) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  if (isGooglePropertyUrl(pageUrlFromContext(context))) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isGoogleSignInOrCaptcha(hostname, parsed.pathname)) {
    return false;
  }
  if (TRACKER_HOST_SUFFIXES.some((suffix) => hostnameMatchesSuffix(hostname, suffix))) {
    return true;
  }

  if (isFirstPartyAdRequest(hostname, parsed.pathname, parsed.search)) {
    return true;
  }

  return TRACKER_PATH_RULES.some(
    (rule) =>
      hostnameMatchesSuffix(hostname, rule.hostSuffix) && rule.pathTest(parsed.pathname, parsed.search),
  );
}

module.exports = {
  AD_HIDE_CSS,
  TRACKER_HOST_SUFFIXES,
  TRACKER_PATH_RULES,
  hostnameMatchesSuffix,
  isGooglePropertyUrl,
  shouldBlockUrl,
};
