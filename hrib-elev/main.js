const { Map, View } = ol;
const { WebGLTile } = ol.layer;
const { XYZ } = ol.source;
const { fromLonLat, toLonLat } = ol.proj;

const FT_TO_M = 0.3048;
const M_TO_FT = 3.28084;
let currentUnit = 'ft';

const toMeters = v => currentUnit === 'ft' ? v * FT_TO_M : v;
const fromMeters = v => currentUnit === 'ft' ? v * M_TO_FT : v;

const elevationExpr = [
  '-',
  ['+', ['*', ['*', ['band', 1], 255], 256], ['*', ['band', 2], 255], ['/', ['*', ['band', 3], 255], 256]],
  32768
];

let ranges = [{
  min: 0, max: 100,
  c1: '#8bd4ff', a1: 0.5,
  c2: '#005eff', a2: 0.5,
  gradient: false
}];

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

function buildColorExpr() {
  // If no ranges exist → fully transparent layer
  if (ranges.length === 0) {
    return [0, 0, 0, 0];
  }

  const out = [];

  ranges.forEach(r => {
    const min = toMeters(r.min);
    const max = toMeters(r.max);

    const cond = ['all',
      ['>=', elevationExpr, min],
      ['<=', elevationExpr, max]
    ];

    out.push(
      cond,
      r.gradient
        ? ['interpolate', ['linear'], elevationExpr,
            min, rgba(r.c1, r.a1),
            max, rgba(r.c2, r.a2)
          ]
        : rgba(r.c1, r.a1)
    );
  });

  // Default: transparent
  out.push([0, 0, 0, 0]);
  return ['case', ...out];
}


const elevationLayer = new WebGLTile({
  source: new XYZ({
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    crossOrigin: 'anonymous'
  }),
  style: { color: buildColorExpr() }
});

const map = new Map({
  target: 'map',
  layers: [
    new WebGLTile({ source: new XYZ({ url: 'https://{a-c}.tile.openstreetmap.org/{z}/{x}/{y}.png' }) }),
    elevationLayer
  ],
  view: new View({
    center: fromLonLat([-122.3328, 47.6061]),
    zoom: 11
  })
});

const rangesDiv = document.getElementById('ranges');

unitSelect.onchange = () => {
  ranges.forEach(r => {
    r.min = Math.round(fromMeters(toMeters(r.min)));
    r.max = Math.round(fromMeters(toMeters(r.max)));
  });
  currentUnit = unitSelect.value;
  renderRanges();
  updateStyle();
};

function updateStyle() {
  elevationLayer.setStyle({ color: buildColorExpr() });
}

function addWheelStep(input, r, key) {
  input.addEventListener('wheel', e => {
    e.preventDefault();
    r[key] += e.deltaY < 0 ? 10 : -10;
    input.value = r[key];
    updateStyle();
  });
}

function renderRanges() {
  rangesDiv.innerHTML = '';

  ranges.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'range';

    div.innerHTML = `
      <div class="range-header">
        <div class="drag-handle">☰</div>
        <input type="number" value="${r.min}">
        <input type="number" value="${r.max}">
        <button>✕</button>
      </div>

      <div class="color-block">
        <div class="color-row">
          <span>Main</span>
          <input type="color" value="${r.c1}">
          <span class="a1">${r.a1}</span>
          <input type="range" min="0" max="1" step="0.01" value="${r.a1}">
        </div>

        <label><input type="checkbox" ${r.gradient ? 'checked' : ''}> Gradient</label>

        <div class="color-row ${r.gradient ? '' : 'disabled'}">
          <span>High</span>
          <input type="color" value="${r.c2}" ${r.gradient ? '' : 'disabled'}>
          <span class="a2">${r.a2}</span>
          <input type="range" min="0" max="1" step="0.01" value="${r.a2}" ${r.gradient ? '' : 'disabled'}>
        </div>
      </div>
    `;

    const inputs = div.querySelectorAll('input');

    inputs[0].oninput = e => { r.min = +e.target.value; updateStyle(); };
    inputs[1].oninput = e => { r.max = +e.target.value; updateStyle(); };

    addWheelStep(inputs[0], r, 'min');
    addWheelStep(inputs[1], r, 'max');

    inputs[2].oninput = e => { r.c1 = e.target.value; updateStyle(); };

    inputs[3].oninput = e => {
      r.a1 = +e.target.value;
      div.querySelector('.a1').textContent = r.a1;
      updateStyle();
    };

    inputs[4].onchange = e => { r.gradient = e.target.checked; renderRanges(); updateStyle(); };

    inputs[5].oninput = e => { r.c2 = e.target.value; updateStyle(); };

    inputs[6].oninput = e => {
      r.a2 = +e.target.value;
      div.querySelector('.a2').textContent = r.a2;
      updateStyle();
    };

    div.querySelector('button').onclick = () => {
      ranges.splice(i, 1);
      renderRanges();
      updateStyle();
    };

    const handle = div.querySelector('.drag-handle');
	handle.onpointerdown = e => {
	  e.preventDefault();

	  const container = rangesDiv;

	  // Calculate offset of mouse relative to container and div
	  const offsetY = e.clientY - container.getBoundingClientRect().top - div.offsetTop + container.scrollTop;

	  const startIndex = i;

	  const placeholder = document.createElement('div');
	  placeholder.className = 'range placeholder';
	  placeholder.style.height = div.offsetHeight + 'px';

	  container.insertBefore(placeholder, div.nextSibling);

	  div.classList.add('floating');
	  div.style.width = div.offsetWidth + 'px';
	  div.style.left = '0px';
	  div.style.top = div.offsetTop + 'px';

	  let currentIndex = startIndex;

	  const move = ev => {
		const y = ev.clientY - container.getBoundingClientRect().top + container.scrollTop - offsetY;
		div.style.top = y + 'px';

		const children = [...container.children].filter(c => c !== div);
		for (let idx = 0; idx < children.length; idx++) {
		  const child = children[idx];
		  const childTop = child.offsetTop;
		  const childHeight = child.offsetHeight;
		  if (y < childTop + childHeight / 2) {
			container.insertBefore(placeholder, child);
			currentIndex = idx;
			return;
		  }
		}
		container.appendChild(placeholder);
		currentIndex = children.length;
	  };

	  const up = () => {
		document.removeEventListener('pointermove', move);
		document.removeEventListener('pointerup', up);

		div.classList.remove('floating');
		div.style.top = '';
		div.style.left = '';
		div.style.width = '';

		placeholder.replaceWith(div);

		if (currentIndex !== startIndex) {
		  const moved = ranges.splice(startIndex, 1)[0];
		  ranges.splice(currentIndex, 0, moved);
		}

		renderRanges();
		updateStyle();
	  };

	  document.addEventListener('pointermove', move);
	  document.addEventListener('pointerup', up);
	};

    rangesDiv.appendChild(div);
  });
}

document.getElementById('addRange').onclick = () => {
  ranges.push({ min: 0, max: 100, c1: '#ff0000', a1: 0.5, c2: '#ffff00', a2: 0.5, gradient: false });
  renderRanges();
  updateStyle();
};

renderRanges();

/* ---------- Mouse hover ---------- */

const mouseInfo = document.getElementById('mouseInfo');
map.on('pointermove', e => {
  const r = elevationLayer.getRenderer();
  if (!r) return;
  const d = r.getData(map.getPixelFromCoordinate(e.coordinate));
  if (!d) return;

  let elev = (d[0] * 256 + d[1] + d[2] / 256) - 32768;
  elev = fromMeters(elev);
  const c = toLonLat(e.coordinate);

  mouseInfo.innerHTML =
    `Coordinates: ${c[1].toFixed(5)}, ${c[0].toFixed(5)}<br>` +
    `Elevation: ${elev.toFixed(1)} ${currentUnit}`;
});
