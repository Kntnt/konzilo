// What an element of a page shows while something happens, frame by frame: in Chromium every
// frame it draws, from its screencast, and in another engine as many as screenshots catch. Each
// frame is told by its brightness, the mean grey of its pixels from 0 to 255, and its spread, how
// far they stand from that mean. A blank frame is all one colour, with next to no spread.

import { sharp } from '../../tests/lib/images.js';

const ONE_COLOUR = 2;

export const isBlank = ({ spread }) => spread < ONE_COLOUR;

const measured = async (image, clip) => {
  const cut = clip ? sharp(image).extract(clip) : sharp(image);
  const { data } = await cut.greyscale().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  let squares = 0;
  for (const value of data) {
    sum += value;
    squares += value * value;
  }
  const brightness = sum / data.length;
  return { brightness, spread: Math.sqrt(Math.max(0, squares / data.length - brightness * brightness)) };
};

// `element`: a locator of what to watch, in view. `work`: what happens, done when it returns.
export async function framesWhile(page, element, work) {
  const box = await element.boundingBox();
  const { width, height } = page.viewportSize();
  const x = Math.max(0, Math.ceil(box.x));
  const y = Math.max(0, Math.ceil(box.y));
  const area = { x, y, width: Math.floor(Math.min(box.x + box.width, width)) - x, height: Math.floor(Math.min(box.y + box.height, height)) - y };
  const images = [];
  if (page.context().browser().browserType().name() === 'chromium') {
    const screen = await page.context().newCDPSession(page);
    screen.on('Page.screencastFrame', ({ data, sessionId }) => {
      images.push(Buffer.from(data, 'base64'));
      screen.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await screen.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    try {
      await work();
    } finally {
      await screen.send('Page.stopScreencast');
      await screen.detach();
    }
    // A screencast's frame is the whole viewport, at the device's scale.
    return Promise.all(images.map(async (image) => {
      const scale = (await sharp(image).metadata()).width / width;
      const clip = { left: Math.round(area.x * scale), top: Math.round(area.y * scale), width: Math.floor(area.width * scale), height: Math.floor(area.height * scale) };
      return measured(image, clip);
    }));
  }
  let done = false;
  const catching = (async () => {
    while (!done) images.push(await page.screenshot({ clip: area }));
  })();
  try {
    await work();
  } finally {
    done = true;
    await catching;
  }
  return Promise.all(images.map((image) => measured(image)));
}
