// Entry point per Phusion Passenger su SiteGround Cloud.
// Delega al server standalone generato da `next build` con
// output: 'standalone' configurato in next.config.ts.
//
// NON eseguire questo file localmente — usa `npm run start:sg`
// dopo `npm run build:sg`.

const path = require('path');
const standaloneServer = path.join(__dirname, '.next', 'standalone', 'server.js');

require(standaloneServer);
