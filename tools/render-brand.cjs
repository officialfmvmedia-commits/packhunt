const puppeteer = require('puppeteer-core');
(async () => {
  const base = process.argv[2];
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 1200, height: 630 }); await p.goto(base + '/tools-render/og.html?' + Date.now(), { waitUntil: 'networkidle0' }); await p.waitForSelector('body[data-ready]'); await new Promise(r => setTimeout(r, 300));
  await p.screenshot({ path: '/workspace/packhunt/site/assets/og.png' });
  await p.setViewport({ width: 512, height: 512 }); await p.goto(base + '/favicon.svg?' + Date.now(), { waitUntil: 'networkidle0' });
  await p.screenshot({ path: '/workspace/packhunt/site/assets/logo-512.png', omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
  await b.close();
})();
