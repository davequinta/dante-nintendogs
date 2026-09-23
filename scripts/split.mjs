// Divide el index.html monolítico en módulos ES (src/*.js) + src/style.css + index.html limpio.
import fs from 'node:fs';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

const html = fs.readFileSync('index.html', 'utf8');
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1].trim() + '\n';
const js = html.match(/<script type="module">([\s\S]*)<\/script>/)[1];

// mapa sección -> archivo
const FILE_OF = [
  ['UTILS', 'utils.js'], ['AUDIO', 'audio.js'], ['SAVE (', 'state.js'], ['SCENE', 'scene.js'], ['DOG MODEL', 'dog.js'],
  ['BUBBLES', 'ai.js'], ['DOG AI', 'ai.js'], ['INTERACTIONS', 'main.js'], ['UI', 'main.js'], ['DÍA / NOCHE', 'main.js'], ['SAVE / LOAD', 'main.js'], ['LOOP', 'main.js'],
];
const ORDER = ['utils.js', 'audio.js', 'state.js', 'scene.js', 'dog.js', 'ai.js', 'main.js'];
const parts = js.split(/^\/\/ =+ /m).slice(1); // cada parte empieza con el título de sección
const files = Object.fromEntries(ORDER.map(f => [f, '']));
let imports = '';
for (const part of parts) {
  const title = part.split('\n')[0];
  const body = part.slice(title.length + 1);
  if (title.startsWith('UTILS')) { // los imports de three quedan antes del primer marcador
    const head = js.slice(0, js.indexOf('// ====')).trim();
    imports = head;
  }
  const f = FILE_OF.find(([k]) => title.startsWith(k));
  if (!f) throw new Error('sección sin archivo: ' + title);
  files[f[1]] += `// ---------- ${title.trim()}\n` + body.trimEnd() + '\n\n';
}
// three sólo lo usan scene/dog/ai/main; se importa donde haga falta
const THREE_IMPORT = "import * as THREE from 'three';\n";
const ORBIT_IMPORT = "import { OrbitControls } from 'three/addons/controls/OrbitControls.js';\n";

function topDecls(code) {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const names = new Set();
  const addPat = p => { if (!p) return; if (p.type === 'Identifier') names.add(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => addPat(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(addPat); else if (p.type === 'AssignmentPattern') addPat(p.left); else if (p.type === 'RestElement') addPat(p.argument); };
  for (const n of ast.body) {
    if (n.type === 'VariableDeclaration') n.declarations.forEach(d => addPat(d.id));
    else if (n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration') names.add(n.id.name);
  }
  return { ast, names };
}
function usedIdents(ast) {
  const used = new Set();
  walk.full(ast, n => { if (n.type === 'Identifier') used.add(n.name); });
  return used;
}
const info = {};
for (const f of ORDER) info[f] = topDecls(files[f]);
const out = {};
for (const f of ORDER) {
  const used = usedIdents(info[f].ast);
  let header = '';
  if (used.has('THREE')) header += THREE_IMPORT;
  if (used.has('OrbitControls')) header += ORBIT_IMPORT;
  for (const g of ORDER) {
    if (g === f) continue;
    const names = [...info[g].names].filter(n => used.has(n) && !info[f].names.has(n));
    if (names.length) header += `import { ${names.join(', ')} } from './${g}';\n`;
  }
  const exports = [...info[f].names];
  out[f] = header + '\n' + files[f] + (exports.length ? `export { ${exports.join(', ')} };\n` : '');
}
fs.mkdirSync('src', { recursive: true });
for (const f of ORDER) fs.writeFileSync('src/' + f, out[f]);
fs.writeFileSync('src/style.css', css);
// index.html: sin <style>, sin importmap, con el script del módulo y metadatos PWA
let page = html.replace(/<style>[\s\S]*?<\/style>/, '<link rel="stylesheet" href="./src/style.css">')
  .replace(/<script type="importmap">[\s\S]*?<\/script>\n?/, '')
  .replace(/<script type="module">[\s\S]*<\/script>/, '<script type="module" src="./src/main.js"></script>')
  .replace('<link rel="icon" href="data:,">', '<link rel="icon" href="./icons/icon-192.png">\n<link rel="apple-touch-icon" href="./icons/icon-180.png">\n<link rel="manifest" href="./manifest.webmanifest">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="description" content="Cuidá a Dante, pastor alemán de pelo largo y campeón de El Salvador. Juego web 3D estilo Nintendogs.">\n<meta property="og:title" content="Dante 🏅">\n<meta property="og:description" content="Cuidá a Dante, pastor alemán campeón de El Salvador.">\n<meta property="og:image" content="./icons/icon-512.png">');
fs.writeFileSync('index.html', page);
console.log(ORDER.map(f => `${f}: ${out[f].split('\n').length} líneas, exporta ${info[f].names.size}`).join('\n'));
