import fs from 'fs';
import * as MP4Box from 'mp4box';
const createFile = MP4Box.createFile;

function fragment(name) {
  return new Promise((resolve, reject) => {
    const buf = fs.readFileSync(name + '.mp4');
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    ab.fileStart = 0;
    const file = createFile();
    const segs = [];
    let init = null, info = null, vid = null;
    file.onError = reject;
    file.onReady = (i) => {
      info = i;
      vid = i.tracks.find((t) => t.type === 'video');
      file.setSegmentOptions(vid.id, null, { nbSamples: 100000 });
      init = file.initializeSegmentation();
      file.start();
    };
    file.onSegment = (id, user, buffer) => { segs.push(Buffer.from(buffer)); };
    file.appendBuffer(ab);
    file.flush();
    setTimeout(() => resolve({ info, vid, init, segs }), 500);
  });
}

for (const name of (process.argv[2] || 'A,B').split(',')) {
  const { info, vid, init, segs } = await fragment(name);
  console.log(name, 'längd', (info.duration / info.timescale).toFixed(2), 's; spår:', info.tracks.map((t) => `${t.id}:${t.type}:${t.codec}:${t.video ? t.video.width + 'x' + t.video.height : t.audio ? t.audio.sample_rate : ''}`).join(' '));
  console.log('  init-objekt:', Object.keys(init), 'init byte:', init.buffer ? init.buffer.byteLength : '?');
  fs.writeFileSync(`${name}.init.mp4`, Buffer.from(init.buffer));
  const media = Buffer.concat(segs);
  fs.writeFileSync(`${name}.media.m4s`, media);
  console.log('  segment:', segs.length, 'media byte:', media.length, 'videospår', vid.id, 'codec', vid.codec);
}
