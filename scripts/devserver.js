// TDV dev suite server — serves the project so the creator tools and the game
// can be opened over http (avoids file:// quirks). Purely a static server.
// Development only — never part of the shipped game.
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const port = 8321;
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css',
  '.json':'application/json','.png':'image/png','.svg':'image/svg+xml',
  '.ttf':'font/ttf','.ico':'image/x-icon'};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/tools/map-creator.html';
  const file = path.join(root, p);
  if (!file.startsWith(root)) { res.statusCode = 403; res.end(); return }
  fs.readFile(file, (e, d) => {
    if (e) { res.statusCode = 404; res.end('not found'); return }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(d);
  });
});

server.listen(port, () => {
  console.log('');
  console.log('  TDV DEV SUITE');
  console.log('  -----------------------------------------------');
  console.log('  Map Creator   : http://localhost:' + port + '/tools/map-creator.html');
  console.log('  Tower Creator : http://localhost:' + port + '/tools/tower-creator.html');
  console.log('  Game          : http://localhost:' + port + '/index.html');
  console.log('');
});
