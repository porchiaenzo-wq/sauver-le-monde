// Construit js/world-map.js : un tracé SVG par grande région, à partir de Natural Earth (domaine public, via world-atlas).
// Utilisation : dans un dossier vide, « npm install world-atlas@2.0.2 topojson-client@3.1.0 d3-geo@3.1.1 »,
// puis « node tools/build-map.mjs <ce dossier> js/world-map.js ».
import { createRequire } from 'module';
import fs from 'fs';
const B = process.argv[2];
const require = createRequire(B + '/');
const topo = require(B + '/node_modules/world-atlas/countries-110m.json');
const { merge, feature } = await import(B + '/node_modules/topojson-client/src/index.js');
const d3 = await import(B + '/node_modules/d3-geo/src/index.js');

const REGIONS = {
  arctic: ['Greenland', 'Iceland'],
  northAmerica: ['Canada', 'United States of America'],
  centralAmerica: ['Mexico', 'Guatemala', 'Belize', 'Honduras', 'El Salvador', 'Nicaragua', 'Costa Rica', 'Panama', 'Cuba', 'Haiti', 'Dominican Rep.', 'Jamaica', 'Puerto Rico', 'Bahamas', 'Trinidad and Tobago'],
  southAmerica: ['Colombia', 'Venezuela', 'Guyana', 'Suriname', 'Ecuador', 'Peru', 'Brazil', 'Bolivia', 'Paraguay', 'Chile', 'Argentina', 'Uruguay', 'Falkland Is.'],
  europe: ['Norway', 'Sweden', 'Finland', 'Denmark', 'United Kingdom', 'Ireland', 'Netherlands', 'Belgium', 'Luxembourg', 'Germany', 'Poland', 'Czechia', 'Slovakia', 'Austria', 'Switzerland', 'Hungary', 'Lithuania', 'Latvia', 'Estonia', 'Belarus', 'Ukraine', 'Moldova', 'Romania', 'France', 'Slovenia', 'Croatia', 'Bosnia and Herz.', 'Serbia', 'Montenegro', 'Kosovo', 'Albania', 'Macedonia', 'Bulgaria'],
  mediterranean: ['Portugal', 'Spain', 'Italy', 'Greece', 'Cyprus', 'N. Cyprus', 'Turkey', 'Morocco', 'W. Sahara', 'Algeria', 'Tunisia', 'Libya', 'Egypt', 'Israel', 'Palestine', 'Lebanon', 'Syria', 'Jordan'],
  africa: ['Mauritania', 'Mali', 'Senegal', 'Gambia', 'Guinea-Bissau', 'Guinea', 'Sierra Leone', 'Liberia', "Côte d'Ivoire", 'Ghana', 'Togo', 'Benin', 'Burkina Faso', 'Niger', 'Nigeria', 'Chad', 'Sudan', 'S. Sudan', 'Eritrea', 'Ethiopia', 'Djibouti', 'Somalia', 'Somaliland', 'Kenya', 'Uganda', 'Rwanda', 'Burundi', 'Tanzania', 'Cameroon', 'Central African Rep.', 'Eq. Guinea', 'Gabon', 'Congo', 'Dem. Rep. Congo', 'Angola', 'Zambia', 'Malawi', 'Mozambique', 'Zimbabwe', 'Botswana', 'Namibia', 'South Africa', 'Lesotho', 'eSwatini', 'Madagascar'],
  middleEast: ['Saudi Arabia', 'Yemen', 'Oman', 'United Arab Emirates', 'Qatar', 'Kuwait', 'Iraq', 'Iran'],
  russiaCentralAsia: ['Russia', 'Kazakhstan', 'Uzbekistan', 'Turkmenistan', 'Kyrgyzstan', 'Tajikistan', 'Afghanistan', 'Georgia', 'Armenia', 'Azerbaijan'],
  southAsia: ['India', 'Pakistan', 'Bangladesh', 'Nepal', 'Bhutan', 'Sri Lanka'],
  eastAsia: ['China', 'Mongolia', 'North Korea', 'South Korea', 'Japan', 'Taiwan'],
  southeastAsia: ['Myanmar', 'Thailand', 'Laos', 'Cambodia', 'Vietnam', 'Malaysia', 'Brunei', 'Indonesia', 'Philippines', 'Timor-Leste'],
  oceania: ['Australia', 'New Zealand', 'Papua New Guinea', 'Solomon Is.', 'Vanuatu', 'Fiji', 'New Caledonia'],
  antarctica: ['Antarctica', 'Fr. S. Antarctic Lands'],
};

const geoms = topo.objects.countries.geometries;
const used = new Set(Object.values(REGIONS).flat());
const missing = geoms.map((g) => g.properties.name).filter((n) => !used.has(n));
if (missing.length) throw new Error('Pays sans région : ' + missing.join(', '));

const W = 960, H = 470;
const land = feature(topo, topo.objects.land);
const projection = d3.geoEqualEarth().fitExtent([[4, 4], [W - 4, H - 4]], land);
const round = (d) => d.replace(/(\d+\.\d)\d+/g, '$1');
const path = d3.geoPath(projection);
const out = {};
for (const [id, names] of Object.entries(REGIONS)) {
  const shape = merge(topo, geoms.filter((g) => names.includes(g.properties.name)));
  out[id] = { d: round(path(shape)), center: path.centroid(shape).map((v) => Math.round(v)) };
}
const js = `/*
 * Fond de carte : une forme par grande région, projection Equal Earth.
 * Fichier généré automatiquement à partir de Natural Earth (domaine public), via le paquet world-atlas.
 * Ne pas modifier à la main.
 */
(function (root) {
  'use strict';
  const WORLD_MAP = ${JSON.stringify({ width: W, height: H, regions: out })};
  if (typeof module !== 'undefined' && module.exports) module.exports = { WORLD_MAP };
  else root.WORLD_MAP = WORLD_MAP;
})(typeof window !== 'undefined' ? window : globalThis);
`;
fs.writeFileSync(process.argv[3], js);
console.log('ok', (js.length / 1024).toFixed(0), 'Ko');
