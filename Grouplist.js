// listGroups.js
// ─────────────────────────────────────────────
// Muestra id y nombre de todos los grupos
// Uso: node listGroups.js
// Dependencias: whatsapp-web.js, qrcode-terminal
// ─────────────────────────────────────────────
import whatsappWeb from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = whatsappWeb;

// • Usamos LocalAuth con un clientId propio ("groupLister")
//   para no interferir con la sesión principal del bot.
//   Si prefieres reutilizar la misma sesión, elimina el
//   parámetro clientId y se guardará en Default.
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'groupLister' }),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', (qr) => {
  console.log('\n[WhatsApp] Escanea este código QR para autenticarte:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('\n[WhatsApp] ✅ Conectado. Listando grupos…');
  const chats   = await client.getChats();
  const groups  = chats.filter(c => c.isGroup);

  if (groups.length === 0) {
    console.log('— No se encontraron grupos en esta cuenta —');
  } else {
    groups.forEach(g => {
      // id._serialized: forma «1203…@g.us» — el identificador real del grupo
      console.log(`${g.id._serialized} | ${g.name || '(sin nombre)'}`);
    });
  }

  await client.destroy();      // cerramos sesión limpia
  process.exit(0);             // fin del script
});

client.on('auth_failure', msg => {
  console.error('[WhatsApp] ❌ Fallo de autenticación:', msg);
});

client.initialize();
