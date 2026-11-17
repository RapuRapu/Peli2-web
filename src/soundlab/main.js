import { createAudio } from '../crab/audio.js';

const audio = createAudio();

const GROUPS = [
  { title: 'Kävely', sounds: [['stepSand', 'Hiekka'], ['stepWetSand', 'Märkä hiekka'], ['stepSplash', 'Kahlaus']], walk: true },
  { title: 'Poiminta', sounds: [['gatherShellBits', '🐚 Simpukanpala'], ['gatherDriftwood', '🪵 Ajopuu'], ['gatherSeaLettuce', '🥬 Merisalaatti'], ['gatherPearls', '🦪 Helmi']] },
  { title: 'Taistelu', sounds: [['clawSnap', 'Saksien napsahdus'], ['hitThud', 'Osuma'], ['stingHit', 'Sting-isku'], ['shellClonk', 'Rapu ottaa osumaa'], ['alert', 'Vihollinen huomaa (!)']] },
  { title: 'Eliöt', sounds: [['hopperChirp', 'Hyppijän sirinä'], ['hopperJump', 'Hyppijän hyppy'], ['crabClatter', 'Rantaravun kalke'], ['gullCall', 'Lokin kirkuna'], ['wingFlap', 'Siivet'], ['fishPlop', 'Kalan pulahdus']] },
  { title: 'Käyttöliittymä', sounds: [['craft', 'Valmistus'], ['levelUp', 'Tason nousu'], ['death', 'Kuolema'], ['recoverRemains', 'Ruumiin löytyminen'], ['enchantSuccess', 'Enchant onnistuu'], ['enchantBreak', 'Enchant epäonnistuu, varuste hajoaa']] },
];

const element = (tag, className, parent, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent.appendChild(node);
  return node;
};

const root = element('main', 'lab', document.body);
element('h1', '', root, '🦀 Sea Of Crabs – äänilaboratorio');
element('p', 'note', root, 'Kaikki äänet syntetisoidaan koodilla. Napauta ääntä kuunnellaksesi; kerro mitkä kelpaavat ja mitä pitää muuttaa (numero napin vieressä).');

const volumes = element('section', 'card', root);
element('h2', '', volumes, 'Voimakkuus');
for (const [key, label] of [['music', 'Musiikki'], ['effects', 'Efektit ja ympäristö']]) {
  const row = element('label', 'slider', volumes, label);
  const input = element('input', '', row);
  Object.assign(input, { type: 'range', min: 0, max: 1, step: 0.05, value: audio.volumes[key] });
  input.addEventListener('input', () => audio.setVolumes({ [key]: Number(input.value) }));
}

const musicCard = element('section', 'card', root);
element('h2', '', musicCard, 'Musiikki (generatiivinen marimba-ambient)');
const musicRow = element('div', 'row', musicCard);
const musicButton = element('button', 'wide', musicRow, '▶ Soita musiikkia');
musicButton.addEventListener('click', () => {
  audio.unlock();
  if (musicButton.classList.toggle('active')) {
    audio.startMusic();
    musicButton.textContent = '■ Pysäytä musiikki';
  } else {
    audio.stopMusic();
    musicButton.textContent = '▶ Soita musiikkia';
  }
});
const moodRow = element('div', 'row', musicCard);
const moodButtons = [['calm', 'Rauhallinen'], ['combat', 'Taistelu'], ['gull', 'Lokin reviiri']].map(([mood, label]) => {
  const button = element('button', mood === 'calm' ? 'active' : '', moodRow, label);
  button.addEventListener('click', () => {
    audio.setMusicMood(mood);
    for (const other of moodButtons) other.classList.toggle('active', other === button);
  });
  return button;
});

const ambienceCard = element('section', 'card', root);
element('h2', '', ambienceCard, 'Ympäristö');
const ambienceButton = element('button', 'wide', ambienceCard, '▶ Aallot ja tuuli');
ambienceButton.addEventListener('click', () => {
  audio.unlock();
  audio.startAmbience();
  ambienceButton.classList.add('active');
  ambienceButton.textContent = 'Ympäristö soi';
});
for (const [key, label, value] of [['waveIntensity', 'Aallot (nousuvesi / rantaviivan lähellä)', 0.6], ['wind', 'Tuuli (dyynit)', 0]]) {
  const row = element('label', 'slider', ambienceCard, label);
  const input = element('input', '', row);
  Object.assign(input, { type: 'range', min: 0, max: 1, step: 0.05, value });
  input.addEventListener('input', () => audio.setAmbience({ [key]: Number(input.value) }));
}
const underwaterButton = element('button', 'wide', ambienceCard, 'Veden alla: pois');
underwaterButton.addEventListener('click', () => {
  const underwater = underwaterButton.classList.toggle('active');
  audio.setAmbience({ underwater });
  underwaterButton.textContent = `Veden alla: ${underwater ? 'päällä' : 'pois'}`;
});

let soundNumber = 0;
for (const group of GROUPS) {
  const card = element('section', 'card', root);
  element('h2', '', card, group.title);
  const grid = element('div', 'grid', card);
  for (const [name, label] of group.sounds) {
    soundNumber++;
    const button = element('button', 'sound', grid);
    element('span', 'number', button, String(soundNumber));
    element('span', '', button, label);
    button.dataset.sound = name;
    button.addEventListener('click', () => {
      audio.unlock();
      audio.play(name);
    });
  }
  if (group.walk) {
    const walkRow = element('div', 'row', card);
    for (const [name, label] of group.sounds) {
      const button = element('button', '', walkRow, `Kävele: ${label}`);
      button.addEventListener('click', () => {
        audio.unlock();
        for (let step = 0; step < 12; step++) setTimeout(() => audio.play(name), step * 170);
      });
    }
  }
}
window.__createAudio = createAudio;
